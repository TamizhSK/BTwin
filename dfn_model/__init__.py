"""
dfn_model — DFN-based Battery Digital Twin for Raspberry Pi
============================================================

Uses PyBaMM's Doyle-Fuller-Newman (DFN) electrochemical model with
real published parameter sets to provide physics-based SOC/SOH estimation.

Pipeline:
    PyBaMM DFN (Chen2020 params, real published data)
      → quasi-static discharge → OCV-SOC table (cached)
        → EKF with DFN OCV → real-time SOC
          → SOH cycle/resistance model → RUL estimation
              → BatteryLife HuggingFace dataset → validation context

Raspberry Pi Install:
    pip install "pybamm[jax]"   # ARM-compatible (JAX solver)
    pip install datasets         # HuggingFace datasets

PC/Laptop Install:
    pip install "pybamm[plot,cite]"
    pip install datasets

Quick start:
    from dfn_model.battery_twin import BatteryDigitalTwin
    twin = BatteryDigitalTwin()              # starts DFN init in background
    result = twin.step(3.72, 150.0, 25.0)   # voltage V, current mA, temp °C
"""

from .battery_twin import BatteryDigitalTwin

__all__ = ["BatteryDigitalTwin"]
