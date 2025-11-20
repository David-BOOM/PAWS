#include <WiFiEsp.h>
#include <ArduinoJson.h>
#include "include/generated-secrets.h"

//################################################################
//###                USER CONFIGURATION                        ###
//################################################################

// Your WiFi network credentials (populated from config/secrets.json)
char ssid[] = SECRET_WIFI_SSID;
char pass[] = SECRET_WIFI_PASS;

// Your Node.js server's IP address and port
// Find this by running 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)
// on the computer running the server.
char server[] = SECRET_SERVER_HOST;
int serverPort = SECRET_SERVER_PORT;

//################################################################
//###                HARDWARE SETUP                          ###
//################################################################

// We will use 'Serial1' on the Mega (Pins 18, 19) for the ESP8266.
// This is much more stable than SoftwareSerial.
//
// Wiring:
// ESP-TX  ->  Mega Pin 19 (RX1)
// ESP-RX  ->  Mega Pin 18 (TX1)
// ESP-VCC ->  3.3V
// ESP-GND ->  GND
// ESP-CH_PD -> 3.3V
//
HardwareSerial& espSerial = Serial1;

// Initialize the WiFi client library
WiFiEspClient client;

// Define a buffer for reading HTTP responses
char responseBuffer[1024];

void setup() {
  // 1. Initialize Serial Monitor for debugging
  Serial.begin(115200);
  while (!Serial) { ; } // Wait for serial port to connect

  // 2. Initialize Serial1 for communication with ESP8266
  // Note: Your ESP8266 must be set to this baud rate (115200 is common)
  // If connection fails, try 9600.
  espSerial.begin(115200);

  // 3. Initialize the WiFi module
  Serial.println("Initializing ESP8266 module...");
  WiFi.init(&espSerial);

  // Check for presence of the ESP8266
  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("ESP8266 WiFi module not found!");
    while (true); // Don't continue
  }

  // 4. Attempt to connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  int status = WL_IDLE_STATUS;
  while (status != WL_CONNECTED) {
    status = WiFi.begin(ssid, pass);
    Serial.print(".");
    delay(1000);
  }

  // 5. Connection successful
  Serial.println("\nWiFi connected!");
  printWifiStatus();

  Serial.println("\nSetup complete. Starting main loop...");
}

void loop() {
  // Example 1: GET data from the server
  Serial.println("\n--------------------");
  Serial.println("Fetching /dashboard data...");
  getDashboardData();
  
  delay(5000); // Wait 5 seconds

  // Example 2: POST a JSON action to the server
  Serial.println("\n--------------------");
  Serial.println("Sending 'toggle_light' action...");
  sendAction("toggle_light");

  delay(5000); // Wait 5 seconds
}

/**
 * @brief Performs an HTTP GET request to the /dashboard endpoint
 */
void getDashboardData() {
  // Connect to the server
  if (client.connect(server, serverPort)) {
    Serial.println("Connected to server.");
    
    // Make an HTTP GET request
    client.println("GET /dashboard HTTP/1.1");
    client.print("Host: ");
    client.println(server);
    client.println("Connection: close");
    client.println(); // End of headers

  } else {
    Serial.println("Connection to server failed!");
    return;
  }

  // Wait for the server to respond (with a timeout)
  unsigned long startTime = millis();
  while (client.available() == 0) {
    if (millis() - startTime > 5000) { // 5 second timeout
      Serial.println(">>> Client Timeout !");
      client.stop();
      return;
    }
  }

  // --- Read the HTTP Response ---
  bool headersEnded = false;
  String httpBody = "";

  while (client.available()) {
    String line = client.readStringUntil('\n');
    line.trim(); // Remove \r

    if (!headersEnded) {
      // Look for the blank line that separates headers from body
      if (line.length() == 0) {
        headersEnded = true;
      }
    } else {
      // This is the body
      httpBody += line;
    }
  }
  client.stop();

  Serial.println("Server response body:");
  Serial.println(httpBody);

  // --- Parse the JSON Response ---
  // Use a StaticJsonDocument. 1024 bytes should be enough for the dashboard.
  StaticJsonDocument<1024> doc;

  DeserializationError error = deserializeJson(doc, httpBody);

  if (error) {
    Serial.print("deserializeJson() failed: ");
    Serial.println(error.c_str());
    return;
  }

  // Extract data from the JSON
  // Using .as<type>() is safer if the key might be missing
  bool lightOn = doc["lightOn"].as<bool>();
  const char* waterLevel = doc["waterLevel"] | "unknown"; // Default value
  int lastMeal = doc["lastMeal"] | -1; // Default value

  Serial.println("--- Parsed Dashboard Data ---");
  Serial.print("Light Status: ");
  Serial.println(lightOn ? "ON" : "OFF");
  Serial.print("Water Level: ");
  Serial.println(waterLevel);
  Serial.print("Last Meal Amount: ");
  Serial.println(lastMeal);
  Serial.println("-----------------------------");
}


/**
 * @brief Performs an HTTP POST request to the /actions endpoint
 * @param action The action string to send (e.g., "toggle_light")
 */
void sendAction(const char* action) {
  // 1. Create the JSON payload to send
  StaticJsonDocument<128> doc;
  doc["action"] = action;
  
  String payload;
  serializeJson(doc, payload);

  // 2. Connect to the server
  if (client.connect(server, serverPort)) {
    Serial.println("Connected to server for POST.");

    // 3. Send the HTTP POST request headers
    client.println("POST /actions HTTP/1.1");
    client.print("Host: ");
    client.println(server);
    client.println("Content-Type: application/json");
    client.print("Content-Length: ");
    client.println(payload.length());
    client.println("Connection: close");
    client.println(); // Blank line separates headers from body

    // 4. Send the JSON payload
    client.println(payload);
    Serial.print("Sent payload: ");
    Serial.println(payload);

  } else {
    Serial.println("Connection to server failed!");
    return;
  }

  // 5. Read the server's response (optional, but good for debugging)
  Serial.println("Server response:");
  unsigned long startTime = millis();
  while (client.available() == 0) {
    if (millis() - startTime > 5000) { // 5 second timeout
      Serial.println(">>> Client Timeout !");
      client.stop();
      return;
    }
  }

  while (client.available()) {
    String line = client.readStringUntil('\n');
    Serial.println(line);
  }
  
  client.stop();
}


/**
 * @brief Prints the current WiFi status to the Serial monitor
 */
void printWifiStatus() {
  Serial.println("--- WiFi Status ---");
  
  // Print the SSID of the network you're attached to
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());

  // Print your device's IP address
  IPAddress ip = WiFi.localIP();
  Serial.print("IP Address: ");
  Serial.println(ip);

  // Print the received signal strength
  long rssi = WiFi.RSSI();
  Serial.print("Signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");
  Serial.println("-------------------");
}