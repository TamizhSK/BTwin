#!/bin/bash
# Battery Digital Twin Dashboard - Single Startup Script
# Usage: ./start_dashboard.sh

set -e
cd "$(dirname "$0")"

VENV="venv_py312"
PYTHON="python3.12"

echo "🔋 Battery Digital Twin Dashboard"
echo "=================================="

# Check if venv exists, create if needed
if [ ! -d "$VENV" ]; then
    echo "📦 Creating virtual environment..."
    $PYTHON -m venv "$VENV"
fi

# Activate venv
source "$VENV/bin/activate"

# Check if PyBaMM is installed
if ! python -c "import pybamm" 2>/dev/null; then
    echo "📦 Installing PyBaMM and dependencies..."
    pip install -q --upgrade pip wheel setuptools
    
    ARCH=$(uname -m)
    if [[ "$ARCH" == "aarch64" || "$ARCH" == "armv7l" || "$ARCH" == "arm64" ]]; then
        pip install -q "pybamm[jax]"
    else
        pip install -q "pybamm[plot,cite]"
    fi
    
    pip install -q -r requirements.txt
    echo "✅ Dependencies installed"
fi

# Check MQTT broker
if ! systemctl is-active --quiet mosquitto 2>/dev/null; then
    echo "⚠️  MQTT broker not running. Start with: sudo systemctl start mosquitto"
fi

# Start Flask app
echo "🚀 Starting dashboard..."
echo ""
python app.py
