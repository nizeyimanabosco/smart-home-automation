# ESP32 RGB light

Each ESP32 polls the cloud API for the saved on/off state and color of one
light. Use one board per light; set `LIGHT_ID` in the sketch to `1`, `2`, or
`3` to match Living room, Kitchen, or Bedroom in the dashboard.

## Configure

1. Install Arduino IDE, the ESP32 board support package, and ArduinoJson 7.
2. Copy `secrets.example.h` to `secrets.h`. Enter the Wi-Fi details, the
   Render API URL, and the matching per-light `DEVICE_API_KEY_1`, `_2`, or
   `_3` from the API environment. `secrets.h` is ignored by Git.
3. Set `LIGHT_ID` in the sketch for this board and upload it.
4. Select the correct GPIO pins and common-anode setting for the LED hardware.

Use a low-voltage RGB LED and suitable current limiting, or a correctly rated
MOSFET driver for a low-voltage LED strip. Never connect an LED strip or a
mains-powered lamp directly to ESP32 GPIO pins. Have mains-powered wiring
installed by a qualified electrician.

The device polls every five seconds. A Render free web service can sleep after
inactivity, so the first request after it sleeps may take longer while it
starts back up.
