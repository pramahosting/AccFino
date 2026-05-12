#!/bin/sh
set -e

cd /app

echo "=== /app contents at startup ==="
ls -la /app
echo "=== /app/db_app ==="
ls -la /app/db_app || echo "WARNING: db_app directory missing"

# Init DB on first run (idempotent — skips if users already exist)
python /app/db_app/init_db.py

# Start internal DB/auth API on port 8000 (background)
python -m uvicorn main_app.api_call:app --host 0.0.0.0 --port 8000 &

# Start main React API on port 8001 (foreground — receives shutdown signals)
exec python -m uvicorn main_app.react_api:app --host 0.0.0.0 --port 8001
