#include "WiFiEsp.h"
#include "SoftwareSerial.h"

// Pins for ESP8266 connection to Mega
SoftwareSerial esp8266(6, 7); // RX, TX

char ssid[] = "YOUR_WIFI_SSID";     
char pass[] = "YOUR_WIFI_PASSWORD"; 
int status = WL_IDLE_STATUS;

char server[] = "192.168.1.100"; // local IP
int port = 5000;                 // Port

WiFiEspClient client;

void setup() {
  Serial.begin(9600);      // Serial monitor
  esp8266.begin(115200);     // ESP8266 baud rate
  WiFi.init(&esp8266);

  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("ESP8266 not detected");
    while (true);
  }

  // Connect to WiFi
  while (status != WL_CONNECTED) {
    Serial.print("Connecting to ");
    Serial.println(ssid);
    status = WiFi.begin(ssid, pass);
    delay(5000);
  }
  Serial.println("Connected to WiFi");
}

void loop() {
  if (client.connect(server, port)) {
    Serial.println("Connected to server");

    // Example JSON data
    String jsonData = "{\"temperature\": 25.4, \"humidity\": 60}";

    // Send HTTP POST request
    client.println("POST /data HTTP/1.1");
    client.print("Host: ");
    client.println(server);
    client.println("Content-Type: application/json");
    client.print("Content-Length: ");
    client.println(jsonData.length());
    client.println();
    client.println(jsonData);

    Serial.println("JSON sent:");
    Serial.println(jsonData);

    client.stop();
  } else {
    Serial.println("Connection failed");
  }

  delay(10000); // send every 10 seconds
}