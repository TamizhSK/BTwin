"""
Battery Digital Twin — Main Orchestrator
=========================================

Integrates:
  - PyBaMM DFN/SPM model (Chen2020 parameter set, real published data)
  - Extended Kalman Filter (SOC estimation using DFN OCV table)
  - SOH / RUL Estimator (cycle counting + resistance growth)
  - Background DFN simulation (periodic high-fidelity state check)

Usage in app.py:
    from dfn_model.battery_twin import BatteryDigitalTwin

    twin = BatteryDigitalTwin()          # starts DFN init in background
    result = twin.step(3.72, 150.0, 25.0)
    # result = { soc_ekf, soh, rul_days, v_predicted, innovation, ... }

    status = twin.dfn_status             # for /api/dfn_status endpoint
"""

import time
import threading
from collections import deque

from .pybamm_interface import DFNInterface
from .ekf_soc import EKFSoCEstimator
from .soh_estimator import SOHEstimator


class BatteryDigitalTwin:
    """
    Physics-based battery digital twin for real-time SOC/SOH estimation.

    Parameters:
        parameter_set       PyBaMM parameter set (default: "Chen2020")
        cell_capacity_ah    Actual cell capacity in Ah (default: 2.0)
        dfn_bg_interval_s   How often to run background DFN simulation (s)
    """

    def __init__(
        self,
        parameter_set: str = "Chen2020",
        cell_capacity_ah: float = 2.0,
        dfn_bg_interval_s: float = 120.0,
    ):
        self.cell_capacity_ah = cell_capacity_ah
        self._dfn_bg_interval = dfn_bg_interval_s

        # --- DFN model (starts async init immediately) ---
        self.dfn = DFNInterface(
            parameter_set=parameter_set,
            cell_capacity_ah=cell_capacity_ah,
        )
        self._init_thread = self.dfn.initialize_async()

        # --- EKF and SOH (created lazily after first data point) ---
        self._ekf: EKFSoCEstimator | None = None
        self._soh: SOHEstimator | None = None
        self._ekf_lock = threading.Lock()

        # --- Rolling buffer for background DFN ---
        self._current_buffer: deque = deque(maxlen=60)  # last ~2 min at 2s
        self._last_dfn_bg_time: float = 0.0

        # --- Latest results (for /api/dfn_status) ---
        self._last_result: dict = {}
        self._step_count: int = 0
        self._start_time: float = time.time()

    # ------------------------------------------------------------------ #
    #  Main step function — call once per sensor reading                  #
    # ------------------------------------------------------------------ #

    def step(
        self,
        voltage_v: float,
        current_ma: float,
        temperature_c: float = 25.0,
        dt: float = 2.0,
    ) -> dict:
        """
        Process one sensor reading and return estimated battery state.

        Args:
            voltage_v:      Terminal voltage [V]
            current_ma:     Current [mA], positive = discharge
            temperature_c:  Temperature [°C]
            dt:             Time since last reading [s]

        Returns:
            dict with soc_ekf, soc_pct, soh, rul_days, v_predicted,
                  innovation, sigma_soc, r0, dfn_ready, and more
        """
        current_a = current_ma / 1000.0
        self._current_buffer.append(current_ma)

        # ---- Lazy create EKF / SOH once DFN is ready ----
        with self._ekf_lock:
            if self._ekf is None and self.dfn.is_ready:
                ecm = self.dfn.get_ecm_params()
                self._ekf = EKFSoCEstimator(
                    dfn_model=self.dfn,
                    capacity_ah=self.cell_capacity_ah,
                    R0=ecm["R0"],
                    R1=ecm["R1"],
                    C1=ecm["C1"],
                    temp_c=temperature_c,
                )
                self._soh = SOHEstimator(
                    nominal_capacity_ah=self.cell_capacity_ah,
                    nominal_R0=ecm["R0"],
                )
                print(f"[Twin] EKF + SOH estimator initialised "
                      f"(R0={ecm['R0']:.4f}Ω, R1={ecm['R1']:.4f}Ω)")

        # ---- Run EKF ----
        if self._ekf is not None:
            ekf_result = self._ekf.update(
                v_measured=voltage_v,
                current_a=current_a,
                dt=dt,
                temp_c=temperature_c,
            )
            soc_ekf = ekf_result["soc"]
            v_pred = ekf_result["v_predicted"]
            innovation = ekf_result["innovation"]
            sigma_soc = ekf_result["sigma_soc"]
            ocv = ekf_result["ocv"]
            r0 = ekf_result["R0"]
        else:
            # EKF not ready — use raw OCV inversion
            soc_ekf = self.dfn.soc_from_ocv(voltage_v, temperature_c)
            ocv = self.dfn.ocv_from_soc(soc_ekf, temperature_c)
            v_pred = voltage_v
            innovation = 0.0
            sigma_soc = 0.05
            r0 = 0.062

        # ---- Update SOH ----
        soh_result = {}
        if self._soh is not None:
            soh_result = self._soh.update(
                soc=soc_ekf,
                current_a=current_a,
                r0_measured=r0,
                dt=dt,
            )

        # ---- Trigger background DFN periodically ----
        now = time.time()
        if (now - self._last_dfn_bg_time > self._dfn_bg_interval
                and len(self._current_buffer) >= 5
                and self.dfn.is_ready):
            self.dfn.run_background_dfn(list(self._current_buffer), dt_s=dt)
            self._last_dfn_bg_time = now

        self._step_count += 1

        # ---- Package result ----
        result = {
            # Core estimates
            "soc_ekf": round(soc_ekf, 4),
            "soc_pct": round(soc_ekf * 100.0, 2),
            "ocv": round(ocv, 4),
            "v_predicted": round(v_pred, 4),
            "v_measured": round(voltage_v, 4),
            "innovation": round(innovation, 5),
            "sigma_soc": round(sigma_soc, 5),
            "r0": round(r0, 5),

            # SOH / RUL
            "soh": soh_result.get("soh", 100.0),
            "soh_capacity": soh_result.get("soh_capacity", 100.0),
            "soh_resistance": soh_result.get("soh_resistance", 100.0),
            "rul_days": soh_result.get("rul_days", 0.0),
            "rul_cycles": soh_result.get("rul_cycles", 0.0),
            "full_cycles": soh_result.get("full_cycles", 0.0),
            "r0_ema": soh_result.get("r0_ema", r0),

            # DFN metadata
            "dfn_ready": self.dfn.is_ready,
            "dfn_status": self.dfn.status,
            "dfn_soc": round(self.dfn.dfn_last_soc * 100.0, 2),
            "dfn_voltage": round(self.dfn.dfn_last_voltage, 4),

            # System
            "step_count": self._step_count,
            "uptime_s": round(now - self._start_time, 1),
        }
        self._last_result = result
        return result

    # ------------------------------------------------------------------ #
    #  Status endpoint data                                               #
    # ------------------------------------------------------------------ #

    @property
    def dfn_status(self) -> dict:
        """
        Return DFN + twin status dict.
        NOTE: OCV table is NOT included here to keep SocketIO payloads small.
        Fetch OCV table separately via GET /api/dfn_ocv_table.
        """
        dfn_info = self.dfn.get_status()
        dfn_info.update({
            "last_result": self._last_result,
            "step_count": self._step_count,
            "uptime_s": round(time.time() - self._start_time, 1),
            "ekf_ready": self._ekf is not None,
        })
        return dfn_info

    def wait_for_ready(self, timeout: float = 300.0) -> bool:
        """Block until DFN is ready (for testing). Returns True on success."""
        self._init_thread.join(timeout=timeout)
        return self.dfn.is_ready
