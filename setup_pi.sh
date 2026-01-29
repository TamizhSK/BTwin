#!/bin/bash

# ===================================
# Raspberry Pi Server Setup
# ===================================

echo "🚀 Setting up Raspberry Pi as IoT Dashboard Server..."

# 1. Install system dependencies
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y python3-pip python3-venv git

# 2. Setup Python virtual environment
echo "🐍 Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# 3. Install Python dependencies
echo "📦 Installing Python packages..."
pip install -r requirements.txt

# 4. Setup MQTT broker
echo "🔧 Setting up MQTT broker..."
./setup_mqtt.sh

# 5. Get network information
PI_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "✅ Setup Complete!"
echo ""
echo "🌐 Your Raspberry Pi Server URLs:"
echo "   Local:    http://localhost:5000"
echo "   Network:  http://192.168.0.148:5000"
echo ""
echo "📱 Share this URL: http://192.168.0.148:5000"
echo ""
echo "🚀 To start the server:"
echo "   source venv/bin/activate"
echo "   python app.py"
echo ""
