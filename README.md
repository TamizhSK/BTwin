# Battery Digital Twin Dashboard

Real-time IoT dashboard for ESP32 battery sensor data using Flask, MQTT, and Plotly.

## Quick Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Setup MQTT broker**:
   ```bash
   ./setup_mqtt.sh
   ```

3. **Run the server**:
   ```bash
   python app.py
   ```

## Features

- **MQTT Integration**: Real-time data via MQTT broker
- **Network Access**: Accessible from any device on your network
- **Real-time Visualization**: Live charts and gauges
- **SQLite Storage**: Persistent data storage

## Configuration

Edit `.env` file:
- `MQTT_BROKER`: MQTT broker IP (default: localhost)
- `MQTT_TOPIC`: MQTT topic (default: esp32/sensor_data)

## ESP32 Setup

Configure your ESP32 to publish JSON data to MQTT topic `esp32/sensor_data`:

```json
{
  "device_id": "ESP32_01",
  "voltage": 3.7,
  "current_ma": 150.5,
  "temperature": 25.3,
  "acs_current_a": 0.155,
  "wifi_rssi": -45
}
```
