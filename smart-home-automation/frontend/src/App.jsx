import { useEffect, useRef, useState } from "react";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(username, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <a className="brand" href="/" aria-label="Home">
          <span className="brand-mark" aria-hidden="true">⌂</span>
          <span>nest<span className="brand-light">light</span></span>
        </a>
        <p className="eyebrow">SMART HOME</p>
        <h1>Welcome home</h1>
        <p className="summary">Sign in to control your lights.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button button-on login-button" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function AddLightForm({ onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [color, setColor] = useState("#FFC857");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onCreate({ name, room, color });
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="add-light-panel" aria-labelledby="add-light-heading">
      <div>
        <p className="eyebrow">PAIR A NEW ESP32</p>
        <h2 id="add-light-heading">Add a light</h2>
        <p className="summary">Create a light, then copy its unique key into that device.</p>
      </div>
      <form className="add-light-form" onSubmit={submit}>
        <label>
          Light name
          <input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Hallway" required />
        </label>
        <label>
          Room
          <input maxLength={60} value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Upstairs" required />
        </label>
        <label className="new-light-color">
          Color
          <input type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} />
        </label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="button button-on" type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add light"}
          </button>
          <button className="button button-off" type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("smart-home-token") ?? "");
  const [lights, setLights] = useState([]);
  const [colorDrafts, setColorDrafts] = useState({});
  const [pendingIds, setPendingIds] = useState([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [showAddLight, setShowAddLight] = useState(false);
  const [newDevice, setNewDevice] = useState(null);
  const lightsRef = useRef(lights);
  const activeCount = lights.filter((light) => light.isOn).length;

  useEffect(() => {
    lightsRef.current = lights;
  }, [lights]);

  function signOut() {
    sessionStorage.removeItem("smart-home-token");
    setToken("");
    setLights([]);
    setColorDrafts({});
    setError("");
    setConnectionError(false);
    setShowAddLight(false);
    setNewDevice(null);
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);

    apiRequest("/api/lights", token, { signal: controller.signal })
      .then((loadedLights) => {
        setLights(loadedLights);
        setColorDrafts(Object.fromEntries(loadedLights.map((light) => [light.id, light.color])));
        setError("");
        setConnectionError(false);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError.message);
          setConnectionError(true);
          if (loadError.status === 401) {
            signOut();
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token || loading || pendingIds.length > 0 || bulkPending) {
      return undefined;
    }

    let requestInProgress = false;
    const controller = new AbortController();
    const interval = window.setInterval(async () => {
      if (requestInProgress) {
        return;
      }
      requestInProgress = true;
      try {
        const latestLights = await apiRequest("/api/lights", token, {
          signal: controller.signal,
        });
        setConnectionError(false);
        setError("");
        setLights((current) =>
          JSON.stringify(current) === JSON.stringify(latestLights) ? current : latestLights,
        );
        setColorDrafts((current) => Object.fromEntries(
          latestLights.map((light) => {
            const savedColor = lightsRef.current.find((item) => item.id === light.id)?.color;
            const draft = current[light.id];
            return [light.id, draft && draft !== savedColor ? draft : light.color];
          }),
        ));
      } catch (refreshError) {
        if (!controller.signal.aborted) {
          setError(refreshError.message);
          setConnectionError(true);
          if (refreshError.status === 401) {
            signOut();
          }
        }
      } finally {
        requestInProgress = false;
      }
    }, 10000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [token, loading, pendingIds.length, bulkPending]);

  async function signIn(username, password) {
    const result = await apiRequest("/api/auth/login", "", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    sessionStorage.setItem("smart-home-token", result.token);
    setToken(result.token);
  }

  async function addLight({ name, room, color }) {
    setError("");
    const result = await apiRequest("/api/lights", token, {
      method: "POST",
      body: JSON.stringify({ name, room, color }),
    });
    setLights((current) => [...current, result.light]);
    setColorDrafts((current) => ({ ...current, [result.light.id]: result.light.color }));
    setNewDevice({ id: result.light.id, name: result.light.name, deviceKey: result.deviceKey });
    setShowAddLight(false);
  }

  async function copyDeviceKey() {
    if (!newDevice) {
      return;
    }
    try {
      await navigator.clipboard.writeText(newDevice.deviceKey);
      setError("");
    } catch {
      setError("Could not copy automatically. Select and copy the device key below.");
    }
  }

  async function updateLight(lightId, changes) {
    const updatedLight = await apiRequest(`/api/lights/${lightId}`, token, {
      method: "PUT",
      body: JSON.stringify(changes),
    });
    setLights((current) =>
      current.map((light) => light.id === updatedLight.id ? updatedLight : light),
    );
    setColorDrafts((current) => ({ ...current, [updatedLight.id]: updatedLight.color }));
    setConnectionError(false);
    setError("");
  }

  async function runLightUpdate(lightId, changes) {
    setPendingIds((current) => [...current, lightId]);
    setError("");
    try {
      await updateLight(lightId, changes);
    } catch (updateError) {
      setError(updateError.message);
      setConnectionError(true);
      if (updateError.status === 401) {
        signOut();
      }
    } finally {
      setPendingIds((current) => current.filter((id) => id !== lightId));
    }
  }

  async function setAllLights(isOn) {
    setBulkPending(true);
    setError("");
    try {
      const updatedLights = await apiRequest("/api/lights", token, {
        method: "PUT",
        body: JSON.stringify({ isOn }),
      });
      setLights(updatedLights);
      setColorDrafts((current) => ({
        ...current,
        ...Object.fromEntries(updatedLights.map((light) => [light.id, light.color])),
      }));
      setConnectionError(false);
      setError("");
    } catch (updateError) {
      setError(updateError.message);
      setConnectionError(true);
      if (updateError.status === 401) {
        signOut();
      }
    } finally {
      setBulkPending(false);
    }
  }

  if (!token) {
    return <Login onLogin={signIn} />;
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Home">
          <span className="brand-mark" aria-hidden="true">⌂</span>
          <span>nest<span className="brand-light">light</span></span>
        </a>
        <div className="account-actions">
          <span className="connection">
            <span className={loading || connectionError ? "connection-waiting" : ""} />
            {loading ? "Connecting to database" : connectionError ? "Connection issue" : "PostgreSQL connected"}
          </span>
          <button className="sign-out" type="button" onClick={() => setShowAddLight((shown) => !shown)}>
            {showAddLight ? "Cancel add" : "Add light"}
          </button>
          <button className="sign-out" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">YOUR HOME</p>
        <h1 id="page-title">Lighting</h1>
        <p className="summary">{activeCount} of {lights.length} lights on</p>
      </section>

      <section className="controls" aria-label="Control all lights">
        <span className="controls-label">Quick controls</span>
        <div className="control-buttons">
          <button type="button" className="button button-on" disabled={loading || bulkPending || pendingIds.length > 0} onClick={() => setAllLights(true)}>
            Turn all on
          </button>
          <button type="button" className="button button-off" disabled={loading || bulkPending || pendingIds.length > 0} onClick={() => setAllLights(false)}>
            Turn all off
          </button>
        </div>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}

      {showAddLight && (
        <AddLightForm
          onCreate={addLight}
          onCancel={() => setShowAddLight(false)}
        />
      )}

      {newDevice && (
        <section className="device-key-panel" aria-labelledby="device-key-heading">
          <div className="device-key-copy">
            <p className="eyebrow">SAVE THIS KEY NOW</p>
            <h2 id="device-key-heading">Pair {newDevice.name}</h2>
            <p>This key is only shown once. Put it in that ESP32&apos;s private <code>secrets.h</code> file with this light ID.</p>
            <dl className="device-credentials">
              <div><dt>Light ID</dt><dd><code>{newDevice.id}</code></dd></div>
              <div><dt>Device API key</dt><dd><code className="device-key">{newDevice.deviceKey}</code></dd></div>
            </dl>
          </div>
          <div className="form-actions">
            <button className="button button-on" type="button" onClick={copyDeviceKey}>Copy key</button>
            <button className="button button-off" type="button" onClick={() => setNewDevice(null)}>Done</button>
          </div>
        </section>
      )}

      <section className="light-grid" aria-label="Individual lights">
        {loading ? (
          <p className="loading-message">Loading lights...</p>
        ) : lights.map((light) => {
          const colorDraft = colorDrafts[light.id] ?? light.color;
          const pending = bulkPending || pendingIds.includes(light.id);
          const deviceOnline = light.deviceLastSeenAt &&
            Date.now() - Date.parse(light.deviceLastSeenAt) < 20000;
          return (
            <article
              className={`light-card${light.isOn ? " is-on" : ""}`}
              key={light.id}
              style={{ "--bulb-color": light.color }}
            >
              <div className="card-top">
                <span className="light-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M16 29c-1.4-1.7-2.2-3.8-2.2-6.1a10.2 10.2 0 1 1 20.4 0c0 2.3-.8 4.4-2.2 6.1-1.3 1.6-2.2 2.6-2.5 4H18.5c-.3-1.4-1.2-2.4-2.5-4Z" />
                    <path d="M19 37h10M20.5 41h7" />
                  </svg>
                </span>
                <span className={`status${light.isOn ? " status-on" : ""}`}>
                  {light.isOn ? "ON" : "OFF"}
                </span>
              </div>
              <div className="card-details">
                <p className="room">{light.room}</p>
                <h2>{light.name}</h2>
                <p className={`device-status${deviceOnline ? " device-online" : ""}`}>
                  <span />
                  {deviceOnline ? "ESP32 online" : "ESP32 not connected"}
                </p>
              </div>
              <div className="light-actions">
                <label className="color-picker" htmlFor={`color-${light.id}`}>
                  <span>Color</span>
                  <input
                    id={`color-${light.id}`}
                    type="color"
                    value={colorDraft}
                    disabled={pending}
                    onChange={(event) => setColorDrafts((current) => ({
                      ...current,
                      [light.id]: event.target.value.toUpperCase(),
                    }))}
                    aria-label={`Choose ${light.name} light color`}
                  />
                </label>
                <button
                  type="button"
                  className="apply-color"
                  disabled={pending || colorDraft === light.color}
                  onClick={() => runLightUpdate(light.id, { color: colorDraft })}
                >
                  Apply color
                </button>
                <button
                  type="button"
                  className={`toggle${light.isOn ? " toggle-on" : ""}`}
                  role="switch"
                  aria-checked={light.isOn}
                  aria-label={`${light.isOn ? "Turn off" : "Turn on"} ${light.name} light`}
                  disabled={pending}
                  onClick={() => runLightUpdate(light.id, { isOn: !light.isOn })}
                >
                  <span />
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <footer className="footer">
        <span className="footer-dot" />
        Colors and on/off states sync to PostgreSQL; ESP32 devices apply changes to low-voltage lights
      </footer>
    </main>
  );
}
