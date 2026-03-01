#!/bin/bash
# Battery Digital Twin Dashboard
# Usage: ./start.sh

cd "$(dirname "$0")"

echo "🔋 Battery Digital Twin Dashboard"
echo "=================================="

# Activate virtual environment
source venv_py312/bin/activate

# Fix missing PyBaMM dependency if needed
if ! python -c "import pybamm" 2>/dev/null; then
    echo "📦 Fixing PyBaMM installation..."
    pip install -q black
fi

# Check MQTT broker
if ! systemctl is-active --quiet mosquitto 2>/dev/null; then
    echo "⚠️  MQTT broker not running"
    echo "   Start with: sudo systemctl start mosquitto"
    echo ""
fi

# Start dashboard
echo "🚀 Starting dashboard..."
echo ""
python app.py
