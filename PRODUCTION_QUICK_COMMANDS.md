# ⚡ Production Setup - Quick Commands Reference

## All Commands in One Place

### Phase 1: Gunicorn Setup (5 min)

```bash
# Activate venv
cd ~/battery_digital_twin
source venv/bin/activate

# Install Gunicorn
pip install gunicorn==22.0.0

# Test it works
gunicorn -w 4 -b 0.0.0.0:5000 app:app

# In browser: http://192.168.1.100:5000
# (Press Ctrl+C to stop)
```

### Phase 2: Create Gunicorn Service (2 min)

```bash
# Create service file
sudo nano /etc/systemd/system/gunicorn-battery-twin.service
```

**Paste this content exactly:**
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

Save: `Ctrl+X` → `Y` → `Enter`

**Then:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable gunicorn-battery-twin.service
sudo systemctl start gunicorn-battery-twin.service
sudo systemctl status gunicorn-battery-twin.service
```

### Phase 3: Install & Configure Nginx (5 min)

```bash
# Install Nginx
sudo apt update
sudo apt install nginx -y

# Enable and start
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Phase 4: Configure Nginx Reverse Proxy (3 min)

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/battery-twin
```

**Paste this content exactly:**
```nginx
upstream gunicorn_app {
    server 127.0.0.1:8000;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    
    access_log /var/log/nginx/battery-twin-access.log;
    error_log /var/log/nginx/battery-twin-error.log;
    
    server_tokens off;
    client_max_body_size 10M;
    
    location / {
        proxy_pass http://gunicorn_app;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (IMPORTANT!)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Connection "Upgrade";
        
        # Timeouts for real-time
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /static/ {
        alias /home/pi/battery_digital_twin/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Save: `Ctrl+X` → `Y` → `Enter`

**Then:**
```bash
# Enable this config
sudo ln -s /etc/nginx/sites-available/battery-twin /etc/nginx/sites-enabled/battery-twin

# Remove default (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Phase 5: Verify Everything Works (2 min)

```bash
# Check both services running
sudo systemctl status gunicorn-battery-twin.service
sudo systemctl status nginx

# Check port bindings
sudo netstat -tuln | grep -E ':(80|8000)'

# Test locally on Pi
curl http://localhost

# Test from another computer
# Open browser: http://192.168.1.100
```

### Phase 6: Update ESP32 Code

In your Arduino sketch, change:
```cpp
const char* serverURL = "http://192.168.1.100/sensor_data";
```

**NO PORT NEEDED!** Nginx handles port 80.

---

## Monitoring Commands

```bash
# Real-time Gunicorn logs
sudo journalctl -u gunicorn-battery-twin.service -f

# Real-time Nginx access logs
tail -f /var/log/nginx/battery-twin-access.log

# Real-time Nginx error logs
tail -f /var/log/nginx/battery-twin-error.log

# System resources
free -h              # RAM
df -h                # Disk
vcgencmd measure_temp # CPU temp
```

---

## Control Services

```bash
# Start/Stop/Restart Gunicorn
sudo systemctl start gunicorn-battery-twin.service
sudo systemctl stop gunicorn-battery-twin.service
sudo systemctl restart gunicorn-battery-twin.service

# Start/Stop/Restart Nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx

# Restart all
sudo systemctl restart gunicorn-battery-twin.service nginx

# View status
sudo systemctl status gunicorn-battery-twin.service
sudo systemctl status nginx
```

---

## Troubleshooting Quick Fixes

```bash
# 502 Bad Gateway?
sudo systemctl restart gunicorn-battery-twin.service

# WebSocket not connecting?
sudo systemctl restart nginx

# Port already in use?
sudo lsof -i :5000
sudo lsof -i :80

# Check both services enabled
sudo systemctl is-enabled gunicorn-battery-twin.service
sudo systemctl is-enabled nginx

# Clear Nginx cache
sudo rm -rf /var/cache/nginx/*
sudo systemctl restart nginx
```

---

## Performance Tuning

```bash
# Increase Gunicorn workers (edit service)
sudo systemctl edit gunicorn-battery-twin.service
# Change: --workers 4  to  --workers 8
# Press Ctrl+X, then y, then Enter
sudo systemctl daemon-reload
sudo systemctl restart gunicorn-battery-twin.service

# Enable Gzip compression (edit Nginx)
sudo nano /etc/nginx/sites-available/battery-twin
# Add before upstream:
# gzip on;
# gzip_types text/plain text/css text/xml text/javascript application/json;
# gzip_min_length 1000;
sudo nginx -t
sudo systemctl restart nginx
```

---

## Complete Port Map

```
User Browser (Port 80)
    ↓
Nginx Reverse Proxy (Listen: 80, Forward to: 8000)
    ↓
Gunicorn Workers (Listen: 127.0.0.1:8000)
    ↓
Flask App (Runs in Gunicorn)
    ↓
SQLite Database (data.db)
```

---

## Verify Full Stack Working

```bash
# 1. Both services running
sudo systemctl status gunicorn-battery-twin.service
sudo systemctl status nginx

# 2. Ports listening correctly
sudo netstat -tuln | grep LISTEN

# 3. Dashboard loads
curl http://localhost | head -20

# 4. WebSocket works (from browser)
# Open http://192.168.1.100
# F12 Dev Tools → Network tab
# Filter: WS (WebSocket)
# Should see socket.io connection

# 5. ESP32 can POST
# Trigger ESP32 to send data
# Watch charts update LIVE on dashboard
```

---

## Auto-Start After Reboot

Both services auto-start because of:
```ini
[Install]
WantedBy=multi-user.target
```

Test reboot:
```bash
sudo reboot
# Wait 30 seconds
# Visit http://192.168.1.100
# Dashboard should load immediately
```

---

## Emergency Commands

```bash
# Something broken? Get basic logs
sudo journalctl -n 50 -u gunicorn-battery-twin.service
sudo journalctl -n 50 -u nginx

# Reset everything to development
sudo systemctl stop gunicorn-battery-twin.service
sudo systemctl stop nginx
cd ~/battery_digital_twin
source venv/bin/activate
python3 app.py
# Now runs on http://192.168.1.100:5000

# Disable services (keep but don't auto-start)
sudo systemctl disable gunicorn-battery-twin.service
sudo systemctl disable nginx

# Re-enable
sudo systemctl enable gunicorn-battery-twin.service
sudo systemctl enable nginx
```

---

## Time Estimates

- Gunicorn setup: **5 minutes**
- Nginx install & config: **10 minutes**
- Testing & verification: **5 minutes**
- **Total: 20 minutes to production!**

---

## Your Production Checklist

```
☐ Gunicorn installed & tested locally
☐ Gunicorn service created & running
☐ Nginx installed
☐ Nginx config created & verified
☐ Dashboard loads at http://192.168.1.100
☐ ESP32 serverURL updated (no port)
☐ WebSocket connecting (F12 Network)
☐ Data appearing in charts
☐ Services auto-start enabled
☐ Reboot test successful
```

---

## You're Live! 🚀

Your Battery Digital Twin is now running on production-grade infrastructure:
- ✅ Stable Gunicorn server (multi-worker)
- ✅ Nginx reverse proxy (optimized)
- ✅ Real-time WebSocket support
- ✅ Auto-recovery on crashes
- ✅ Ready for 24/7 operation

**Time to celebrate!** 🎉⚡