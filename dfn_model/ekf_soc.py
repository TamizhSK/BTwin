"""
Extended Kalman Filter for SOC Estimation
==========================================

State vector:  x = [SOC, V_RC]
    SOC   — State of Charge [0..1]
    V_RC  — RC polarisation voltage (one-pair Thevenin/ECM) [V]

Measurement:   z = V_terminal [V]

Process model (discrete-time, timestep dt):
    SOC_k+1 = SOC_k - (eta * I * dt) / Q_total
    V_RC_k+1 = exp(-dt / tau1) * V_RC_k + R1 * (1 - exp(-dt / tau1)) * I

Observation model:
    V_hat = OCV(SOC) + I * R0 + V_RC

OCV(SOC) is provided by the DFN-generated lookup table from PyBaMM.
"""

import numpy as np


class EKFSoCEstimator:
    """
    Extended Kalman Filter for real-time battery SOC estimation.

    Args:
        dfn_model:      DFNInterface instance (provides OCV function)
        capacity_ah:    Nominal cell capacity [Ah]
        R0:             Ohmic resistance [Ω]  (from DFN ECM extraction)
        R1:             RC resistance [Ω]
        C1:             RC capacitance [F]   (tau = R1*C1)
        eta:            Coulombic efficiency (0.98 typical for Li-ion)
        temp_c:         Initial temperature [°C]
    """

    def __init__(
        self,
        dfn_model,
        capacity_ah: float = 2.0,
        R0: float = 0.062,
        R1: float = 0.035,
        C1: float = 2500.0,
        eta: float = 0.98,
        temp_c: float = 25.0,
    ):
        self._dfn = dfn_model
        self.Q_As = capacity_ah * 3600.0   # capacity in Ampere-seconds
        self.R0 = R0
        self.R1 = R1
        self.C1 = C1
        self.tau1 = R1 * C1
        self.eta = eta
        self.temp_c = temp_c

        # State: [SOC, V_RC]
        self.x = np.array([0.9, 0.0])   # initial guess; updated on first voltage

        # Covariance matrix P
        self.P = np.diag([0.01, 0.001])

        # Process noise covariance Q
        self.Q_noise = np.diag([1e-5, 1e-6])

        # Measurement noise variance R (voltage measurement noise ≈ 1 mV std)
        self.R_noise = (0.005) ** 2

        self._initialized = False

    def initialize_from_voltage(self, v_terminal: float, temp_c: float = 25.0):
        """
        Bootstrap SOC from resting terminal voltage using OCV→SOC inversion.
        Call once when the battery is at rest (|I| < 50 mA).
        """
        self.temp_c = temp_c
        soc_init = self._dfn.soc_from_ocv(v_terminal, temp_c)
        self.x = np.array([soc_init, 0.0])
        self.P = np.diag([0.005, 0.001])
        self._initialized = True
        return soc_init

    def update(self, v_measured: float, current_a: float,
               dt: float = 2.0, temp_c: float = 25.0) -> dict:
        """
        Run one EKF predict+update step.

        Args:
            v_measured:  Terminal voltage measurement [V]
            current_a:   Current [A], positive = discharge, negative = charge
            dt:          Time since last call [s]
            temp_c:      Battery temperature [°C]

        Returns:
            dict with soc, v_rc, v_predicted, innovation, sigma_soc
        """
        self.temp_c = temp_c

        # ---- lazy initialisation from first voltage reading ----
        if not self._initialized:
            self.initialize_from_voltage(v_measured, temp_c)

        # Update ECM params from DFN if available
        ecm = self._dfn.get_ecm_params()
        self.R0 = ecm["R0"]
        self.R1 = ecm["R1"]
        self.C1 = ecm["C1"]
        self.tau1 = max(self.R1 * self.C1, 1.0)

        # ---- PREDICT ----
        soc_k = float(self.x[0])
        v_rc_k = float(self.x[1])

        alpha = np.exp(-dt / self.tau1)

        soc_pred = float(np.clip(soc_k - self.eta * current_a * dt / self.Q_As, 0.0, 1.0))
        v_rc_pred = alpha * v_rc_k + self.R1 * (1.0 - alpha) * current_a

        x_pred = np.array([soc_pred, v_rc_pred])

        # State transition Jacobian F
        F = np.array([
            [1.0, 0.0],
            [0.0, alpha],
        ])

        P_pred = F @ self.P @ F.T + self.Q_noise

        # ---- UPDATE ----
        ocv = self._dfn.ocv_from_soc(soc_pred, temp_c)
        v_hat = ocv + current_a * self.R0 + v_rc_pred

        innovation = v_measured - v_hat

        # Observation Jacobian H = [dV/dSOC, dV/dV_RC]
        docv_ds = self._dfn.docv_dsoc(soc_pred, temp_c)
        H = np.array([[docv_ds, 1.0]])

        S = H @ P_pred @ H.T + self.R_noise
        K = (P_pred @ H.T) / float(S)   # Kalman gain [2x1]

        self.x = x_pred + K.flatten() * innovation
        self.x[0] = float(np.clip(self.x[0], 0.0, 1.0))  # hard clamp SOC
        self.P = (np.eye(2) - np.outer(K.flatten(), H)) @ P_pred

        sigma_soc = float(np.sqrt(self.P[0, 0]))

        return {
            "soc": float(self.x[0]),
            "v_rc": float(self.x[1]),
            "v_predicted": float(v_hat),
            "innovation": float(innovation),
            "sigma_soc": sigma_soc,
            "ocv": float(ocv),
            "R0": self.R0,
            "R1": self.R1,
        }

    @property
    def soc(self) -> float:
        return float(self.x[0])

    @property
    def uncertainty_percent(self) -> float:
        """SOC uncertainty as ± percentage points (1-sigma)."""
        return float(np.sqrt(self.P[0, 0])) * 100.0
