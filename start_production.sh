#!/bin/bash

# Production startup script for Battery Digital Twin

# Set environment variables
export FLASK_ENV=production
export DEBUG=False

# Activate virtual environment
source venv/bin/activate

# Start Gunicorn with eventlet worker for Socket.IO support
exec gunicorn --config gunicorn.conf.py app:app
