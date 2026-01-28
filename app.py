from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import sqlite3
import pandas as pd
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'f1ecb21c8860491edfda06fb54eab5993a97856ea1')
app.config['JSON_SORT_KEYS'] = False

# Enable CORS for all routes
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize SocketIO with eventlet mode
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Database configuration
DB_PATH = 'data.db'

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
                  acs_current_a REAL, 
                  wifi_rssi INTEGER)''')
    conn.commit()
    conn.close()

def get_latest_readings(limit=50):
    """Get latest readings from database"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM readings ORDER BY id DESC LIMIT ?', (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]

# Initialize database
init_db()

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
    """Receive sensor data from ESP32"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        print(f"[{datetime.now()}] Received: {data}")
        
        # Save to SQLite
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''INSERT INTO readings 
                     (timestamp, device_id, voltage, current_ma, power_mw, temperature, acs_current_a, wifi_rssi)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                  (datetime.now().isoformat(), 
                   data.get('device_id', 'ESP32_01'), 
                   data.get('voltage', 0),
                   data.get('current_ma', 0),
                   data.get('power_mw', 0),
                   data.get('temperature', 0),
                   data.get('acs_current_a', 0),
                   data.get('wifi_rssi', 0)))
        conn.commit()
        conn.close()
        
        # Broadcast live data to all connected clients via WebSocket
        socketio.emit('new_data', data)
        
        return jsonify({'status': 'success', 'message': 'Data saved'}), 200
        
    except Exception as e:
        print(f"Error: {e}")

@app.route('/data', methods=['POST'])
def data_alias():
    """Alias for /sensor_data endpoint"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        print(f"[{datetime.now()}] Received: {data}")
        
        # Save to SQLite
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''INSERT INTO readings 
                     (timestamp, device_id, voltage, current_ma, power_mw, temperature, acs_current_a, wifi_rssi)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                  (datetime.now().isoformat(), 
                   data.get('device_id', 'ESP32_01'), 
                   data.get('bus_voltage', 0),
                   data.get('ina_current_mA', 0),
                   data.get('bus_voltage', 0) * data.get('ina_current_mA', 0),
                   data.get('temp', 0),
                   data.get('acs_current_A', 0),
                   data.get('wifi_rssi', 0)))
        conn.commit()
        conn.close()
        
        # Broadcast live data to all connected clients via WebSocket
        socketio.emit('new_data', data)
        
        return jsonify({'status': 'success', 'message': 'Data saved'}), 200
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500
    return jsonify({'error': str(e)}), 500

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

if __name__ == '__main__':
    print(f"Starting Battery Digital Twin Dashboard...")
    print(f"Flask Environment: {os.getenv('FLASK_ENV', 'development')}")
    print(f"Debug Mode: {os.getenv('DEBUG', 'False')}")
    print(f"Server running on http://0.0.0.0:5000")
    print(f"Visit http://localhost:5000 in your browser")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=os.getenv('DEBUG', False) == 'True',
        use_reloader=False
    )