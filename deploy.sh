#!/bin/bash

# Battery Digital Twin - Production Deployment Script

echo "Setting up Battery Digital Twin for production..."

# Create gunicorn configuration
cat > gunicorn.conf.py << 'EOF'
bind = "127.0.0.1:5000"
workers = 1
worker_class = "eventlet"
worker_connections = 1000
timeout = 30
keepalive = 2
max_requests = 1000
max_requests_jitter = 100
preload_app = True
daemon = False
pidfile = "/tmp/gunicorn.pid"
user = "raspberrypi"
group = "raspberrypi"
tmp_upload_dir = None
logfile = "/var/log/gunicorn/battery_twin.log"
loglevel = "info"
access_logfile = "/var/log/gunicorn/battery_twin_access.log"
access_logformat = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'
EOF

# Create systemd service file
sudo tee /etc/systemd/system/battery-twin.service > /dev/null << 'EOF'
[Unit]
Description=Battery Digital Twin Dashboard
After=network.target

[Service]
Type=notify
User=raspberrypi
Group=raspberrypi
RuntimeDirectory=battery-twin
WorkingDirectory=/home/raspberrypi/Downloads/digital_twin
Environment=PATH=/home/raspberrypi/Downloads/digital_twin/venv/bin
ExecStart=/home/raspberrypi/Downloads/digital_twin/venv/bin/gunicorn --config gunicorn.conf.py app:app
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/battery-twin > /dev/null << 'EOF'
upstream battery_twin {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name _;
    
    client_max_body_size 4G;
    keepalive_timeout 5;
    
    # Static files
    location /static/ {
        alias /home/raspberrypi/Downloads/digital_twin/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    
    # Socket.IO
    location /socket.io/ {
        proxy_pass http://battery_twin;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
    
    # Main application
    location / {
        proxy_pass http://battery_twin;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
}
EOF

# Create log directories
sudo mkdir -p /var/log/gunicorn
sudo chown raspberrypi:raspberrypi /var/log/gunicorn

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable battery-twin

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/battery-twin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

echo "Production setup complete!"
echo ""
echo "To start the service:"
echo "  sudo systemctl start battery-twin"
echo "  sudo systemctl restart nginx"
echo ""
echo "To check status:"
echo "  sudo systemctl status battery-twin"
echo "  sudo systemctl status nginx"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u battery-twin -f"
echo "  tail -f /var/log/gunicorn/battery_twin.log"
