/*
 * Smart Pet Care System + WiFi Uploader
 * --------------------------------------
 *  - Runs the full hardware automation stack (motion light, feeder, bark detection, sensors)
 *  - Streams summarized telemetry to the PAWS local server via ESP8266 (Serial1)
 */

#include <Stepper.h>
#include <HX711.h>
#include <Adafruit_NeoPixel.h>
#include "WiFiEsp.h"
#include "./include/generated-secrets.h"

#ifndef HAVE_HWSERIAL1
  #error "This sketch requires HardwareSerial1 (e.g., Arduino Mega 2560)"
#endif

// === WiFi uploader config ===
static constexpr unsigned long kSampleIntervalMs = 5000UL;
static constexpr uint32_t kEspBaudRate = 115200;
static constexpr char kTargetEndpoint[] = "/api/files/environment-current";

WiFiEspClient client;
unsigned long lastUploadMs = 0;

// ===================================================================
// SMART PET CARE SYSTEM - WITH MOTION DETECTION LIGHT
// Water Monitoring + Feeding + Bark Detection + Air Quality + Activity + Motion Light
// ===================================================================

#include <Arduino.h>

// === NEOPIXEL SETUP ===
Adafruit_NeoPixel strip = Adafruit_NeoPixel(12, 4, NEO_GRB + NEO_KHZ800);

// === PIN DEFINITIONS ===
// Water Sensor
#define WATER_SENSOR_PIN 7

// Ultrasonic Sensor (Motion Detection Light)
#define TRIG_PIN 2
#define ECHO_PIN 3

// Feeder System
#define FEEDER_LOADCELL_DT_PIN A5
#define FEEDER_LOADCELL_SCK_PIN A6
#define FEEDER_BUZZER_PIN 12
const int stepsPerRevolution = 2048;
const int stepsFor45Degrees = stepsPerRevolution / 8;
Stepper myStepper(stepsPerRevolution, 8, 10, 9, 11);

// Bark Detection
#define MIC_OUT_PIN A0
#define MIC_GAIN_PIN 6
#define MIC_AR_PIN 5

// Air Quality & Activity
#define FAN_CONTROL_PIN 22
#define VOC_SENSOR_PIN A2
#define TEMP_SENSOR_PIN A1
#define ACTIVITY_LOADCELL_DT_PIN A3
#define ACTIVITY_LOADCELL_SCK_PIN A4

// === SYSTEM INSTANCES ===
HX711 feederScale;
HX711 activityScale;

// === WATER SENSOR VARIABLES ===
bool waterMessageShown = false;

// === MOTION DETECTION LIGHT VARIABLES ===
const float MOTION_THRESHOLD = 10.0; // 10 cm detection range
bool lightOn = false;
unsigned long lightOnTime = 0;
const unsigned long LIGHT_DURATION = 5000; // Stay on for 5 seconds after detection

// === FEEDER VARIABLES ===
float feederTargetWeight = 100.0;
float feederCurrentWeight = 0.0;
float feederCalibrationFactor = -1;
bool feedingInProgress = false;
bool feedingRequested = false;
unsigned long feedingStartTime = 0;
const unsigned long maxFeedingDuration = 120000;
const unsigned long weightCheckDelay = 2000;

// === BARK DETECTION VARIABLES ===
const int BARK_THRESHOLD = 300;
const int BACKGROUND_SAMPLES = 100;
const unsigned long BARK_MIN_DURATION = 50;
const unsigned long BARK_MAX_DURATION = 3000;
const int REQUIRED_BARK_COUNT = 5;
const unsigned long BARK_WINDOW = 10000;
const unsigned long BARK_LED_ON_TIME = 5000;

int background_level = 0;
int dynamic_threshold = BARK_THRESHOLD;
unsigned long bark_start_time = 0;
unsigned long last_bark_time = 0;
unsigned long bark_led_on_start = 0;
bool bark_detected = false;
bool bark_led_is_on = false;
bool bark_in_progress = false;
int bark_count = 0;
unsigned long first_bark_time = 0;
unsigned long bark_times[REQUIRED_BARK_COUNT];
const int SAMPLE_WINDOW = 50;
unsigned int sample;

// === AIR QUALITY VARIABLES ===
const float TEMP_FAN_ON = 28.0;
const float VOC_GOOD_MAX = 1.5;
const float VOC_POOR_MIN = 3.0;
const float WEIGHT_THRESHOLD = 25;
const int STABLE_NEEDED = 6;
const int FLUCTUATION_WINDOW = 5;
const unsigned long ENV_INTERVAL = 5000;
const unsigned long SLEEP_INTERVAL = 1000;
const unsigned long WARMUP_TIME = 30000;

unsigned long last_env = 0;
unsigned long last_sleep_check = 0;
bool warmed_up = false;
bool fan_on = false;
bool pet_sleeping = false;
float activityCalibrationFactor = 190.0;
float weight_buffer[FLUCTUATION_WINDOW];
int buffer_index = 0;
bool buffer_full = false;
int stable_count = 0;

// === Telemetry mirrors for WiFi payloads ===
float lastTemperatureC = 25.0f;
float lastVocVoltage = 0.0f;
float lastHumidityPercent = 55.0f;
float lastMotionDistanceCm = 0.0f;
bool lastMotionLightOn = false;
bool lastWaterLow = false;
float lastActivityWeight = 0.0f;
bool lastBarkAlert = false;
String lastAqiLabel = "Good";

// === MOTION DETECTION LIGHT FUNCTIONS ===
float getDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = (duration * 0.034) / 2; // Convert to centimeters
  return distance;
}

void handleMotionLight() {
  float distance = getDistance();
  if (distance > 0) {
    lastMotionDistanceCm = distance;
  }

  if (distance > 0 && distance < MOTION_THRESHOLD) {
    if (!lightOn) {
      for (int i = 0; i < 12; i++) {
        strip.setPixelColor(i, strip.Color(255, 255, 255));
      }
      strip.show();
      lightOn = true;
      Serial.print("MOTION LIGHT: ON - Object at ");
      Serial.print(distance, 1);
      Serial.println(" cm");
    }
    lightOnTime = millis();
  }

  if (lightOn && (millis() - lightOnTime >= LIGHT_DURATION)) {
    for (int i = 0; i < 12; i++) {
      strip.setPixelColor(i, strip.Color(0, 0, 0));
    }
    strip.show();
    lightOn = false;
    Serial.println("MOTION LIGHT: OFF - No motion detected");
  }

  lastMotionLightOn = lightOn;
}

// === WiFi helpers ===
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

float gramsToKg(float grams) {
  if (grams <= 0) {
    return 0.0f;
  }
  return grams / 1000.0f;
}

float estimateHumidityPercent() {
  int raw = analogRead(VOC_SENSOR_PIN);
  float humidity = 45.0f + (raw / 1023.0f) * 20.0f;
  humidity = constrain(humidity, 35.0f, 75.0f);
  return humidity;
}

String currentFeederStatus() {
  if (feedingInProgress) {
    return "feeding";
  }
  if (feedingRequested) {
    return "queued";
  }
  return "idle";
}

String buildSensorJsonPayload() {
  lastHumidityPercent = estimateHumidityPercent();
  if (lastActivityWeight <= 0) {
    lastActivityWeight = readActivityWeight();
  }
  const float petWeightKg = gramsToKg(lastActivityWeight);
  const float vocPpb = lastVocVoltage * 1000.0f;
  const int co2Ppm = 500 + static_cast<int>(lastVocVoltage * 120.0f);
  const float methanalPpb = 25.0f + lastVocVoltage * 8.0f;
  const int waterLevelPercent = lastWaterLow ? 0 : 100;

  String payload;
  payload.reserve(512);
  payload += F("{");
  payload += F("\"temperature\": ");
  payload += String(lastTemperatureC, 1);
  payload += F(", \"humidity\": ");
  payload += String(lastHumidityPercent, 1);
  payload += F(", \"voc\": ");
  payload += String(vocPpb, 1);
  payload += F(", \"co2\": ");
  payload += co2Ppm;
  payload += F(", \"methanal\": ");
  payload += String(methanalPpb, 1);
  payload += F(", \"aqi\": \"");
  payload += lastAqiLabel;
  payload += F("\"");
  payload += F(", \"fanOn\": ");
  payload += fan_on ? F("true") : F("false");
  payload += F(", \"motionLightOn\": ");
  payload += lastMotionLightOn ? F("true") : F("false");
  payload += F(", \"motionDistanceCm\": ");
  payload += String(lastMotionDistanceCm, 1);
  payload += F(", \"waterLevel\": ");
  payload += waterLevelPercent;
  payload += F(", \"waterLevelState\": \"");
  payload += lastWaterLow ? F("low") : F("high");
  payload += F("\"");
  payload += F(", \"petWeight\": ");
  payload += String(petWeightKg, 3);
  payload += F(", \"activityWeight\": ");
  payload += String(lastActivityWeight, 1);
  payload += F(", \"barkAlertActive\": ");
  payload += lastBarkAlert ? F("true") : F("false");
  payload += F(", \"barkCount\": ");
  payload += bark_count;
  payload += F(", \"feedingStatus\": \"");
  payload += currentFeederStatus();
  payload += F("\"");
  payload += F(", \"feederCurrentWeight\": ");
  payload += String(feederCurrentWeight, 1);
  payload += F(", \"feederTargetWeight\": ");
  payload += String(feederTargetWeight, 1);
  payload += F(", \"feedingInProgress\": ");
  payload += feedingInProgress ? F("true") : F("false");
  payload += F(", \"petSleeping\": ");
  payload += pet_sleeping ? F("true") : F("false");
  payload += F("}");
  return payload;
}

void logServerResponse() {
  unsigned long start = millis();
  String response = "";
  while (client.connected() && millis() - start < 2000UL) {
    while (client.available()) {
      char c = client.read();
      response += c;
      Serial.write(c);
      start = millis();
    }
  }
  
  // Check if server sent a feed command in the response
  if (response.indexOf("\"feedCommand\":true") >= 0 || response.indexOf("\"feedCommand\": true") >= 0) {
    if (!feedingInProgress && !feedingRequested) {
      Serial.println("\n🍽️ SERVER: Feed command received!");
      feedingRequested = true;
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
  client.println();
  client.print(payload);

  logServerResponse();
  client.stop();
  Serial.println(F("Payload delivered."));
  Serial.println(payload);
  return true;
}

void uploadSnapshotIfDue() {
  if (millis() - lastUploadMs < kSampleIntervalMs) {
    return;
  }
  ensureWifiConnected();
  const String payload = buildSensorJsonPayload();
  if (postJsonToServer(payload)) {
    lastUploadMs = millis();
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    ;
  }

  Serial1.begin(kEspBaudRate);
  WiFi.init(&Serial1);

  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println(F("ESP8266 shield not detected. Halt."));
    while (true) {
      delay(1000);
    }
  }
  ensureWifiConnected();

  Serial.println("=== SMART PET CARE SYSTEM - WITH MOTION DETECTION LIGHT ===");
  Serial.println("Initializing all subsystems...");
  Serial.println();

  strip.begin();
  strip.show();

  setupMotionLight();
  setupWaterSensor();
  setupFeederSystem();
  setupBarkDetection();
  setupAirQualitySystem();

  Serial.println("=== ALL SYSTEMS READY ===");
  Serial.println("COMMANDS:");
  Serial.println("Water: 'R' = Reset water alert");
  Serial.println("Feeder: 'T' = Tare feeder scale, 'W' = Set weight");
  Serial.println("Feeder: Controlled by server schedule (meal times in app)");
  Serial.println("Activity: 'AT' = Tare activity scale");
  Serial.println("General: 'STATUS' = Full system status");
  Serial.println("================================");
}

void setupMotionLight() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  Serial.println("✓ Motion detection light initialized (Trig: pin 2, Echo: pin 3)");
  Serial.print("  Detection range: ");
  Serial.print(MOTION_THRESHOLD);
  Serial.print(" cm, Duration: ");
  Serial.print(LIGHT_DURATION / 1000);
  Serial.println(" seconds");
}

void setupWaterSensor() {
  pinMode(WATER_SENSOR_PIN, INPUT_PULLUP);
  Serial.println("✓ Water sensor initialized on pin 7");
}

void setupFeederSystem() {
  pinMode(FEEDER_BUZZER_PIN, OUTPUT);
  myStepper.setSpeed(10);
  feederScale.begin(FEEDER_LOADCELL_DT_PIN, FEEDER_LOADCELL_SCK_PIN);
  feederScale.set_scale(feederCalibrationFactor);
  feederScale.tare();
  Serial.println("✓ Feeder system initialized");
  Serial.print("  Target weight: ");
  Serial.print(feederTargetWeight);
  Serial.println("g");
}

void setupBarkDetection() {
  pinMode(MIC_GAIN_PIN, OUTPUT);
  pinMode(MIC_AR_PIN, OUTPUT);
  digitalWrite(MIC_GAIN_PIN, HIGH);
  digitalWrite(MIC_AR_PIN, LOW);
  Serial.println("✓ Bark detection system initialized");
  Serial.println("  Calibrating background noise...");
  delay(3000);
  calibrateBackground();
  Serial.print("  Background level: ");
  Serial.println(background_level);
}

void setupAirQualitySystem() {
  pinMode(FAN_CONTROL_PIN, OUTPUT);
  digitalWrite(FAN_CONTROL_PIN, HIGH);
  activityScale.begin(ACTIVITY_LOADCELL_DT_PIN, ACTIVITY_LOADCELL_SCK_PIN);
  activityScale.set_scale(activityCalibrationFactor);
  activityScale.tare();

  Serial.println("✓ Air quality system initialized");
  Serial.println("  Warming up sensors... 30s");
  delay(WARMUP_TIME);
  warmed_up = true;

  float init = readActivityWeight();
  for (int i = 0; i < FLUCTUATION_WINDOW; i++) {
    weight_buffer[i] = init;
  }
  lastActivityWeight = init;
  Serial.println("✓ Activity monitoring ready");
}

void loop() {
  unsigned long now = millis();

  checkAllSerialCommands();
  handleMotionLight();
  checkWaterLevel();
  handleFeederSystem();
  handleBarkDetection();

  if (warmed_up) {
    if (now - last_env >= ENV_INTERVAL) {
      updateEnvironment();
      last_env = now;
    }

    if (now - last_sleep_check >= SLEEP_INTERVAL) {
      checkPetActivity();
      last_sleep_check = now;
    }
  }

  uploadSnapshotIfDue();
  delay(50);
}

// === WATER SENSOR FUNCTIONS ===
void checkWaterLevel() {
  int sensorValue = digitalRead(WATER_SENSOR_PIN);
  lastWaterLow = (sensorValue == LOW);
  if (sensorValue == LOW && !waterMessageShown) {
    Serial.println("🚨 WATER ALERT: Refill Water Bowl! 🚨");
    waterMessageShown = true;
  }
}

// === FEEDER SYSTEM FUNCTIONS ===
void handleFeederSystem() {
  if (feedingRequested && !feedingInProgress) {
    startFeeding();
  }

  if (feedingInProgress) {
    continueFeedingProcess();
  }
}

void startFeeding() {
  Serial.println("=== FEEDER: Manual feeding started ===");
  feedingInProgress = true;
  feedingRequested = false;
  feedingStartTime = millis();

  checkFeederWeight();
  Serial.print("FEEDER: Starting weight: ");
  Serial.print(feederCurrentWeight, 1);
  Serial.println("g");
}

void continueFeedingProcess() {
  unsigned long currentMillis = millis();

  if (currentMillis - feedingStartTime > maxFeedingDuration) {
    Serial.println("FEEDER: Timeout reached!");
    stopFeeding();
    return;
  }

  checkFeederWeight();

  if (feederCurrentWeight >= feederTargetWeight) {
    Serial.println("FEEDER: Target weight reached!");
    Serial.print("Final weight: ");
    Serial.print(feederCurrentWeight, 1);
    Serial.println("g");
    playSuccessBeep();
    waitForEmptyBowl();
    return;
  }

  Serial.print("FEEDER: Current: ");
  Serial.print(feederCurrentWeight, 1);
  Serial.print("g | Need: ");
  Serial.print(feederTargetWeight - feederCurrentWeight, 1);
  Serial.println("g more");

  performDispenseCycle();
  delay(weightCheckDelay);
}

void performDispenseCycle() {
  Serial.println("FEEDER: Dispensing...");
  stepMotorSlowly(stepsFor45Degrees);
  delay(1000);
  stepMotorSlowly(-stepsFor45Degrees);
  delay(500);
}

void stepMotorSlowly(int steps) {
  int stepDirection = (steps > 0) ? 1 : -1;
  int totalSteps = abs(steps);

  for (int i = 0; i < totalSteps; i++) {
    myStepper.step(stepDirection);
    delayMicroseconds(3000);
  }
}

void waitForEmptyBowl() {
  Serial.println("FEEDER: Waiting for bowl to be emptied...");

  while (feedingInProgress) {
    checkFeederWeight();

    if (Serial.available()) {
      String input = Serial.readString();
      input.trim();
      input.toUpperCase();
      if (input == "SKIP") {
        Serial.println("FEEDER: Skipping empty bowl wait");
        stopFeeding();
        return;
      }
    }

    if (feederCurrentWeight <= 5.0) {
      Serial.println("FEEDER: Bowl emptied - complete!");
      stopFeeding();
      return;
    }

    delay(500);
  }
}

void stopFeeding() {
  feedingInProgress = false;
  feedingRequested = false;
  Serial.println("FEEDER: Feeding complete - IDLE mode");
}

void checkFeederWeight() {
  if (feederScale.is_ready()) {
    feederCurrentWeight = feederScale.get_units(5);
    if (feederCurrentWeight < 0) {
      feederCurrentWeight = 0;
    }
  }
}

void playSuccessBeep() {
  digitalWrite(FEEDER_BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(FEEDER_BUZZER_PIN, LOW);
}

// === BARK DETECTION FUNCTIONS ===
void handleBarkDetection() {
  unsigned long start_time = millis();
  unsigned int peak_to_peak = 0;
  unsigned int signal_max = 0;
  unsigned int signal_min = 1024;

  while (millis() - start_time < SAMPLE_WINDOW) {
    sample = analogRead(MIC_OUT_PIN);
    if (sample < 1024) {
      if (sample > signal_max) signal_max = sample;
      else if (sample < signal_min) signal_min = sample;
    }
  }

  peak_to_peak = signal_max - signal_min;
  unsigned long current_time = millis();

  updateDynamicThreshold(peak_to_peak);
  processBarkDetection(peak_to_peak, current_time);
  controlBarkAlert(current_time);
  cleanupOldBarks(current_time);
  lastBarkAlert = bark_led_is_on;
}

void calibrateBackground() {
  long total = 0;
  for (int i = 0; i < BACKGROUND_SAMPLES; i++) {
    unsigned long start_time = millis();
    unsigned int signal_max = 0;
    unsigned int signal_min = 1024;

    while (millis() - start_time < 50) {
      sample = analogRead(MIC_OUT_PIN);
      if (sample > signal_max) signal_max = sample;
      if (sample < signal_min) signal_min = sample;
    }

    total += (signal_max - signal_min);
    delay(50);
  }

  background_level = total / BACKGROUND_SAMPLES;
  dynamic_threshold = background_level + BARK_THRESHOLD;

  if (dynamic_threshold < 100) dynamic_threshold = 100;
  if (dynamic_threshold > 800) dynamic_threshold = 800;
}

void updateDynamicThreshold(int current_level) {
  static int quiet_samples = 0;
  static long quiet_total = 0;

  if (current_level < dynamic_threshold * 0.7) {
    quiet_total += current_level;
    quiet_samples++;

    if (quiet_samples >= 40) {
      int new_background = quiet_total / quiet_samples;
      background_level = (background_level * 9 + new_background) / 10;
      dynamic_threshold = background_level + BARK_THRESHOLD;

      quiet_samples = 0;
      quiet_total = 0;

      if (dynamic_threshold < 100) dynamic_threshold = 100;
      if (dynamic_threshold > 800) dynamic_threshold = 800;
    }
  }
}

void processBarkDetection(int audio_level, unsigned long current_time) {
  if (audio_level > dynamic_threshold) {
    if (!bark_in_progress) {
      bark_start_time = current_time;
      bark_in_progress = true;
    }
  } else {
    if (bark_in_progress) {
      unsigned long bark_duration = current_time - bark_start_time;

      if (bark_duration >= BARK_MIN_DURATION && bark_duration <= BARK_MAX_DURATION) {
        bark_detected = true;
        last_bark_time = current_time;
        addBark(current_time);

        Serial.print("🐕 BARK #");
        Serial.print(bark_count);
        Serial.print(" detected - Duration: ");
        Serial.print(bark_duration);
        Serial.println("ms");
      }

      bark_in_progress = false;
    }
  }
}

void addBark(unsigned long current_time) {
  if (bark_count < REQUIRED_BARK_COUNT) {
    bark_times[bark_count] = current_time;
    bark_count++;

    if (bark_count == 1) {
      first_bark_time = current_time;
    }
  }
}

void cleanupOldBarks(unsigned long current_time) {
  if (bark_count > 0 && (current_time - first_bark_time > BARK_WINDOW)) {
    int new_count = 0;
    for (int i = 0; i < bark_count; i++) {
      if (current_time - bark_times[i] <= BARK_WINDOW) {
        bark_times[new_count] = bark_times[i];
        new_count++;
      }
    }

    if (new_count != bark_count) {
      bark_count = new_count;
      if (bark_count > 0) {
        first_bark_time = bark_times[0];
      }
    }
  }
}

void controlBarkAlert(unsigned long current_time) {
  if (bark_count >= REQUIRED_BARK_COUNT && !bark_led_is_on) {
    bark_led_is_on = true;
    bark_led_on_start = current_time;

    Serial.println("🚨 BARK ALERT: Repeated barking detected! 🚨");
    bark_count = 0;
  }

  if (bark_led_is_on && (current_time - bark_led_on_start >= BARK_LED_ON_TIME)) {
    bark_led_is_on = false;
    Serial.println("BARK: Alert cleared");
  }
}

// === AIR QUALITY & ACTIVITY FUNCTIONS ===
float readActivityWeight() {
  if (activityScale.is_ready()) {
    return activityScale.get_units(3);
  }
  return weight_buffer[(buffer_index - 1 + FLUCTUATION_WINDOW) % FLUCTUATION_WINDOW];
}

void updateEnvironment() {
  float voc = analogRead(VOC_SENSOR_PIN) * (5.0 / 1024.0);
  float temp = analogRead(TEMP_SENSOR_PIN) * (5.0 / 1024.0) * 100.0;
  String aqi = (voc <= VOC_GOOD_MAX) ? "Good" : (voc <= VOC_POOR_MIN) ? "Moderate" : "Poor";

  bool fan_should_on = (temp >= TEMP_FAN_ON);
  if (fan_should_on && !fan_on) {
    digitalWrite(FAN_CONTROL_PIN, LOW);
    fan_on = true;
    Serial.println("FAN: ON (Temperature high)");
  } else if (!fan_should_on && fan_on) {
    digitalWrite(FAN_CONTROL_PIN, HIGH);
    fan_on = false;
    Serial.println("FAN: OFF");
  }

  if (voc > VOC_POOR_MIN) {
    Serial.println("🚨 AIR QUALITY ALERT: Poor air detected! 🚨");
  }
  if (temp < 18 || temp > 32) {
    Serial.println("🚨 TEMPERATURE ALERT: Out of range! 🚨");
  }

  lastVocVoltage = voc;
  lastTemperatureC = temp;
  lastAqiLabel = aqi;
}

void checkPetActivity() {
  float current = readActivityWeight();
  lastActivityWeight = current;

  weight_buffer[buffer_index] = current;
  buffer_index = (buffer_index + 1) % FLUCTUATION_WINDOW;
  if (!buffer_full && buffer_index == 0) buffer_full = true;
  if (!buffer_full) return;

  float min_val = weight_buffer[0], max_val = weight_buffer[0];
  for (int i = 1; i < FLUCTUATION_WINDOW; i++) {
    if (weight_buffer[i] < min_val) min_val = weight_buffer[i];
    if (weight_buffer[i] > max_val) max_val = weight_buffer[i];
  }
  float range = max_val - min_val;

  if (range > WEIGHT_THRESHOLD) {
    stable_count = 0;
    if (pet_sleeping) {
      pet_sleeping = false;
      Serial.println("PET: AWAKE (Movement detected)");
    }
  } else {
    stable_count++;
    if (stable_count >= STABLE_NEEDED && !pet_sleeping) {
      pet_sleeping = true;
      Serial.println("PET: SLEEPING (Stable for 6s)");
    }
  }
}

// === SERIAL COMMAND HANDLER ===
void checkAllSerialCommands() {
  if (!Serial.available()) return;

  String input = Serial.readString();
  input.trim();
  String inputUpper = input;
  inputUpper.toUpperCase();
  String inputLower = input;
  inputLower.toLowerCase();

  if (inputUpper == "R") {
    waterMessageShown = false;
    Serial.println("WATER: Alert reset");
  } else if (inputUpper == "T") {
    Serial.println("FEEDER: Taring scale...");
    feederScale.tare();
    Serial.println("FEEDER: Scale reset to zero");
  } else if (inputUpper == "W") {
    Serial.println("FEEDER: Enter new target weight (grams):");
    while (!Serial.available()) delay(10);
    feederTargetWeight = Serial.parseFloat();
    Serial.print("FEEDER: Target weight set to: ");
    Serial.print(feederTargetWeight);
    Serial.println("g");
  } else if (inputUpper == "AT") {
    Serial.println("ACTIVITY: Taring scale...");
    activityScale.tare();
    Serial.println("ACTIVITY: Scale tared");
  } else if (inputUpper == "STATUS") {
    printSystemStatus();
  } else {
    Serial.println("Unknown command! Available commands:");
    Serial.println("R=Water reset, T=Tare feeder, W=Set weight");
    Serial.println("AT=Tare activity, STATUS=Full status");
    Serial.println("Note: Feeding is controlled by server schedule");
  }
}

void printSystemStatus() {
  Serial.println("=== FULL SYSTEM STATUS ===");

  int waterSensor = digitalRead(WATER_SENSOR_PIN);
  Serial.print("WATER: ");
  Serial.println(waterSensor == LOW ? "NEEDS REFILL" : "OK");

  float currentDistance = getDistance();
  Serial.print("MOTION LIGHT: ");
  Serial.print(currentDistance, 1);
  Serial.print(" cm | Status: ");
  Serial.println(lightOn ? "ON" : "OFF");

  checkFeederWeight();
  Serial.print("FEEDER: ");
  Serial.print(feedingInProgress ? "FEEDING" : "IDLE");
  Serial.print(" | Weight: ");
  Serial.print(feederCurrentWeight, 1);
  Serial.print("g / ");
  Serial.print(feederTargetWeight);
  Serial.println("g");

  Serial.print("BARK: Count=");
  Serial.print(bark_count);
  Serial.print(" | Alert=");
  Serial.println(bark_led_is_on ? "ACTIVE" : "OFF");

  float voc = analogRead(VOC_SENSOR_PIN) * (5.0 / 1024.0);
  float temp = analogRead(TEMP_SENSOR_PIN) * (5.0 / 1024.0) * 100.0;
  Serial.print("AIR: VOC=");
  Serial.print(voc, 2);
  Serial.print("V | Temp=");
  Serial.print(temp, 1);
  Serial.print("°C | Fan=");
  Serial.println(fan_on ? "ON" : "OFF");

  Serial.print("PET: ");
  Serial.print(pet_sleeping ? "SLEEPING" : "AWAKE");
  Serial.print(" | Weight: ");
  Serial.print(lastActivityWeight, 1);
  Serial.println("g");

  Serial.println("========================");
}
