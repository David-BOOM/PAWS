# Smart Pet Care Hardware Wiring

| Subsystem        | Component                 | Arduino Pin(s)     | Notes                                    |
| ---------------- | ------------------------- | ------------------ | ---------------------------------------- |
| WiFi Backhaul    | ESP8266 TX/RX             | RX1 (19), TX1 (18) | Serial1 @ 115200 baud, common 3.3V + GND |
| Status Lighting  | NeoPixel strip data       | D4                 | Powered from 5V rail, share ground       |
| Motion Detection | HC-SR04 Trigger / Echo    | D2 / D3            | Provides range data for the entry light  |
| Water Monitoring | Float / optical switch    | D7 (INPUT_PULLUP)  | LOW = “water low”                        |
| Feeder Mechanics | Stepper driver inputs     | D8, D10, D9, D11   | ULN2003 sequence for 28BYJ-48 motor      |
| Feeder Buzzer    | Piezo buzzer              | D12                | Active HIGH chirp notifications          |
| Feeder Load Cell | HX711 DT / SCK            | A5 / A6            | Calibrated for bowl weight               |
| Bark Detection   | Analog mic output         | A0                 | GAIN pin D6 (HIGH), AUTO-R pin D5 (LOW)  |
| Air Quality      | VOC analog sensor         | A2                 | 0–5 V input, mapped to VOC + AQI         |
| Temperature      | Analog temperature sensor | A1                 | LM35-style 10 mV/°C                      |
| Ventilation      | Fan MOSFET gate           | D22                | Active LOW (LOW = fan ON)                |
| Activity Scale   | HX711 DT / SCK            | A3 / A4            | Tracks pet presence + live weight        |

> **Power:** All sensors share the Mega’s 5V/3.3V rails and common ground. Keep the HX711 boards on the same 5V + GND pair as their respective load cells, and inject 5V to the NeoPixel strip directly (do not power from a digital pin).
