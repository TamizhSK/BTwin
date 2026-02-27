from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import sqlite3
import pandas as pd
from datetime import datetime
import os
import json
import threading
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'f1ecb21c8860491edfda06fb54eab5993a97856ea1')
app.config['JSON_SORT_KEYS'] = False

# Enable CORS for all routes
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize SocketIO with threading mode and both transports
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Database configuration
DB_PATH = 'data.db'

# MQTT Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MQTT_TOPIC = os.getenv('MQTT_TOPIC', 'esp32/sensor_data')
MQTT_USERNAME = os.getenv('MQTT_USERNAME', '')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')

# Global MQTT client
mqtt_client = None

def init_db():
    """Initialize SQLite database with readings table"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS readings 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT, 
                  device_id TEXT, 
                  voltage REAL, 
                  current_ma REAL, 
                  power_mw REAL, 
                  temperature REAL, 
                  humidity REAL,
                  ads_voltage REAL,
                  soc_percent REAL,
                  soh_percent REAL,
                  wifi_rssi INTEGER)''')
    conn.commit()
    conn.close()

def save_sensor_data(data):
    """Save sensor data to database and broadcast via WebSocket"""
    try:
        print(f"[{datetime.now()}] Processing: {data}")
        
        # Save to SQLite
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''INSERT INTO readings 
                     (timestamp, device_id, voltage, current_ma, power_mw, temperature, humidity, ads_voltage, soc_percent, soh_percent, wifi_rssi)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (datetime.now().isoformat(), 
                   data.get('device_id', 'ESP32_01'), 
                   data.get('voltage', 0),
                   data.get('current_ma', 0),
                   data.get('power_mw', 0),
                   data.get('temperature', 0),
                   data.get('humidity', 0),
                   data.get('ads_voltage', 0),
                   data.get('soc_percent', 0),
                   data.get('soh_percent', 100),
                   data.get('wifi_rssi', -100)))
        conn.commit()
        conn.close()
        
        # Broadcast live data to all connected clients via WebSocket
        socketio.emit('new_data', data)
        
        return True
    except Exception as e:
        print(f"Error saving data: {e}")
        return False

# MQTT Event Handlers
def on_mqtt_connect(client, userdata, flags, rc):
    """Callback for MQTT connection"""
    if rc == 0:
        print(f"[{datetime.now()}] MQTT Connected successfully")
        client.subscribe(MQTT_TOPIC)
        print(f"[{datetime.now()}] Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"[{datetime.now()}] MQTT Connection failed with code {rc}")

def on_mqtt_message(client, userdata, msg):
    """Callback for MQTT message received"""
    try:
        payload = msg.payload.decode('utf-8')
        data = json.loads(payload)
        print(f"[{datetime.now()}] MQTT received: {data}")
        save_sensor_data(data)
    except Exception as e:
        print(f"[{datetime.now()}] Error processing MQTT message: {e}")

def init_mqtt():
    """Initialize MQTT client"""
    global mqtt_client
    
    try:
        import warnings
        warnings.filterwarnings("ignore", category=DeprecationWarning)
        
        mqtt_client = mqtt.Client()
        mqtt_client.on_connect = on_mqtt_connect
        mqtt_client.on_message = on_mqtt_message
        
        if MQTT_USERNAME and MQTT_PASSWORD:
            mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
        print(f"[{datetime.now()}] MQTT client started, connecting to {MQTT_BROKER}:{MQTT_PORT}")
    except Exception as e:
        print(f"[{datetime.now()}] MQTT connection error: {e}")

def get_latest_readings(limit=50):
    """Get latest readings from database"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM readings ORDER BY id DESC LIMIT ?', (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]

# Initialize database and MQTT
init_db()
init_mqtt()

# Routes
@app.route('/')
def dashboard():
    """Serve main dashboard page"""
    return render_template('index.html')

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get historical sensor data"""
    limit = request.args.get('limit', 100, type=int)
    data = get_latest_readings(limit)
    return jsonify(data)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get statistics from sensor data"""
    data = get_latest_readings(limit=100)
    
    if not data:
        return jsonify({
            'voltage_avg': 0,
            'current_avg': 0,
            'power_avg': 0,
            'temp_avg': 0,
            'total_readings': 0
        })
    
    df = pd.DataFrame(data)
    
    stats = {
        'voltage_avg': float(df['voltage'].mean()) if len(df) > 0 else 0,
        'voltage_min': float(df['voltage'].min()) if len(df) > 0 else 0,
        'voltage_max': float(df['voltage'].max()) if len(df) > 0 else 0,
        'current_avg': float(df['current_ma'].mean()) if len(df) > 0 else 0,
        'current_max': float(df['current_ma'].max()) if len(df) > 0 else 0,
        'power_avg': float(df['power_mw'].mean()) if len(df) > 0 else 0,
        'power_max': float(df['power_mw'].max()) if len(df) > 0 else 0,
        'temp_avg': float(df['temperature'].mean()) if len(df) > 0 else 0,
        'temp_max': float(df['temperature'].max()) if len(df) > 0 else 0,
        'total_readings': len(df)
    }
    
    return jsonify(stats)

@app.route('/sensor_data', methods=['POST'])
def sensor_data():
    """Receive sensor data from ESP32 (HTTP fallback)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        if save_sensor_data(data):
            return jsonify({'status': 'success', 'message': 'Data saved'}), 200
        else:
            return jsonify({'error': 'Failed to save data'}), 500
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/data', methods=['POST'])
def data_alias():
    """Alias for /sensor_data endpoint"""
    return sensor_data()

# SocketIO events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f"[{datetime.now()}] Client connected")
    emit('response', {'data': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print(f"[{datetime.now()}] Client disconnected")

@socketio.on('request_latest')
def handle_request_latest():
    """Send latest readings to requesting client"""
    data = get_latest_readings(limit=1)
    if data:
        emit('new_data', data[0])

@app.route('/api/latest')
def get_latest():
    """Get latest sensor reading"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM readings ORDER BY id DESC LIMIT 1')
        row = c.fetchone()
        conn.close()
        
        if row:
            return jsonify({'success': True, 'data': dict(row)})
        else:
            return jsonify({'success': False, 'message': 'No data found'})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    import socket
    
    # Get Raspberry Pi IP address
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = "192.168.0.148"
    
    print(f"Starting Battery Digital Twin Dashboard...")
    print(f"Flask Environment: {os.getenv('FLASK_ENV', 'development')}")
    print(f"Debug Mode: {os.getenv('DEBUG', 'False')}")
    print(f"MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"MQTT Topic: {MQTT_TOPIC}")
    print(f"")
    print(f"🌐 Server URLs:")
    print(f"   Local:    http://localhost:5001")
    print(f"   Network:  http://{local_ip}:5001")
    print(f"")
    print(f"📱 Share this URL with friends/invigilators:")
    print(f"   http://{local_ip}:5001")
    print(f"")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=5001,
        debug=os.getenv('DEBUG', False) == 'True',
        use_reloader=False
    )