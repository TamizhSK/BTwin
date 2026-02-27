#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
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
const char* MQTT_TOPIC = "esp32/sensor_data";
const char* MQTT_CLIENT_ID = "ESP32_01";

// ========== Sensor Pins & Setup ==========
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

Adafruit_INA219 ina219;
Adafruit_ADS1115 ads;

// ACS712 REMOVED — INA219 handles both voltage and current measurement.
// This eliminates the 5V power draw issue that was causing ESP32 brownout/dimming.

// ========== Battery Configuration ==========
#define BATTERY_CAPACITY_mAh 2000.0
#define SOC_UPDATE_INTERVAL 1000

// ========== SOC Globals ==========
float current_SOC = 100.0;
float cumulative_mAh = 0;
unsigned long last_SOC_update = 0;

// ========== SOH Globals ==========
float current_SOH = 100.0;
float temp_stress_factor = 0;
unsigned long last_temp_update = 0;

// Cycle tracking for SOH
static float cycle_start_mAh = 0;
static bool cycle_started = false;
static float max_discharge_mAh = 0;
static float last_SOC_for_cycle = 100.0;

// OCV-SOC lookup table for Li-ion
const float OCV_SOC_TABLE[][2] = {
    {3.00, 0},    {3.20, 10},   {3.40, 20},
    {3.55, 30},   {3.65, 40},   {3.75, 50},
    {3.85, 60},   {3.95, 70},   {4.05, 80},
    {4.15, 90},   {4.20, 100}
};

// ========== WiFi/MQTT Globals ==========
WiFiClient espClient;
PubSubClient client(espClient);
unsigned long lastMsg = 0;
const long MSG_PUBLISH_INTERVAL = 2000;

// ========== Function Declarations ==========
void setup_wifi();
void reconnect();
void publish_sensor_data();
float get_SOC_from_voltage(float voltage);
void update_SOC_coulomb(float current_mA, unsigned long now);
void update_SOH_from_cycle(float voltage, float current_mA, float soc);
void calculate_internal_resistance(float OCV, float loaded_V, float current_mA);
void update_temp_stress(float temp_C, unsigned long now);

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=== BATTERY DIGITAL TWIN - RASPBERRY PI ===");
    Serial.println("    (ACS712 removed — INA219 only mode)");

    Wire.begin(21, 22);  // SDA=GPIO21, SCL=GPIO22
    delay(100);

    dht.begin();
    Serial.println("✓ DHT22 initialized on GPIO4");

    if (ina219.begin()) {
        Serial.println("✓ INA219 found (I2C addr 0x40)");
    } else {
        Serial.println("✗ INA219 NOT found — check wiring!");
    }

    if (ads.begin()) {
        Serial.println("✓ ADS1115 found (I2C addr 0x48)");
    } else {
        Serial.println("✗ ADS1115 NOT found — check wiring!");
    }

    setup_wifi();
    client.setServer(MQTT_BROKER, MQTT_PORT);

    // Initialize SOC timing
    last_SOC_update = millis();
    last_temp_update = millis();

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
        Serial.println("\n✗ WiFi FAILED — check SSID/password");
    }
}

void reconnect() {
    while (!client.connected()) {
        Serial.print("Connecting to MQTT: ");
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

float get_SOC_from_voltage(float voltage) {
    for (int i = 0; i < 10; i++) {
        if (voltage >= OCV_SOC_TABLE[i][0] && voltage <= OCV_SOC_TABLE[i + 1][0]) {
            float v1 = OCV_SOC_TABLE[i][0], v2 = OCV_SOC_TABLE[i + 1][0];
            float s1 = OCV_SOC_TABLE[i][1], s2 = OCV_SOC_TABLE[i + 1][1];
            return s1 + (s2 - s1) * (voltage - v1) / (v2 - v1);
        }
    }
    return (voltage < 3.0) ? 0.0 : 100.0;
}

void update_SOC_coulomb(float current_mA, unsigned long now) {
    float deltaHours = (now - last_SOC_update) / 3600000.0;

    if (deltaHours <= 0) return;

    // Discharging: current flows out (positive current reading)
    // Charging: current flows in (negative current reading)
    if (current_mA > 0) {
        cumulative_mAh -= current_mA * deltaHours;
    } else {
        cumulative_mAh -= current_mA * deltaHours * 0.95;  // 95% charge efficiency
    }

    // Constrain cumulative to prevent runaway
    cumulative_mAh = constrain(cumulative_mAh, -BATTERY_CAPACITY_mAh * 0.5, BATTERY_CAPACITY_mAh * 0.5);

    current_SOC = 100.0 * (BATTERY_CAPACITY_mAh + cumulative_mAh) / BATTERY_CAPACITY_mAh;
    current_SOC = constrain(current_SOC, 0.0, 100.0);
    last_SOC_update = now;
}

void update_SOH_from_cycle(float voltage, float current_mA, float soc) {
    // Detect full cycle start (high voltage, high SOC)
    if (voltage > 4.1 && soc > 90 && !cycle_started) {
        cycle_started = true;
        cycle_start_mAh = cumulative_mAh;
        last_SOC_for_cycle = soc;
        Serial.println("SOH: Cycle started");
    }

    // Detect cycle end (low voltage, discharged)
    if (voltage < 3.3 && cycle_started && soc < 20) {
        float actual_capacity = cycle_start_mAh - cumulative_mAh;
        if (actual_capacity > 0) {
            current_SOH = 100.0 * actual_capacity / BATTERY_CAPACITY_mAh;
            current_SOH = constrain(current_SOH, 0.0, 100.0);
            Serial.print("SOH updated: ");
            Serial.print(current_SOH);
            Serial.println("%");
        }
        cycle_started = false;
    }

    // Update max discharge seen
    if (current_mA > 10 && !cycle_started) {
        float discharge_mAh = BATTERY_CAPACITY_mAh - (BATTERY_CAPACITY_mAh * soc / 100.0);
        if (discharge_mAh > max_discharge_mAh) {
            max_discharge_mAh = discharge_mAh;
            current_SOH = 100.0 * (BATTERY_CAPACITY_mAh - max_discharge_mAh + cumulative_mAh) / BATTERY_CAPACITY_mAh;
        }
    }
}

void calculate_internal_resistance(float resting_V, float loaded_V, float current_mA) {
    if (abs(current_mA) > 50.0) {  // Need significant current for accurate measurement
        float current_A = current_mA / 1000.0;
        float R_ohm = abs(resting_V - loaded_V) / abs(current_A);

        // Nominal internal resistance for new Li-ion ~ 0.05-0.1 ohm
        float R_nominal = 0.08;

        // SOH based on resistance increase (new = 100%, 2x R = 50%)
        float soh_r = 100.0 * R_nominal / R_ohm;
        soh_r = constrain(soh_r, 0.0, 100.0);

        // Blend with cycle-based SOH
        current_SOH = 0.7 * current_SOH + 0.3 * soh_r;
    }
}

void update_temp_stress(float temp_C, unsigned long now) {
    float deltaHours = (now - last_temp_update) / 3600000.0;

    if (deltaHours <= 0) return;

    // Accumulate temperature stress using Arrhenius model
    if (temp_C > 25.0) {
        float stress_increment = deltaHours * exp((temp_C - 25.0) / 10.0);
        temp_stress_factor += stress_increment;
    }

    // Degradation model: ~2% SOH loss per 1000 stress hours at 35°C
    float degradation = temp_stress_factor / 50000.0 * 100.0;
    float soh_temp = max(0.0f, 100.0f - (float)degradation);

    // Temperature SOH only applies if it reduces health
    if (soh_temp < current_SOH) {
        current_SOH = soh_temp;
    }

    last_temp_update = now;
}

void publish_sensor_data() {
    // ===== READ SENSORS =====

    // DHT22 — temperature and humidity
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();
    bool dht_ok = !isnan(humidity) && !isnan(temperature);

    // INA219 — battery voltage, current, power (replaces ACS712 for current)
    float bus_voltage = ina219.getBusVoltage_V();
    float ina_current_mA = ina219.getCurrent_mA();
    float power_mW = ina219.getPower_mW();

    // ADS1115 — high-resolution ADC reading (channel 0)
    int16_t adc0 = ads.readADC_SingleEnded(0);
    float ads_voltage = ads.computeVolts(adc0);

    unsigned long now = millis();

    // ===== SOC CALCULATION =====
    float SOC_voltage = get_SOC_from_voltage(bus_voltage);

    // Coulomb counting when current is significant
    if (abs(ina_current_mA) > 5.0) {
        update_SOC_coulomb(ina_current_mA, now);
    } else {
        // At rest: use voltage for calibration (70% coulomb, 30% voltage)
        current_SOC = 0.7 * current_SOC + 0.3 * SOC_voltage;
    }

    // ===== SOH CALCULATION =====
    static unsigned long last_soh_update = 0;
    if (now - last_soh_update > 5000) {  // Every 5 seconds
        update_SOH_from_cycle(bus_voltage, ina_current_mA, current_SOC);

        // Calculate internal resistance SOH when under load
        static float resting_voltage = bus_voltage;
        if (abs(ina_current_mA) < 10) {
            resting_voltage = 0.9 * resting_voltage + 0.1 * bus_voltage;
        } else {
            calculate_internal_resistance(resting_voltage, bus_voltage, ina_current_mA);
        }

        if (dht_ok) {
            update_temp_stress(temperature, now);
        }

        last_soh_update = now;
    }

    // Constrain SOH
    current_SOH = constrain(current_SOH, 0.0, 100.0);

    // ===== BUILD JSON =====
    // NOTE: "acs_current_a" field removed since ACS712 is excluded.
    //       INA219 current (ina_current_mA) is the primary current measurement.
    JsonDocument doc;
    doc["device_id"] = "ESP32_01";
    doc["voltage"] = round(bus_voltage * 100) / 100.0;
    doc["current_ma"] = round(ina_current_mA * 10) / 10.0;
    doc["power_mw"] = round(power_mW * 10) / 10.0;
    doc["temperature"] = dht_ok ? round(temperature * 10) / 10.0 : 0;
    doc["humidity"] = dht_ok ? round(humidity * 10) / 10.0 : 0;
    doc["ads_voltage"] = round(ads_voltage * 1000) / 1000.0;  // ADS1115 channel 0
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["soc_percent"] = round(current_SOC * 10) / 10.0;
    doc["soc_voltage"] = round(SOC_voltage * 10) / 10.0;
    doc["soh_percent"] = round(current_SOH * 10) / 10.0;

    // Serialize and publish
    char buffer[512];
    size_t len = serializeJson(doc, buffer);

    bool success = client.publish(MQTT_TOPIC, buffer, len);

    // ===== SERIAL DEBUG =====
    Serial.print(success ? "✓ " : "✗ ");
    Serial.print("V:");
    Serial.print(bus_voltage, 2);
    Serial.print("V  I:");
    Serial.print(ina_current_mA, 1);
    Serial.print("mA  P:");
    Serial.print(power_mW, 1);
    Serial.print("mW  T:");
    Serial.print(dht_ok ? temperature : 0, 1);
    Serial.print("C  H:");
    Serial.print(dht_ok ? humidity : 0, 1);
    Serial.print("%  ADS:");
    Serial.print(ads_voltage, 3);
    Serial.print("V  SOC:");
    Serial.print(current_SOC, 1);
    Serial.print("%  SOH:");
    Serial.print(current_SOH, 1);
    Serial.print("%  RSSI:");
    Serial.println(WiFi.RSSI());
}
