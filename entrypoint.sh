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

# Start internal DB/auth API on port 8000 (background)
echo "[accfino] Starting internal auth API on :8000..."
python -m uvicorn main_app.api_call:app --host 0.0.0.0 --port 8000 &

# Brief pause to let the internal API bind before the main API starts
sleep 1

# Start main React API on port 8001 (foreground)
# NOTE: Single worker required while SQLite is in use locally.
#       Once DATABASE_URL is set (Postgres/Neon), upgrade to --workers 2
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
