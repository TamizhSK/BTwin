#!/bin/bash

# Battery Digital Twin Management Script

case "$1" in
    start)
        echo "Starting Battery Digital Twin..."
        sudo systemctl start battery-twin
        sudo systemctl start nginx
        echo "Services started!"
        ;;
    stop)
        echo "Stopping Battery Digital Twin..."
        sudo systemctl stop battery-twin
        sudo systemctl stop nginx
        echo "Services stopped!"
        ;;
    restart)
        echo "Restarting Battery Digital Twin..."
        sudo systemctl restart battery-twin
        sudo systemctl restart nginx
        echo "Services restarted!"
        ;;
    status)
        echo "=== Battery Twin Service ==="
        sudo systemctl status battery-twin --no-pager
        echo ""
        echo "=== Nginx Service ==="
        sudo systemctl status nginx --no-pager
        ;;
    logs)
        echo "=== Battery Twin Logs ==="
        sudo journalctl -u battery-twin -f
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Battery Digital Twin is now running at:"
        echo "  http://localhost (via Nginx)"
        echo "  http://192.168.0.148 (via Nginx)"
        echo ""
        echo "Direct Gunicorn access:"
        echo "  http://localhost:5000"
        exit 1
        ;;
esac
