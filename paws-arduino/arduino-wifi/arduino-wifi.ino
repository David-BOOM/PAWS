#include "WiFiEsp.h"
#include "SoftwareSerial.h"

// Create a serial connection to the ESP8266
SoftwareSerial esp8266(2, 3); // RX, TX (connect Arduino pin 2->TX of ESP, 3->RX of ESP)

// WiFi credentials
char ssid[] = "EE3070_P1615_1";     
char pass[] = "EE3070P1615"; 

// Local IP of your PC (check with ipconfig/ifconfig)
char server[] = "192.168.1.100";   // Replace with your PC's local IP
int port = 8080;                   // Port your PC server is listening on

int status = WL_IDLE_STATUS;
WiFiEspClient client;

void setup() {
  // Initialize serial for debugging
  Serial.begin(9600);
  // Initialize serial for ESP module
  esp8266.begin(9600);
  
  // Initialize WiFi library
  WiFi.init(&esp8266);

  // Check for the presence of the ESP8266
  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("ESP8266 not detected");
    while (true);
  }

  // Attempt to connect to WiFi
  while (status != WL_CONNECTED) {
    Serial.print("Connecting to ");
    Serial.println(ssid);
    status = WiFi.begin(ssid, pass);
    delay(5000);
  }
  Serial.println("Connected to WiFi");
}

void loop() {
  // Try to connect to server
  if (client.connect(server, port)) {
    Serial.println("Connected to server");
    client.println("Hello from Arduino + ESP8266!");
    client.stop();
  } else {
    Serial.println("Connection failed");
  }
  delay(5000); // Send every 5 seconds
}