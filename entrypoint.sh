#!/bin/sh
set -e

cd /app
export PYTHONPATH=/app

echo "[accfino] Starting AccFino..."
echo "[accfino] PYTHONPATH=$PYTHONPATH"

# Ensure persistent volume subdirectories exist
mkdir -p /app/db_app/data
mkdir -p /app/main_app/data
mkdir -p /app/main_app/classifier_model
mkdir -p /app/main_app/backend/cash_flow/outputs/plots

# Init DB schema (idempotent — safe to run every start)
echo "[accfino] Initialising database schema..."
python -m db_app.init_db

# Start internal auth API on port 8000 — bound to localhost only,
# not exposed to Northflank traffic (8001 is the only public port)
echo "[accfino] Starting internal auth API on 127.0.0.1:8000..."
python -m uvicorn main_app.api_call:app --host 127.0.0.1 --port 8000 &

# Wait for auth API to be ready before starting main API
# sleep 3 covers Neon Postgres cold-start (can take 2-3s)
sleep 3

# Start main React API on port 8001 (foreground)
echo "[accfino] Starting main API on :8001..."
if [ -n "$DATABASE_URL" ]; then
    echo "[accfino] Postgres detected — running with 2 workers"
    exec python -m uvicorn main_app.react_api:app \
        --host 0.0.0.0 \
        --port 8001 \
        --workers 2 \
        --timeout-keep-alive 75
else
    echo "[accfino] SQLite fallback — running with 1 worker"
    exec python -m uvicorn main_app.react_api:app \
        --host 0.0.0.0 \
        --port 8001 \
        --workers 1 \
        --timeout-keep-alive 75
fi
