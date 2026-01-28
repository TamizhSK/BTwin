#!/bin/bash
# Quick deploy to Railway

echo "Deploying Battery Digital Twin..."

# Push to GitHub
git add .
git commit -m "Update: $(date)"
git push origin main

echo "Code pushed to GitHub!"
echo "Deploy at: https://railway.app"
echo "Your ESP32 endpoint will be: https://your-app-name.railway.app/data"
