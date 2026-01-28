# Battery Digital Twin Dashboard

A real-time IoT dashboard for monitoring ESP32 battery sensor data using Flask, Socket.IO, and Plotly.

## Features

- **Real-time Data Visualization**: Live charts and gauges using Plotly.js
- **Responsive Design**: Mobile-first CSS with responsive grid layouts
- **WebSocket Communication**: Real-time updates via Socket.IO
- **SQLite Database**: Persistent data storage
- **Modular Architecture**: Separated CSS, JavaScript, and configuration files

## Project Structure

```
digital_twin/
├── app.py                 # Flask application with Socket.IO
├── database.py           # Database utilities (empty - using inline SQLite)
├── requirements.txt      # Python dependencies
├── .env                 # Environment variables
├── env.example          # Environment template
├── templates/
│   └── index.html       # Main dashboard template
├── static/
│   ├── css/
│   │   └── style.css    # Responsive dashboard styles
│   └── js/
│       ├── config.js    # Dashboard configuration
│       └── dashboard.js # Main dashboard JavaScript class
└── venv/               # Python virtual environment
```

## Technology Stack

### Backend
- **Flask**: Web framework
- **Flask-SocketIO**: Real-time WebSocket communication
- **SQLite**: Database for sensor data storage
- **Pandas**: Data processing
- **Flask-CORS**: Cross-origin resource sharing

### Frontend
- **Plotly.js**: Interactive charts and gauges
- **Socket.IO Client**: Real-time data updates
- **Responsive CSS Grid**: Mobile-first design
- **Vanilla JavaScript**: ES6+ class-based architecture

## Installation

1. **Clone and setup**:
   ```bash
   cd digital_twin
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure environment**:
   ```bash
   cp env.example .env
   # Edit .env with your settings
   ```

3. **Run the application**:
   ```bash
   python app.py
   ```

4. **Access dashboard**:
   - Local: http://localhost:5000
   - Network: http://192.168.1.100:5000

## Configuration

### Dashboard Settings (`static/js/config.js`)
- Chart colors and styling
- Data point limits
- Gauge ranges and thresholds
- Alert thresholds for metrics

### Environment Variables (`.env`)
- `SECRET_KEY`: Flask secret key
- `DEBUG`: Debug mode (True/False)
- `FLASK_ENV`: Environment (development/production)

## API Endpoints

- `GET /`: Dashboard interface
- `POST /sensor_data`: Receive ESP32 sensor data
- `GET /api/history?limit=100`: Get historical data
- `GET /api/stats`: Get statistical summary

## WebSocket Events

- `connect`: Client connection established
- `disconnect`: Client disconnection
- `new_data`: Real-time sensor data broadcast
- `request_latest`: Request latest sensor reading

## Sensor Data Format

```json
{
  "device_id": "ESP32_01",
  "voltage": 3.7,
  "current_ma": 150.5,
  "power_mw": 555.85,
  "temperature": 25.3,
  "acs_current_a": 0.155,
  "wifi_rssi": -45
}
```

## Responsive Design

- **Desktop**: Full grid layout with multiple charts
- **Tablet**: Responsive grid with stacked charts
- **Mobile**: Single column layout with optimized metrics

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with ES6 support

## Development

### Adding New Metrics
1. Update `CONFIG` in `static/js/config.js`
2. Add HTML elements in `templates/index.html`
3. Update `updateMetrics()` in `dashboard.js`
4. Add database fields in `app.py`

### Customizing Charts
- Modify colors in `CONFIG.COLORS`
- Adjust thresholds in `CONFIG.THRESHOLDS`
- Update gauge ranges in `CONFIG.GAUGES`

## Production Deployment

1. **Install Gunicorn**:
   ```bash
   pip install gunicorn
   ```

2. **Run with Gunicorn**:
   ```bash
   gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 app:app
   ```

3. **Environment**:
   ```bash
   export FLASK_ENV=production
   export DEBUG=False
   ```

## License

MIT License - see project files for details.
