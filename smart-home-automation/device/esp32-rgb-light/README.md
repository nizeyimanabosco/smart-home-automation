# ESP32 RGB light

Each ESP32 polls the cloud API for the saved on/off state and color of one
light. Use one board per light. The first three seeded lights have IDs `1`,
`2`, and `3`; lights added from the dashboard have a generated ID shown with
their one-time device key.

## Configure

1. Install Arduino IDE, the ESP32 board support package, and ArduinoJson 7.
2. Add the light in the dashboard, then save the displayed light ID and
   one-time device key. For the original three lights, use the matching
   `DEVICE_API_KEY_1`, `_2`, or `_3` from the API environment.
3. Copy `secrets.example.h` to `secrets.h`. Enter the Wi-Fi details, Render
   API URL, and device key. `secrets.h` is ignored by Git.
4. Set `LIGHT_ID` in the sketch to the ID shown by the dashboard and upload it.
5. Select the correct GPIO pins and common-anode setting for the LED hardware.

Use a low-voltage RGB LED and suitable current limiting, or a correctly rated
MOSFET driver for a low-voltage LED strip. Never connect an LED strip or a
mains-powered lamp directly to ESP32 GPIO pins. Have mains-powered wiring
installed by a qualified electrician.

The device polls every five seconds. A Render free web service can sleep after
inactivity, so the first request after it sleeps may take longer while it
starts back up.
