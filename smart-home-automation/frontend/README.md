# Smart Home Lights

React dashboard, Node API, PostgreSQL storage, and optional ESP32 RGB light
devices. A user signs in to the dashboard, sets the color or on/off state for
each light, and the matching ESP32 polls the API for that state.

## Run locally

1. In PostgreSQL, create a database named `smart_home`.
2. Copy `backend/.env.example` to `backend/.env`.
3. Fill in the PostgreSQL connection string and replace every example
   password/key with a unique secret. Keep `.env` private; it is Git-ignored.
4. From this folder, install dependencies and start the API and web app:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL shown in the terminal. The API initializes the lights table
when it first connects to PostgreSQL. The dashboard login uses
`CONTROL_USERNAME` and `CONTROL_PASSWORD` from `backend/.env`.

To check the production frontend build, run `npm.cmd run build`.

## Deploy the app

The repository includes a Render Blueprint at the repository root and Vercel
settings in `vercel.json`.

1. Commit and push the project to GitHub. Do not commit `.env` or
   `device/esp32-rgb-light/secrets.h`.
2. In Render, create a Blueprint from the repository root using `render.yaml`
   and review its free PostgreSQL and web-service resources. Enter a strong
   dashboard username and password when prompted. Render generates the JWT
   and three per-device keys.
3. Copy the deployed API URL, such as `https://smart-home-api.onrender.com`.
4. In Vercel, import the same repository and set the project root to
   `smart-home-automation`. The checked-in `vercel.json` sets the build output
   to `frontend/dist`. Add `VITE_API_URL` as a Vercel environment variable
   with the Render API URL, then deploy.
5. Copy the Vercel production URL. In the Render API's environment settings,
   set `FRONTEND_ORIGIN` to that exact URL, then redeploy the API.
6. Sign in using the username and password entered in Render.
7. Copy each `DEVICE_API_KEY_1`, `_2`, or `_3` from Render into the matching
   ESP32's ignored `secrets.h` file. Configure the API URL and Wi-Fi details,
   then upload the sketch.

Render's free PostgreSQL database expires after 30 days; it is for testing,
not long-term home automation. Free Render web services can sleep while
idle, making the first request slower. Choose persistent paid hosting before
relying on this to control lights remotely.

## ESP32 RGB lights

See [`device/esp32-rgb-light/README.md`](../device/esp32-rgb-light/README.md)
for Arduino setup, per-light IDs and keys, and safe low-voltage LED hardware
notes. Use one ESP32 per light. The API stores the requested state; the ESP32
polls that state and drives the RGB output. The web app alone does not switch
physical bulbs.

Keep PostgreSQL, JWT, dashboard-password, and ESP32 keys private. Never add
`.env` or `device/esp32-rgb-light/secrets.h` to a commit.
