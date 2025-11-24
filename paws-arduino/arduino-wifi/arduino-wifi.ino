/*
 * Arduino Mega 2560 + ESP8266 WiFi data uploader
 * ------------------------------------------------
 *  - Uses Serial1 for ESP8266 (pins 18/19)
 *  - Reads Wi-Fi / server secrets from include/generated-secrets.h
 *  - Collects sensor readings (replace stubs with your actual sensors)
 *  - Sends JSON payloads to the local Node.js JSON database via HTTP PATCH
 */

#include "WiFiEsp.h"
#include "./include/generated-secrets.h"

#ifndef HAVE_HWSERIAL1
  #error "This sketch requires HardwareSerial1 (e.g., Arduino Mega 2560)"
#endif

// --- Configuration ---------------------------------------------------------

static constexpr unsigned long kSampleIntervalMs = 5000UL; // 5 seconds
static constexpr uint32_t kEspBaudRate = 115200;
static constexpr char kTargetEndpoint[] = "/api/files/environment-current";

// Optional: map analog pins used for mock data (replace with your sensors)
static constexpr uint8_t PIN_LIGHT_SENSOR = A0;
static constexpr uint8_t PIN_WATER_SENSOR = A1;
static constexpr uint8_t PIN_WEIGHT_SENSOR = A2;

WiFiEspClient client;
unsigned long lastUploadMs = 0;

// --- Sensor placeholders ---------------------------------------------------

float readTemperatureCelsius() {
  // TODO: Replace with the real temperature sensor read (e.g., DHT, DS18B20)
  return 24.0f + (analogRead(PIN_LIGHT_SENSOR) / 1023.0f) * 6.0f;
}

float readHumidityPercent() {
  // TODO: Replace with the real humidity sensor read
  return 55.0f + (analogRead(PIN_LIGHT_SENSOR) / 1023.0f) * 10.0f;
}

int readLightLevelRaw() {
  // Example: LDR connected to analog pin
  return analogRead(PIN_LIGHT_SENSOR);
}

int readVocPpb() {
  // TODO: Replace with VOC sensor logic (e.g., CCS811)
  return 150 + (analogRead(PIN_LIGHT_SENSOR) % 50);
}

int readCo2Ppm() {
  // TODO: Replace with CO2 sensor logic (e.g., MH-Z19)
  return 600 + (analogRead(PIN_LIGHT_SENSOR) % 120);
}

float readMethanalPpb() {
  // TODO: Replace with formaldehyde sensor logic
  return 45.0f + (analogRead(PIN_LIGHT_SENSOR) / 1023.0f) * 10.0f;
}

bool isWaterLevelLow() {
  // Water float switch / digital sensor: LOW = water present?, adjust to your wiring
  return digitalRead(PIN_WATER_SENSOR) == LOW;
}

String readWaterLevelState() {
  return isWaterLevelLow() ? String(F("low")) : String(F("high"));
}

float readPetWeightKg() {
  // TODO: Replace with actual load-cell reading (e.g., HX711). This stub simulates 8-13 kg.
  const int raw = analogRead(PIN_WEIGHT_SENSOR);
  return 8.0f + (raw / 1023.0f) * 5.0f;
}

// --- Networking helpers ----------------------------------------------------

void printWifiStatus() {
  Serial.print(F("SSID: "));
  Serial.println(WiFi.SSID());

  Serial.print(F("IP Address: "));
  Serial.println(WiFi.localIP());

  Serial.print(F("Signal strength (RSSI): "));
  Serial.print(WiFi.RSSI());
  Serial.println(F(" dBm"));
}

void ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print(F("Connecting to WiFi SSID: "));
  Serial.println(SECRET_WIFI_SSID);

  while (WiFi.status() != WL_CONNECTED) {
    int status = WiFi.begin(SECRET_WIFI_SSID, SECRET_WIFI_PASS);
    if (status == WL_CONNECTED) {
      Serial.println(F("WiFi connected."));
      printWifiStatus();
      break;
    }

    Serial.println(F("Retrying WiFi connection in 2 seconds..."));
    delay(2000);
  }
}

String buildSensorJsonPayload() {
  const float temperature = readTemperatureCelsius();
  const float humidity = readHumidityPercent();
  const int lightLevel = readLightLevelRaw();
  const int voc = readVocPpb();
  const int co2 = readCo2Ppm();
  const float methanal = readMethanalPpb();
  const bool waterLow = isWaterLevelLow();
  const int waterLevel = waterLow ? 0 : 100;
  const String waterState = readWaterLevelState();
  const float petWeight = readPetWeightKg();

  String payload;
  payload.reserve(256);
  payload += F("{");
  payload += F("\"temperature\": ");
  payload += String(temperature, 2);
  payload += F(", \"humidity\": ");
  payload += String(humidity, 1);
  payload += F(", \"light\": ");
  payload += lightLevel;
  payload += F(", \"voc\": ");
  payload += voc;
  payload += F(", \"co2\": ");
  payload += co2;
  payload += F(", \"methanal\": ");
  payload += String(methanal, 2);
  payload += F(", \"waterLevel\": ");
  payload += waterLevel;
  payload += F(", \"waterLevelState\": \"");
  payload += waterState;
  payload += F("\"");
  payload += F(", \"petWeight\": ");
  payload += String(petWeight, 2);
  payload += F("}");

  return payload;
}

void logServerResponse() {
  unsigned long start = millis();
  while (client.connected() && millis() - start < 2000UL) {
    while (client.available()) {
      Serial.write(client.read());
      start = millis(); // Reset timeout whenever data arrives
    }
  }
}

bool postJsonToServer(const String &payload) {
  Serial.print(F("Connecting to server "));
  Serial.print(SECRET_SERVER_HOST);
  Serial.print(F(":"));
  Serial.println(SECRET_SERVER_PORT);

  client.stop();
  if (!client.connect(SECRET_SERVER_HOST, SECRET_SERVER_PORT)) {
    Serial.println(F("[Error] Unable to connect to server"));
    return false;
  }

  Serial.println(F("Connected. Sending payload..."));

  client.print(F("PATCH "));
  client.print(kTargetEndpoint);
  client.println(F(" HTTP/1.1"));

  client.print(F("Host: "));
  client.println(SECRET_SERVER_HOST);

  client.println(F("User-Agent: Arduino-WiFiEsp/1.0"));
  client.println(F("Content-Type: application/json"));
  client.println(F("Connection: close"));

  client.print(F("Content-Length: "));
  client.println(payload.length());
  client.println(); // End of headers
  client.print(payload);

  logServerResponse();
  client.stop();
  Serial.println(F("Payload delivered."));
  Serial.println(payload);
  return true;
}

// --- Arduino lifecycle -----------------------------------------------------

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    ;
  }

  Serial1.begin(kEspBaudRate);
  WiFi.init(&Serial1);

  pinMode(PIN_WATER_SENSOR, INPUT_PULLUP);
  pinMode(PIN_WEIGHT_SENSOR, INPUT);

  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println(F("ESP8266 shield not detected. Halt."));
    while (true) {
      delay(1000);
    }
  }

  ensureWifiConnected();
}

void loop() {
  if (millis() - lastUploadMs >= kSampleIntervalMs) {
    ensureWifiConnected();
    const String payload = buildSensorJsonPayload();
    if (postJsonToServer(payload)) {
      lastUploadMs = millis();
    }
  }
}