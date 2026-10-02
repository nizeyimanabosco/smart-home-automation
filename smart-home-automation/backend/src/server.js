import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import pg from "pg";

const { Pool } = pg;
const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const jwtSecret = process.env.JWT_SECRET;
const controlUsername = process.env.CONTROL_USERNAME;
const controlPassword = process.env.CONTROL_PASSWORD;
const deviceApiKeys = new Map(
  ["1", "2", "3"].map((id) => [id, process.env[`DEVICE_API_KEY_${id}`]]),
);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Configure backend/.env.");
  process.exit(1);
}

if (
  !jwtSecret || jwtSecret.length < 32 || jwtSecret.startsWith("replace-") ||
  !controlUsername || !controlPassword || controlPassword.length < 12 ||
  controlPassword.startsWith("replace-") ||
  [...deviceApiKeys.values()].some((key) => !key || key.length < 32 || key.startsWith("replace-"))
) {
  console.error("Set a random JWT_SECRET (32+ characters), CONTROL_USERNAME, a unique CONTROL_PASSWORD (12+ characters), and three unique random DEVICE_API_KEY values (32+ characters).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.set("trust proxy", 1);

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer);
}

function requireUser(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Sign in to control the lights." });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
  }
}

function requireDevice(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "This device is not authorized." });
  }

  pool.query("SELECT device_key_hash FROM lights WHERE id = $1", [req.params.id])
    .then((result) => {
      if (result.rowCount === 0 || !result.rows[0].device_key_hash) {
        return res.status(401).json({ error: "This device is not authorized." });
      }

      const suppliedHash = createHash("sha256").update(token).digest("hex");
      if (!safeEqual(suppliedHash, result.rows[0].device_key_hash)) {
        return res.status(401).json({ error: "This device is not authorized." });
      }
      next();
    })
    .catch(next);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Origin is not allowed."));
  },
  allowedHeaders: ["Authorization", "Content-Type"],
  methods: ["GET", "POST", "PUT", "OPTIONS"],
}));
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  (req, res) => {
    const username = req.body?.username;
    const password = req.body?.password;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !safeEqual(username, controlUsername) ||
      !safeEqual(password, controlPassword)
    ) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    const token = jwt.sign({ sub: controlUsername }, jwtSecret, { expiresIn: "8h" });
    res.json({ token });
  },
);

app.get("/api/lights", requireUser, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, room, is_on AS "isOn", color, device_last_seen_at AS "deviceLastSeenAt" FROM lights ORDER BY id',
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/lights", requireUser, async (req, res, next) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const room = typeof req.body?.room === "string" ? req.body.room.trim() : "";
  const color = req.body?.color ?? "#FFC857";

  if (
    name.length < 1 || name.length > 60 ||
    room.length < 1 || room.length > 60 ||
    typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)
  ) {
    return res.status(400).json({ error: "Enter a light name and room (1-60 characters) and a valid six-digit hex color." });
  }

  const id = randomUUID();
  const deviceKey = randomBytes(32).toString("base64url");
  const deviceKeyHash = createHash("sha256").update(deviceKey).digest("hex");

  try {
    const result = await pool.query(
      'INSERT INTO lights (id, name, room, color, device_key_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, room, is_on AS "isOn", color, device_last_seen_at AS "deviceLastSeenAt"',
      [id, name, room, color.toUpperCase(), deviceKeyHash],
    );
    res.status(201).json({ light: result.rows[0], deviceKey });
  } catch (error) {
    next(error);
  }
});

app.put("/api/lights/:id", requireUser, async (req, res, next) => {
  const { isOn, color } = req.body ?? {};
  if (
    (isOn === undefined && color === undefined) ||
    (isOn !== undefined && typeof isOn !== "boolean") ||
    (color !== undefined && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)))
  ) {
    return res.status(400).json({ error: "Provide a boolean isOn value or a six-digit hex color." });
  }

  const values = [];
  const updates = [];
  if (isOn !== undefined) {
    values.push(isOn);
    updates.push(`is_on = $${values.length}`);
  }
  if (color !== undefined) {
    values.push(color.toUpperCase());
    updates.push(`color = $${values.length}`);
  }
  values.push(req.params.id);

  try {
    const result = await pool.query(
      `UPDATE lights SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, name, room, is_on AS "isOn", color, device_last_seen_at AS "deviceLastSeenAt"`,
      values,
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Light not found." });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.put("/api/lights", requireUser, async (req, res, next) => {
  if (typeof req.body?.isOn !== "boolean") {
    return res.status(400).json({ error: "isOn must be a boolean." });
  }

  try {
    const result = await pool.query(
      'UPDATE lights SET is_on = $1, updated_at = NOW() RETURNING id, name, room, is_on AS "isOn", color, device_last_seen_at AS "deviceLastSeenAt"',
      [req.body.isOn],
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/device/lights/:id/state", requireDevice, async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE lights SET device_last_seen_at = NOW() WHERE id = $1 RETURNING id, is_on AS "isOn", color',
      [req.params.id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Light not found." });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error("API request failed:", error);
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).json({ error: "The request could not be completed." });
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lights (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room TEXT NOT NULL,
      is_on BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE lights ADD COLUMN IF NOT EXISTS color CHAR(7) NOT NULL DEFAULT '#FFC857'");
  await pool.query("ALTER TABLE lights ADD COLUMN IF NOT EXISTS device_last_seen_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE lights ADD COLUMN IF NOT EXISTS device_key_hash TEXT");
  const initialLights = [
    ["1", "Living room", "Downstairs"],
    ["2", "Kitchen", "Downstairs"],
    ["3", "Bedroom", "Upstairs"],
  ];
  for (const [id, name, room] of initialLights) {
    const legacyDeviceKey = deviceApiKeys.get(id);
    const deviceKeyHash = createHash("sha256").update(legacyDeviceKey).digest("hex");
    await pool.query(
      "INSERT INTO lights (id, name, room, device_key_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET device_key_hash = COALESCE(lights.device_key_hash, EXCLUDED.device_key_hash)",
      [id, name, room, deviceKeyHash],
    );
  }

  app.listen(port, () => {
    console.log(`Smart home API listening on http://localhost:${port}`);
  });
}

start().catch(async (error) => {
  console.error("Could not start the API or initialize the database:", error);
  await pool.end();
  process.exitCode = 1;
});
