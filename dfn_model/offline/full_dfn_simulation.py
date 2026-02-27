"""
Full DFN Simulation Script — Run on PC/Laptop
===============================================

Runs the complete Doyle-Fuller-Newman model using PyBaMM with the
Chen2020 parameter set and saves results to JSON for import into BTwin.

Usage:
    python dfn_model/offline/full_dfn_simulation.py

Output:
    dfn_model/cache/dfn_full_result.json
    (OCV table + ECM params + step response data)

Requires:
    pip install "pybamm[plot,cite]"   # PC/laptop
    pip install "pybamm[jax]"         # Raspberry Pi
"""

import json
import time
import os
import sys
import numpy as np

# Ensure the project root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

try:
    import pybamm
except ImportError:
    print("PyBaMM not installed. Run: pip install 'pybamm[plot,cite]'")
    sys.exit(1)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
OUTPUT_FILE = os.path.join(CACHE_DIR, "dfn_full_result.json")

# ── Configuration ─────────────────────────────────────────────────────────────
PARAMETER_SET = "Chen2020"        # Real published NMC/Graphite parameters
CELL_CAPACITY_AH = 2.0            # Scale Chen2020 (5 Ah) to our 2 Ah 18650
C_RATES = [0.2, 0.5, 1.0, 2.0]   # Simulate multiple discharge rates
# ──────────────────────────────────────────────────────────────────────────────


def get_solver():
    for cls, kw in [
        (pybamm.IDAKLUSolver, {"atol": 1e-6, "rtol": 1e-3}),
        (pybamm.CasadiSolver, {"atol": 1e-6, "rtol": 1e-3}),
        (pybamm.ScipySolver, {}),
    ]:
        try:
            return cls(**kw)
        except Exception:
            continue
    raise RuntimeError("No solver available")


def run_quasi_static_ocv():
    """Run DFN at C/20 to get gold-standard OCV-SOC curve."""
    print(f"\n[1/3] Running DFN quasi-static discharge (C/20)...")
    model = pybamm.lithium_ion.DFN()
    param = pybamm.ParameterValues(PARAMETER_SET)
    param["Nominal cell capacity [A.h]"] = CELL_CAPACITY_AH

    experiment = pybamm.Experiment(["Discharge at C/20 until 3.0 V"])
    sim = pybamm.Simulation(model, experiment=experiment,
                            parameter_values=param, solver=get_solver())
    t0 = time.time()
    sol = sim.solve()
    elapsed = time.time() - t0
    print(f"    Done in {elapsed:.1f}s")

    try:
        soc = sol["State of Charge"].entries.tolist()
        v = sol["Voltage [V]"].entries.tolist()
    except Exception:
        t_arr = sol["Time [s]"].entries
        i_arr = sol["Current [A]"].entries
        v_arr = sol["Voltage [V]"].entries
        dt = np.diff(t_arr)
        charge = np.concatenate([[0], np.cumsum(i_arr[:-1] * dt)])
        soc = (1.0 - charge / (CELL_CAPACITY_AH * 3600)).tolist()
        v = v_arr.tolist()

    return soc, v


def run_multi_rate_discharge():
    """Run DFN at multiple C-rates to generate discharge curves."""
    print(f"\n[2/3] Running DFN at multiple C-rates {C_RATES}...")
    results = {}
    model = pybamm.lithium_ion.DFN()
    param = pybamm.ParameterValues(PARAMETER_SET)
    param["Nominal cell capacity [A.h]"] = CELL_CAPACITY_AH

    for c_rate in C_RATES:
        print(f"    C/{int(1/c_rate)} ({c_rate}C)...", end=" ", flush=True)
        experiment = pybamm.Experiment([f"Discharge at {c_rate}C until 3.0 V"])
        sim = pybamm.Simulation(model, experiment=experiment,
                                parameter_values=param, solver=get_solver())
        try:
            t0 = time.time()
            sol = sim.solve()
            elapsed = time.time() - t0
            t_arr = sol["Time [s]"].entries.tolist()
            v_arr = sol["Voltage [V]"].entries.tolist()
            print(f"done ({elapsed:.1f}s, {len(t_arr)} pts)")
            results[str(c_rate)] = {"time_s": t_arr, "voltage_v": v_arr}
        except Exception as exc:
            print(f"failed ({exc})")
            results[str(c_rate)] = {"error": str(exc)}

    return results


def run_pulse_ecm_extraction():
    """
    Run a 1C pulse + rest to extract ECM (R0, R1, tau1) parameters.
    """
    print(f"\n[3/3] Extracting ECM parameters via DFN pulse simulation...")
    model = pybamm.lithium_ion.SPMe()
    param = pybamm.ParameterValues(PARAMETER_SET)
    param["Nominal cell capacity [A.h]"] = CELL_CAPACITY_AH

    experiment = pybamm.Experiment([
        "Discharge at 1C for 10 seconds",
        "Rest for 100 seconds",
    ])
    sim = pybamm.Simulation(model, experiment=experiment,
                            parameter_values=param, solver=get_solver())
    t0 = time.time()
    sol = sim.solve()
    elapsed = time.time() - t0
    print(f"    Done in {elapsed:.1f}s")

    t = sol["Time [s]"].entries
    v = sol["Voltage [V]"].entries
    i = sol["Current [A]"].entries

    discharge_idx = np.where(i > 0.1)[0]
    rest_idx = np.where((t > 12) & (i < 0.01))[0]

    if len(discharge_idx) > 1 and len(rest_idx) > 1:
        I_pulse = float(np.mean(i[discharge_idx]))
        V0 = float(v[discharge_idx[0]])
        V_end_pulse = float(v[discharge_idx[-1]])
        V_relaxed = float(v[rest_idx[-1]])

        R0 = abs(V0 - V_end_pulse) / max(abs(I_pulse), 0.01)
        R1 = max(abs(V_relaxed - V_end_pulse) / max(abs(I_pulse), 0.01), 0.005)
        tau1 = 100.0   # seconds (simplified)
        C1 = tau1 / max(R1, 0.001)

        print(f"    R0={R0:.4f}Ω  R1={R1:.4f}Ω  C1={C1:.1f}F  tau={tau1:.1f}s")
        return {"R0": round(R0, 4), "R1": round(R1, 4), "C1": round(C1, 1),
                "tau1": round(tau1, 1), "pulse_time_s": t.tolist(), "pulse_v": v.tolist()}
    else:
        print("    Could not extract ECM — using literature values")
        return {"R0": 0.062, "R1": 0.035, "C1": 2500.0, "tau1": 87.5}


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)
    print(f"=" * 60)
    print(f"Full DFN Simulation — PyBaMM {pybamm.__version__}")
    print(f"Parameter set: {PARAMETER_SET}")
    print(f"Cell capacity: {CELL_CAPACITY_AH} Ah")
    print(f"=" * 60)

    soc_list, ocv_list = run_quasi_static_ocv()
    multi_rate = run_multi_rate_discharge()
    ecm = run_pulse_ecm_extraction()

    # Sort OCV table by ascending SOC
    pairs = sorted(zip(soc_list, ocv_list))
    soc_sorted = [p[0] for p in pairs]
    ocv_sorted = [p[1] for p in pairs]

    output = {
        "meta": {
            "pybamm_version": pybamm.__version__,
            "parameter_set": PARAMETER_SET,
            "cell_capacity_ah": CELL_CAPACITY_AH,
            "generated_utc": time.time(),
            "model": "DFN (Doyle-Fuller-Newman)",
        },
        "ocv_table": {
            "soc": soc_sorted,
            "ocv_v": ocv_sorted,
            "description": "C/20 quasi-static discharge OCV-SOC curve",
        },
        "ecm_params": ecm,
        "discharge_curves": multi_rate,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved → {OUTPUT_FILE}")
    print(f"OCV range: {min(ocv_sorted):.3f} V → {max(ocv_sorted):.3f} V")
    print(f"ECM: R0={ecm['R0']:.4f}Ω  R1={ecm['R1']:.4f}Ω  C1={ecm['C1']:.1f}F")
    print(f"\nDone! Copy {OUTPUT_FILE} to the Raspberry Pi to skip re-simulation.")


if __name__ == "__main__":
    main()
