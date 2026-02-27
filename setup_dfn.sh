#!/bin/bash
# ============================================================
#  BTwin — DFN Model Setup Script
#  Installs PyBaMM and dependencies for Battery Digital Twin
# ============================================================

set -e

VENV_PATH="${VENV_PATH:-venv_py312}"
PYTHON="${PYTHON:-python3.12}"

echo "============================================================"
echo "  BTwin DFN Setup"
echo "  Arch: $(uname -m) | Python: $PYTHON"
echo "============================================================"

# Create venv if it doesn't exist
if [ ! -d "$VENV_PATH" ]; then
    echo "[1] Creating virtual environment at $VENV_PATH..."
    $PYTHON -m venv "$VENV_PATH"
else
    echo "[1] Virtual environment already exists at $VENV_PATH"
fi

VENV_PYTHON="$VENV_PATH/bin/python"
VENV_PIP="$VENV_PATH/bin/pip"

# Upgrade pip
echo "[2] Upgrading pip..."
$VENV_PIP install --upgrade pip wheel setuptools

# Detect architecture
ARCH=$(uname -m)
echo "[3] Installing PyBaMM for architecture: $ARCH"

if [[ "$ARCH" == "aarch64" || "$ARCH" == "armv7l" || "$ARCH" == "arm64" ]]; then
    echo "     Raspberry Pi / ARM detected"
    echo "     Installing PyBaMM with JAX solver (ARM-compatible)..."
    $VENV_PIP install "pybamm[jax]"
else
    echo "     x86/x86_64 detected"
    echo "     Installing PyBaMM with full solver support..."
    $VENV_PIP install "pybamm[plot,cite]"
fi

# Install HuggingFace datasets library (optional, for BatteryLife dataset)
echo "[4] Installing HuggingFace datasets (optional)..."
$VENV_PIP install datasets || echo "     (datasets install failed — continuing)"

# Install remaining project dependencies
echo "[5] Installing project requirements..."
$VENV_PIP install -r requirements.txt

# Test PyBaMM
echo "[6] Testing PyBaMM installation..."
$VENV_PYTHON - <<'PYTEST'
import pybamm
print(f"  PyBaMM version: {pybamm.__version__}")
model = pybamm.lithium_ion.DFN()
param = pybamm.ParameterValues("Chen2020")
print(f"  Chen2020 capacity: {param['Nominal cell capacity [A.h]']} Ah")
print(f"  Available param sets: {list(pybamm.parameter_sets)[:5]}...")
print("  DFN model loaded OK!")
PYTEST

echo ""
echo "============================================================"
echo "  Setup complete!"
echo "  Activate:  source $VENV_PATH/bin/activate"
echo "  Run app:   python app.py"
echo ""
echo "  First run: DFN will generate OCV table (~30-120s on Pi)"
echo "  Cached at: dfn_model/cache/ocv_cache_chen2020_v2.json"
echo "  Offline:   python dfn_model/offline/full_dfn_simulation.py"
echo "============================================================"
