#!/bin/sh
set -e

cd /app
export PYTHONPATH=/app

# Ensure persistent volume subdirectories exist
mkdir -p /app/db_app/data
mkdir -p /app/main_app/data

# Init DB and ensure demo licences
python -m db_app.init_db

# Start internal DB/auth API on port 8000 (background)
# --workers 2 — handles concurrent auth requests
python -m uvicorn main_app.api_call:app \
    --host 0.0.0.0 --port 8000 \
    --workers 2 &

# Start main React API on port 8001 (foreground)
# --workers 4 — handles concurrent user sessions
# Each worker is isolated — no shared memory between customers
exec python -m uvicorn main_app.react_api:app \
    --host 0.0.0.0 --port 8001 \
    --workers 4
