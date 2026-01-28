# 🚀 Production Deployment: Gunicorn + Nginx Setup

## Overview

**Why Gunicorn + Nginx?**
- **Gunicorn** = Production WSGI server (runs Flask app safely)
- **Nginx** = Reverse proxy (handles incoming requests, SSL, compression)
- **Result** = Stable, secure, scalable deployment

**Current vs Production:**
```
Development:        python3 app.py (single-threaded, debug mode)
Production:         gunicorn + Nginx (multi-worker, optimized)
```

---

## Prerequisites

✅ Flask app running successfully locally: `python3 app.py`
✅ venv activated and all dependencies installed
✅ Raspberry Pi with SSH access
✅ Basic terminal comfort

---

## Part 1: Install Gunicorn

### Step 1: Activate venv

```bash
cd ~/battery_digital_twin
source venv/bin/activate
```

### Step 2: Install Gunicorn

```bash
pip install gunicorn==22.0.0
```

Verify:
```bash
which gunicorn
gunicorn --version
```

Should show: `gunicorn (version 22.0.0)`

---

## Part 2: Test Gunicorn Locally

### Step 1: Run Gunicorn

```bash
cd ~/battery_digital_twin
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

**What this does:**
- `-w 4` = 4 worker processes (handles 4 concurrent requests)
- `-b 0.0.0.0:5000` = bind to all interfaces on port 5000
- `app:app` = Flask app in app.py

**Expected output:**
```
[2026-01-28 19:00:00 +0000] [1234] [INFO] Starting gunicorn 22.0.0
[2026-01-28 19:00:00 +0000] [1234] [INFO] Listening at: http://0.0.0.0:5000 (1234)
[2026-01-28 19:00:00 +0000] [1234] [INFO] Using worker: eventlet
```

### Step 2: Test in Browser

Visit: `http://192.168.1.100:5000`

Should see dashboard load fine.

### Step 3: Stop Gunicorn

Press `Ctrl+C`

---

## Part 3: Create Gunicorn Systemd Service

This auto-starts Gunicorn on Pi reboot.

### Step 1: Create service file

```bash
sudo nano /etc/systemd/system/gunicorn-battery-twin.service
```

### Step 2: Paste this content

```ini
[Unit]
Description=Gunicorn instance for Battery Digital Twin
After=network.target

[Service]
User=pi
Group=www-data
WorkingDirectory=/home/pi/battery_digital_twin
Environment="PATH=/home/pi/battery_digital_twin/venv/bin"
ExecStart=/home/pi/battery_digital_twin/venv/bin/gunicorn \
    --workers 4 \
    --worker-class eventlet \
    --bind 127.0.0.1:8000 \
    --access-logfile /tmp/gunicorn_access.log \
    --error-logfile /tmp/gunicorn_error.log \
    app:app

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Key points:**
- `--bind 127.0.0.1:8000` = Only local (port 8000), Nginx will forward
- `--workers 4` = 4 concurrent processes
- `--worker-class eventlet` = Supports SocketIO async
- Logs go to `/tmp/` (temporary, auto-clear)

Save: `Ctrl+X` → `Y` → `Enter`

### Step 3: Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable gunicorn-battery-twin.service
sudo systemctl start gunicorn-battery-twin.service
```

### Step 4: Check Status

```bash
sudo systemctl status gunicorn-battery-twin.service
```

Should show:
```
● gunicorn-battery-twin.service - Gunicorn instance for Battery Digital Twin
     Loaded: loaded (/etc/systemd/system/gunicorn-battery-twin.service; enabled)
     Active: active (running) since Wed 2026-01-28 19:05:00 GMT; 2s ago
```

### Step 5: View Logs

```bash
sudo journalctl -u gunicorn-battery-twin.service -f
```

Press `Ctrl+C` to exit logs.

---

## Part 4: Install & Configure Nginx

### Step 1: Install Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

### Step 2: Enable Nginx

```bash
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Step 3: Verify Nginx Running

```bash
sudo systemctl status nginx
```

Should show `active (running)`.

---

## Part 5: Configure Nginx Reverse Proxy

### Step 1: Create Nginx config for our app

```bash
sudo nano /etc/nginx/sites-available/battery-twin
```

### Step 2: Paste this configuration

```nginx
upstream gunicorn_app {
    server 127.0.0.1:8000;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    
    # Logging
    access_log /var/log/nginx/battery-twin-access.log;
    error_log /var/log/nginx/battery-twin-error.log;
    
    # Prevent exposing version
    server_tokens off;
    
    # Max upload size
    client_max_body_size 10M;
    
    location / {
        # Proxy to Gunicorn
        proxy_pass http://gunicorn_app;
        
        # Pass original request info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (important for Socket.IO!)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Connection "Upgrade";
        
        # Timeouts for SocketIO
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static files (if you add them later)
    location /static/ {
        alias /home/pi/battery_digital_twin/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**What this does:**
- Listens on port 80 (HTTP)
- Forwards all requests to Gunicorn (port 8000)
- Supports WebSocket for Socket.IO ✅
- Sets proper headers for proxying
- Long timeouts for real-time updates

Save: `Ctrl+X` → `Y` → `Enter`

### Step 3: Enable this config

```bash
sudo ln -s /etc/nginx/sites-available/battery-twin /etc/nginx/sites-enabled/battery-twin
```

### Step 4: Remove default config (optional but recommended)

```bash
sudo rm /etc/nginx/sites-enabled/default
```

### Step 5: Test Nginx config

```bash
sudo nginx -t
```

Should show:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration will be successful
```

### Step 6: Restart Nginx

```bash
sudo systemctl restart nginx
```

### Step 7: Verify Nginx running

```bash
sudo systemctl status nginx
```

---

## Part 6: Test Full Stack

### Step 1: Verify both services running

```bash
sudo systemctl status gunicorn-battery-twin.service
sudo systemctl status nginx
```

Both should show `active (running)`.

### Step 2: Check port binding

```bash
sudo netstat -tuln | grep -E ':(80|8000)'
```

Should show:
```
tcp  0  0 127.0.0.1:8000    0.0.0.0:*    LISTEN    (Gunicorn)
tcp  0  0 0.0.0.0:80       0.0.0.0:*    LISTEN    (Nginx)
```

### Step 3: Test locally on Pi

```bash
curl http://localhost
```

Should return HTML of your dashboard.

### Step 4: Test from another computer

Visit: `http://192.168.1.100`

(No port needed - Nginx handles port 80 by default)

Should see dashboard load perfectly.

---

## Part 7: Verify Real-Time Updates Work

### Test WebSocket Connection

1. Open dashboard: `http://192.168.1.100`
2. Open browser dev tools: `F12`
3. Go to Network tab, filter by "WS" (WebSocket)
4. Trigger ESP32 to send data
5. Should see WebSocket connection active

If you see errors, check:
```bash
sudo tail -50 /var/log/nginx/battery-twin-error.log
sudo journalctl -u gunicorn-battery-twin.service -n 50
```

---

## Part 8: Update ESP32 Code

In your ESP32 Arduino sketch:

```cpp
const char* serverURL = "http://192.168.1.100/sensor_data";
```

**Important:** No port number needed! Nginx listens on port 80.

---

## Monitoring & Maintenance

### View Gunicorn logs

```bash
sudo journalctl -u gunicorn-battery-twin.service -f --lines=50
```

### View Nginx logs

```bash
# Access log
tail -f /var/log/nginx/battery-twin-access.log

# Error log
tail -f /var/log/nginx/battery-twin-error.log
```

### Check system resources

```bash
# RAM usage
free -h

# Disk space
df -h

# CPU temperature
vcgencmd measure_temp
```

### Restart services

```bash
# Gunicorn
sudo systemctl restart gunicorn-battery-twin.service

# Nginx
sudo systemctl restart nginx

# Both
sudo systemctl restart gunicorn-battery-twin.service nginx
```

---

## Performance Tuning

### Increase Gunicorn workers

Edit: `sudo nano /etc/systemd/system/gunicorn-battery-twin.service`

Change:
```ini
--workers 4
```

To (for more concurrent connections):
```ini
--workers 8
```

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart gunicorn-battery-twin.service
```

### Enable Gzip compression (Nginx)

Edit: `sudo nano /etc/nginx/sites-available/battery-twin`

Add before `upstream`:
```nginx
gzip on;
gzip_types text/plain text/css text/xml text/javascript application/json;
gzip_min_length 1000;
```

Then restart Nginx:
```bash
sudo systemctl restart nginx
```

---

## Troubleshooting

### Problem: "502 Bad Gateway"
**Cause:** Gunicorn not running or port mismatch

**Solution:**
```bash
sudo systemctl status gunicorn-battery-twin.service
# If not running:
sudo systemctl start gunicorn-battery-twin.service
```

### Problem: WebSocket not connecting
**Cause:** Nginx headers not forwarding correctly

**Solution:** Check Nginx config has:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Restart Nginx: `sudo systemctl restart nginx`

### Problem: Charts not updating
**Cause:** SocketIO connection lost

**Solution:**
1. Open F12 Dev Tools
2. Check Console for errors
3. Check Network tab for WebSocket errors
4. Verify Nginx UpSocket headers present

### Problem: High RAM usage
**Cause:** Too many Gunicorn workers

**Solution:** Reduce workers in service file

```bash
sudo systemctl edit gunicorn-battery-twin.service
# Change --workers 8 to --workers 4
sudo systemctl restart gunicorn-battery-twin.service
```

---

## Security Enhancements (Optional)

### Add HTTPS with Let's Encrypt (requires domain)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### Restrict access to local network only

Edit: `sudo nano /etc/nginx/sites-available/battery-twin`

Add before `server_name`:
```nginx
# Only allow local network
# (Adjust 192.168 to your network)
allow 192.168.0.0/16;
deny all;
```

---

## Auto-Start on Pi Reboot

Both services will auto-start because of:
```ini
[Install]
WantedBy=multi-user.target
```

Verify:
```bash
sudo systemctl is-enabled gunicorn-battery-twin.service
sudo systemctl is-enabled nginx
```

Both should show `enabled`.

---

## Summary: What You Now Have

```
User Request (Port 80)
    ↓
Nginx (Reverse Proxy)
    ↓ (forwards to port 8000)
Gunicorn (4 workers)
    ↓ (runs Flask app)
Flask (processes request, broadcasts via SocketIO)
    ↓
SQLite Database
    ↓ (saves data)
```

**Benefits:**
✅ Production-grade stability  
✅ Handles multiple concurrent connections  
✅ Real-time updates via SocketIO + WebSocket  
✅ Auto-restart on crash  
✅ Easy logging & monitoring  
✅ Scalable (add more workers as needed)  

---

## Final Checklist

```bash
☐ Gunicorn installed (pip install gunicorn)
☐ Gunicorn service created & enabled
☐ Nginx installed (sudo apt install nginx)
☐ Nginx reverse proxy configured
☐ Both services running (systemctl status)
☐ Dashboard loads at http://192.168.1.100
☐ WebSocket working (F12 Network → WS)
☐ ESP32 can POST to http://192.168.1.100/sensor_data
☐ Data appearing in charts real-time
☐ Services auto-restart enabled
```

---

## Next Steps

1. ✅ Test dashboard: `http://192.168.1.100`
2. ✅ Upload ESP32 with new `serverURL` (no port)
3. ✅ Watch data flow in real-time
4. ✅ Monitor logs for issues
5. ✅ (Optional) Add HTTPS for internet access

**Your production dashboard is live!** 🚀⚡