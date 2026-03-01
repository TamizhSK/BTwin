#!/bin/bash
# ============================================================
#  BTwin — Battery Digital Twin Dashboard
#  Single startup script for Raspberry Pi
#
#  Usage:  ./start.sh
#  Stop:   Ctrl+C
# ============================================================

set -e
cd "$(dirname "$0")"

VENV="venv_py312"

echo "Battery Digital Twin Dashboard"
echo "================================"

# ── 1. Find Python 3.12 ─────────────────────────────────────
PYTHON=""
for candidate in /usr/local/bin/python3.12 /usr/bin/python3.12 python3.12 python3; do
    if [ -x "$candidate" ] || command -v "$candidate" &>/dev/null; then
        ver=$("$candidate" --version 2>&1 | grep -oP '3\.\d+' | head -1)
        if [[ "$ver" == "3.12" || "$ver" == "3.13" ]]; then
            PYTHON="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "ERROR: Python 3.12+ not found."
    echo "  Install: sudo apt install python3.12"
    exit 1
fi
echo "Python: $($PYTHON --version)"

# ── 2. Create venv if missing ───────────────────────────────
if [ ! -d "$VENV" ]; then
    echo "Creating virtual environment at $VENV ..."
    "$PYTHON" -m venv "$VENV"
fi

# ── 3. Fix broken venv Python symlinks ──────────────────────
#  The venv was built on the Pi with a source-compiled Python.
#  If that binary moved, repair the symlinks so the venv still works.
for link in python python3 python3.12; do
    target="$VENV/bin/$link"
    if [ ! -x "$target" ] || ! "$target" --version &>/dev/null 2>&1; then
        echo "Repairing symlink: $target -> $PYTHON"
        ln -sf "$PYTHON" "$target"
    fi
done

# ── 4. Activate venv ────────────────────────────────────────
source "$VENV/bin/activate"
echo "Venv active: $VIRTUAL_ENV"
echo "Python in venv: $(python --version)"

# ── 5. Check & install PyBaMM ───────────────────────────────
if ! python -c "import pybamm" &>/dev/null 2>&1; then
    echo "PyBaMM not found — installing for $(uname -m)..."
    pip install --upgrade pip wheel setuptools -q
    ARCH=$(uname -m)
    if [[ "$ARCH" == "aarch64" || "$ARCH" == "armv7l" || "$ARCH" == "arm64" ]]; then
        pip install "pybamm" -q
    else
        pip install "pybamm[plot,cite]" -q
    fi
    echo "PyBaMM installed."
fi

# ── 6. Check & install Flask + other deps ───────────────────
if ! python -c "import flask, flask_socketio, paho, pandas, dotenv" &>/dev/null 2>&1; then
    echo "Installing project dependencies from requirements.txt..."
    pip install -r requirements.txt -q
    echo "Dependencies installed."
fi

# ── 7. Quick PyBaMM sanity check ────────────────────────────
python - <<'PYCHECK'
import pybamm, sys
print(f"  PyBaMM {pybamm.__version__} OK")
p = pybamm.ParameterValues("Chen2020")
print(f"  Chen2020 loaded — capacity: {p['Nominal cell capacity [A.h]']} Ah")
PYCHECK

# ── 8. Check MQTT broker ────────────────────────────────────
if ! systemctl is-active --quiet mosquitto 2>/dev/null; then
    echo "Warning: MQTT broker not running"
    echo "  Start with: sudo systemctl start mosquitto"
fi

# ── 9. Launch dashboard ─────────────────────────────────────
echo ""
echo "Starting dashboard at http://0.0.0.0:5001 ..."
echo "Press Ctrl+C to stop."
echo ""
python app.py
