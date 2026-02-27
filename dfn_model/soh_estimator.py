"""
State of Health (SOH) and Remaining Useful Life (RUL) Estimator
================================================================

SOH definition (capacity-based):
    SOH = Q_actual / Q_nominal * 100%

SOH definition (resistance-based, alternative):
    SOH_R = (1 - (R_now - R_new) / (R_eol - R_new)) * 100%

Degradation model:
    Combines capacity fade from cycle counting with resistance growth.
    Based on empirical NMC degradation data (linear approximation valid 100–80% SOH).

RUL definition:
    RUL = cycles or time until SOH drops below SOH_EOL (default 80%).

References:
    - Plett, G.L. "Battery Management Systems Vol.2" (2015)
    - Meng, J. et al. "Lithium Polymer Battery State-of-Health Estimation..."
      J. Power Sources 405 (2018)
"""

import time
import numpy as np
from collections import deque


class SOHEstimator:
    """
    SOH / RUL estimator combining:
      1. Cycle counting (capacity fade)
      2. Resistance growth tracking (from EKF R0 estimates)
      3. Exponential smoothing for noise rejection

    Args:
        nominal_capacity_ah:  Rated capacity [Ah]
        nominal_R0:           Fresh-cell R0 [Ω]
        soh_eol_pct:          End-of-life SOH threshold [%] (default 80)
        nominal_cycle_life:   Expected cycle life at EOL (default 500 for 18650)
    """

    # NMC 18650 typical degradation: ~0.04% SOH per full cycle (literature)
    CAPACITY_FADE_PER_CYCLE_PCT = 0.04

    def __init__(
        self,
        nominal_capacity_ah: float = 2.0,
        nominal_R0: float = 0.062,
        soh_eol_pct: float = 80.0,
        nominal_cycle_life: int = 500,
    ):
        self.Q_nominal = nominal_capacity_ah
        self.R0_new = nominal_R0
        self.soh_eol = soh_eol_pct
        self.nominal_cycle_life = nominal_cycle_life

        # Degradation state
        self.soh_capacity = 100.0    # SOH from capacity [%]
        self.soh_resistance = 100.0  # SOH from resistance [%]
        self.soh_combined = 100.0    # Final SOH [%]

        # Cycle counting
        self.full_cycles = 0.0       # Equivalent full cycles accumulated
        self._charge_accumulated_ah = 0.0
        self._last_soc = None
        self._soc_direction = 0      # +1 charge, -1 discharge

        # Resistance tracking (exponential moving average)
        self._r0_ema = nominal_R0
        self._r0_alpha = 0.05        # EMA smoothing factor

        # Throughput tracking for RUL
        self._total_ah_throughput = 0.0

        # Time tracking
        self._start_time = time.time()
        self._last_update_time = time.time()

        # History for trend analysis
        self._soh_history = deque(maxlen=200)
        self._r0_history = deque(maxlen=200)

    def update(self, soc: float, current_a: float, r0_measured: float,
               dt: float = 2.0) -> dict:
        """
        Update SOH estimate with latest sensor data.

        Args:
            soc:          Current SOC from EKF [0..1]
            current_a:    Current [A], positive = discharge
            r0_measured:  Internal resistance from EKF [Ω]
            dt:           Time since last call [s]

        Returns:
            dict with soh, soh_capacity, soh_resistance, rul_cycles,
                  rul_days, full_cycles, r0_ema
        """
        now = time.time()
        dt_actual = min(now - self._last_update_time, 10.0)
        self._last_update_time = now

        # --- 1. Coulomb counting for cycle tracking ---
        dq_ah = abs(current_a) * dt_actual / 3600.0
        self._total_ah_throughput += dq_ah

        if self._last_soc is not None:
            dsoc = soc - self._last_soc
            if dsoc < -0.001:    # discharging
                self._charge_accumulated_ah += abs(current_a) * dt_actual / 3600.0
            elif dsoc > 0.001:   # charging — flush accumulated discharge
                if self._charge_accumulated_ah > 0:
                    full_eq_cycles = self._charge_accumulated_ah / max(self.Q_nominal, 0.1)
                    self.full_cycles += full_eq_cycles
                    self._charge_accumulated_ah = 0.0
        self._last_soc = soc

        # --- 2. Capacity-based SOH (linear degradation model) ---
        capacity_loss_pct = self.full_cycles * self.CAPACITY_FADE_PER_CYCLE_PCT
        self.soh_capacity = float(np.clip(100.0 - capacity_loss_pct, self.soh_eol - 5, 100.0))

        # --- 3. Resistance-based SOH ---
        if r0_measured > 0.01:
            self._r0_ema = (1 - self._r0_alpha) * self._r0_ema + self._r0_alpha * r0_measured
        r0_eol = self.R0_new * 2.0   # EOL resistance = 2× new (industry rule of thumb)
        r0_increase_fraction = (self._r0_ema - self.R0_new) / max(r0_eol - self.R0_new, 1e-4)
        self.soh_resistance = float(np.clip(100.0 - r0_increase_fraction * 20.0, self.soh_eol - 5, 100.0))

        # --- 4. Combined SOH (weighted: 70% capacity, 30% resistance) ---
        self.soh_combined = float(0.70 * self.soh_capacity + 0.30 * self.soh_resistance)
        self.soh_combined = float(np.clip(self.soh_combined, self.soh_eol - 5, 100.0))

        # --- 5. RUL estimation ---
        soh_remaining = max(self.soh_combined - self.soh_eol, 0.0)
        soh_per_cycle = max(self.CAPACITY_FADE_PER_CYCLE_PCT, 0.001)
        rul_cycles = soh_remaining / soh_per_cycle

        # Days estimate: use discharge throughput rate
        runtime_days = (now - self._start_time) / 86400.0 + 0.001
        cycles_per_day = max(self.full_cycles / runtime_days, 0.01)
        rul_days = rul_cycles / cycles_per_day

        # Cap at reasonable maximum
        rul_days = min(rul_days, 3650.0)   # 10 years max

        # Store history
        self._soh_history.append(self.soh_combined)
        self._r0_history.append(self._r0_ema)

        return {
            "soh": round(self.soh_combined, 2),
            "soh_capacity": round(self.soh_capacity, 2),
            "soh_resistance": round(self.soh_resistance, 2),
            "full_cycles": round(self.full_cycles, 3),
            "rul_cycles": round(rul_cycles, 1),
            "rul_days": round(rul_days, 1),
            "r0_ema": round(self._r0_ema, 5),
            "ah_throughput": round(self._total_ah_throughput, 4),
        }

    def get_trend(self) -> str:
        """Return 'degrading', 'stable', or 'unknown' based on SOH history."""
        h = list(self._soh_history)
        if len(h) < 20:
            return "unknown"
        recent = np.mean(h[-10:])
        older = np.mean(h[:10])
        if recent < older - 0.1:
            return "degrading"
        return "stable"
