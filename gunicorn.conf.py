# Gunicorn Configuration for Battery Digital Twin
import os

# Server socket
bind = "0.0.0.0:" + str(os.environ.get("PORT", 5000))
backlog = 2048

# Worker processes
workers = 1
worker_class = "sync"
worker_connections = 1000
timeout = 30
keepalive = 2

# Restart workers after this many requests, to help prevent memory leaks
max_requests = 1000
max_requests_jitter = 100

# Load application code before the worker processes are forked
preload_app = True

# Process naming
proc_name = 'battery_twin'

# Logging
loglevel = 'info'
accesslog = '-'
errorlog = '-'
