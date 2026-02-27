# Battery Digital Twin — Connection Setup (No ACS712)
## ESP32 + INA219 + ADS1115 + DHT22 + TP4056 + 18650 Battery

---

## WHAT CHANGED
- **ACS712 REMOVED** from the circuit entirely (disconnect it from breadboard)
- **GPIO34 freed up** (was used for ACS712 analog out)
- **No more 5V load** on the ESP32 USB rail → no more dimming/brownout
- INA219 now handles **both voltage AND current** measurement
- JSON field `acs_current_a` replaced with `ads_voltage` (ADS1115 reading)

---

## COMPONENTS STILL IN USE

| Component       | Function                              | Power Source     |
|----------------|---------------------------------------|------------------|
| ESP32          | Main controller + WiFi/MQTT           | USB from laptop  |
| INA219         | Battery voltage + current measurement | 3.3V from ESP32  |
| ADS1115        | High-resolution ADC                   | 3.3V from ESP32  |
| DHT22          | Temperature + humidity                | 3.3V from ESP32  |
| TP4056         | Battery charger + protection          | USB-C from charger |
| 18650 cell     | Battery under test                    | N/A (is the source) |
| Load resistor  | Controlled discharge load             | Battery via INA219 |

---

## ESP32 PIN ASSIGNMENTS

```
ESP32 Pin       →  Connected To
─────────────────────────────────────────
GPIO21 (SDA)    →  INA219 SDA  +  ADS1115 SDA  (shared I2C bus)
GPIO22 (SCL)    →  INA219 SCL  +  ADS1115 SCL  (shared I2C bus)
GPIO4           →  DHT22 DATA pin
3V3             →  INA219 VCC  +  ADS1115 VDD  +  DHT22 VCC
GND             →  INA219 GND  +  ADS1115 GND  +  DHT22 GND  +  BAT- rail
USB (micro)     →  Laptop (power + programming)
```

**GPIO34 is now FREE** (was ACS712, no longer used)

---

## WIRING STEP BY STEP

### Step 1: ESP32 on Breadboard
- Place ESP32 straddling the center gap of your breadboard (bottom area)
- USB port facing outward/down for cable access

### Step 2: TP4056 + Battery (off-breadboard or edge)
- 18650 holder wires:
  - Red (holder +) → TP4056 **B+**
  - Black (holder -) → TP4056 **B-**
- TP4056 output to breadboard:
  - **OUT+** → red jumper → breadboard rail, label this **BAT+**
  - **OUT-** → black jumper → breadboard rail, label this **BAT-**

### Step 3: Common Ground (CRITICAL)
- Connect **BAT- rail** to **ESP32 GND** with a jumper wire
- This ensures INA219, ESP32, and battery share the same ground reference

### Step 4: INA219 Wiring
```
INA219 Pin  →  Connection
──────────────────────────
VCC         →  ESP32 3V3
GND         →  ESP32 GND
SDA         →  ESP32 GPIO21
SCL         →  ESP32 GPIO22
VIN+        →  BAT+ rail (TP4056 OUT+)
VIN-        →  One side of LOAD RESISTOR
```
- Other side of load resistor → **BAT- rail**

### Step 5: ADS1115 Wiring
```
ADS1115 Pin →  Connection
──────────────────────────
VDD         →  ESP32 3V3
GND         →  ESP32 GND
SDA         →  ESP32 GPIO21  (same I2C bus as INA219)
SCL         →  ESP32 GPIO22  (same I2C bus as INA219)
ADDR        →  GND (sets I2C address to 0x48)
A0          →  Point of interest to measure (e.g., BAT+ for voltage)
```
NOTE: ADS1115 and INA219 share the I2C bus. They have different
default addresses (INA219=0x40, ADS1115=0x48) so no conflict.

### Step 6: DHT22 Wiring
```
DHT22 Pin   →  Connection
──────────────────────────
VCC (+)     →  ESP32 3V3
GND (-)     →  ESP32 GND
DATA        →  ESP32 GPIO4
```
TIP: If your DHT22 is a bare sensor (not on a breakout board),
add a 10kΩ pull-up resistor between DATA and VCC.

---

## CURRENT FLOW PATH (Battery Discharge Test)

```
18650 (+) → TP4056 B+ → TP4056 OUT+ → BAT+ rail
  → INA219 VIN+ → INA219 VIN- → LOAD RESISTOR
  → BAT- rail → TP4056 OUT- → TP4056 B- → 18650 (-)
```

INA219 sits in the HIGH SIDE and measures:
- Bus voltage (battery terminal voltage)
- Current through the shunt resistor (load current)
- Power (voltage × current)

---

## LOAD RESISTOR SELECTION

For safe testing with a 2000mAh 18650 cell:

| Resistor | Current at 3.7V | Discharge Time | Use Case           |
|----------|-----------------|----------------|---------------------|
| 10Ω 2W  | ~370 mA         | ~5.4 hours     | Moderate test       |
| 22Ω 1W  | ~168 mA         | ~12 hours      | Gentle long test    |
| 47Ω 1W  | ~79 mA          | ~25 hours      | Very slow, safe     |
| 4.7Ω 5W | ~787 mA         | ~2.5 hours     | Fast test (use 5W!) |

RECOMMENDED for first test: **10Ω 2W** or **22Ω 1W**

Make sure the resistor's wattage rating exceeds: P = V²/R
  At 4.2V with 10Ω → P = 1.76W → use 2W or higher

---

## TESTING PROCEDURE

1. **Charge the battery first**
   - Plug USB-C into TP4056
   - Wait for the TP4056 LED to turn GREEN (fully charged)
   - Unplug USB-C from TP4056

2. **Connect ESP32 to laptop via USB**
   - Open Arduino IDE
   - Upload the modified code
   - Open Serial Monitor at 115200 baud

3. **Verify sensors**
   - You should see: "✓ INA219 found" and "✓ ADS1115 found"
   - If any show "✗ NOT found" → check I2C wiring (SDA/SCL)

4. **Start discharge test**
   - With TP4056 USB-C unplugged, the battery discharges through the resistor
   - Serial Monitor shows: voltage, current, power, SOC, SOH every 2 seconds
   - Data publishes to Raspberry Pi via MQTT

5. **Monitor**
   - Voltage should start ~4.15-4.20V and slowly decrease
   - Current should be relatively constant (V/R) and decrease as V drops
   - SOC should count down from ~100% toward 0%
   - Stop test when voltage reaches ~3.0V (or TP4056 protection cuts off)

---

## VISUAL LAYOUT (Top-down breadboard view)

```
    ┌──────────────────── BREADBOARD ────────────────────┐
    │                                                     │
    │   ┌─────────┐                                       │
    │   │ ADS1115 │  VDD→3V3  GND→GND  SDA→21  SCL→22   │
    │   └─────────┘                                       │
    │                                                     │
    │   ┌─────────┐                                       │
    │   │ INA219  │  VCC→3V3  GND→GND  SDA→21  SCL→22   │
    │   │         │  VIN+ ← BAT+                          │
    │   │         │  VIN- → [RESISTOR] → BAT-             │
    │   └─────────┘                                       │
    │                        ┌───────┐                    │
    │                        │ DHT22 │  DATA→GPIO4        │
    │                        │       │  VCC→3V3  GND→GND  │
    │                        └───────┘                    │
    │                                                     │
    │          ┌──────────────────┐                        │
    │          │      ESP32       │                        │
    │          │  3V3  GND  21 22 │  ← I2C + power out    │
    │          │       4          │  ← DHT22 data         │
    │          │     [USB]        │  ← to laptop          │
    │          └──────────────────┘                        │
    │                                                     │
    │  BAT+ rail ═══════════════  (from TP4056 OUT+)      │
    │  BAT- rail ═══════════════  (from TP4056 OUT-)      │
    │           ↕                                         │
    │     Connected to ESP32 GND (common ground)          │
    └─────────────────────────────────────────────────────┘

    ┌──────────┐      ┌──────────────┐
    │  TP4056  │──────│ 18650 holder │
    │ OUT+→BAT+│      │  + → B+      │
    │ OUT-→BAT-│      │  - → B-      │
    │ USB-C    │←── charger (only for charging)
    └──────────┘      └──────────────┘
```

---

## IMPORTANT REMINDERS

1. **Do NOT power ESP32 from battery** — keep USB to laptop
2. **Do NOT plug TP4056 USB-C while running discharge test**
   (charging and discharging simultaneously stresses the cell)
3. **Common ground is essential** — BAT- must connect to ESP32 GND
4. **ACS712 is completely disconnected** — remove all its wires
5. If you want to add ACS712 later, use a **separate 5V USB supply** for it
