#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi sensors
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <Adafruit_ADS1X15.h>
#include "DHT.h"

// ========== WiFi Configuration ==========
const char* WIFI_SSID = "Adithya Gunasekaran";
const char* WIFI_PASSWORD = "55716154";

// ========== MQTT Configuration ==========
const char* MQTT_BROKER = "192.168.0.148";  // Your Raspberry Pi IP
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "esp32/sensor_data";  // Match Python app topic
const char* MQTT_CLIENT_ID = "ESP32_01";

// ========== Sensor Pins & Setup ==========
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

Adafruit_INA219 ina219;
Adafruit_ADS1115 ads;

const int ACS_PIN = 34;
const float ACS_SENS_mVperA = 100.0;

// ========== Globals ==========
WiFiClient espClient;
PubSubClient client(espClient);
unsigned long lastMsg = 0;
const long MSG_PUBLISH_INTERVAL = 2000;  // 2 seconds

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=== BATTERY DIGITAL TWIN - RASPBERRY PI ===");
  
  // I2C setup
  Wire.begin(21, 22);
  delay(100);
  
  // DHT22 setup
  dht.begin();
  Serial.println("✓ DHT22 initialized");
  
  // INA219 setup
  if (ina219.begin()) {
    Serial.println("✓ INA219 found");
  } else {
    Serial.println("✗ INA219 NOT found");
  }
  
  // ADS1115 setup
  if (ads.begin()) {
    Serial.println("✓ ADS1115 found");
  } else {
    Serial.println("✗ ADS1115 NOT found");
  }
  
  // WiFi setup
  setup_wifi();
  
  // MQTT setup
  client.setServer(MQTT_BROKER, MQTT_PORT);
  
  Serial.println("=== READY ===\n");
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  unsigned long now = millis();
  if (now - lastMsg > MSG_PUBLISH_INTERVAL) {
    lastMsg = now;
    publish_sensor_data();
  }
}

void setup_wifi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi connected");
    Serial.print("  IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n✗ WiFi FAILED");
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting to MQTT broker: ");
    Serial.println(MQTT_BROKER);
    
    if (client.connect(MQTT_CLIENT_ID)) {
      Serial.println("✓ MQTT Connected!");
    } else {
      Serial.print("✗ MQTT failed, rc=");
      Serial.print(client.state());
      Serial.println(" (retrying in 5 sec)");
      delay(5000);
    }
  }
}

void publish_sensor_data() {
  // Read sensors
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  bool dht_ok = !isnan(humidity) && !isnan(temperature);
  
  float bus_voltage = ina219.getBusVoltage_V();
  float ina_current_mA = ina219.getCurrent_mA();
  float power_mW = ina219.getPower_mW();
  
  int16_t adc0 = ads.readADC_SingleEnded(0);
  float ads_voltage = ads.computeVolts(adc0);
  
  int rawACS = analogRead(ACS_PIN);
  float acsVoltage = (rawACS / 4095.0) * 3.3;
  float acs_current_A = (acsVoltage - 1.65) / (ACS_SENS_mVperA / 1000.0);
  
  // Build JSON matching Python app format
  JsonDocument doc;
  doc["device_id"] = "ESP32_01";
  doc["voltage"] = round(bus_voltage * 100) / 100.0;
  doc["current_ma"] = round(ina_current_mA * 10) / 10.0;
  doc["power_mw"] = round(power_mW * 10) / 10.0;
  doc["temperature"] = dht_ok ? round(temperature * 10) / 10.0 : 0;
  doc["acs_current_a"] = round(acs_current_A * 1000) / 1000.0;
  doc["wifi_rssi"] = WiFi.RSSI();
  
  // Serialize and publish
  char buffer[256];
  serializeJson(doc, buffer);
  
  bool success = client.publish(MQTT_TOPIC, buffer);
  
  Serial.print(success ? "✓ " : "✗ ");
  Serial.print("V:");
  Serial.print(bus_voltage, 2);
  Serial.print("V I:");
  Serial.print(ina_current_mA, 0);
  Serial.print("mA T:");
  Serial.print(temperature, 1);
  Serial.print("°C RSSI:");
  Serial.println(WiFi.RSSI());
}
