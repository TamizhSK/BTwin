#!/bin/bash

# ===================================
# MQTT Broker Setup for Raspberry Pi
# ===================================

echo "🔧 Setting up MQTT Broker (Mosquitto) on Raspberry Pi..."

# Update system
echo "📦 Updating system packages..."
sudo apt update

# Install Mosquitto MQTT broker and clients
echo "📦 Installing Mosquitto MQTT broker..."
sudo apt install -y mosquitto mosquitto-clients

# Enable and start Mosquitto service
echo "🚀 Starting Mosquitto service..."
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# Create basic configuration
echo "⚙️  Creating MQTT configuration..."
sudo tee /etc/mosquitto/conf.d/default.conf > /dev/null <<EOF
# Allow anonymous connections (for development)
allow_anonymous true

# Listen on all interfaces
listener 1883 0.0.0.0

# Enable persistence
persistence true
persistence_location /var/lib/mosquitto/

# Log settings
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information
EOF

# Restart Mosquitto to apply configuration
echo "🔄 Restarting Mosquitto with new configuration..."
sudo systemctl restart mosquitto

# Check status
echo "✅ Checking Mosquitto status..."
sudo systemctl status mosquitto --no-pager

# Get IP address
PI_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "🎉 MQTT Broker Setup Complete!"
echo ""
echo "📋 Configuration Summary:"
echo "   MQTT Broker IP: $PI_IP"
echo "   MQTT Port: 1883"
echo "   Topic: esp32/sensor_data"
echo ""
echo "🧪 Test MQTT broker:"
echo "   Subscribe: mosquitto_sub -h $PI_IP -t esp32/sensor_data"
echo "   Publish:   mosquitto_pub -h $PI_IP -t esp32/sensor_data -m '{\"test\":\"data\"}'"
echo ""
echo "📱 Update your ESP32 code with:"
echo "   MQTT_BROKER = \"192.168.0.148\""
echo "   MQTT_PORT = 1883"
echo "   MQTT_TOPIC = \"esp32/sensor_data\""
echo ""
