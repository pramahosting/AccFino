#!/bin/sh
# Do NOT use set -e — background process failures would kill the whole script

cd /app
export PYTHONPATH=/app

echo "[accfino] Starting AccFino..."
echo "[accfino] PYTHONPATH=$PYTHONPATH"

# ── Diagnose DATABASE_URL ──────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
    echo "[accfino] DATABASE_URL is set (Postgres mode)"
    echo "[accfino] DATABASE_URL value: ${DATABASE_URL:0:30}..."
else
    echo "[accfino] WARNING: DATABASE_URL is not set — falling back to SQLite"
    echo "[accfino] Set DATABASE_URL in Northflank environment variables"
fi

# ── Ensure persistent volume subdirectories exist ─────────────────────────
mkdir -p /app/db_app/data
mkdir -p /app/main_app/data
mkdir -p /app/main_app/classifier_model
mkdir -p /app/main_app/backend/cash_flow/outputs/plots

# ── Init DB schema (idempotent — safe to run every start) ─────────────────
echo "[accfino] Initialising database schema..."
python -m db_app.init_db
if [ $? -ne 0 ]; then
    echo "[accfino] ERROR: DB init failed — check DATABASE_URL and Postgres connectivity"
    exit 1
fi

# ── Start internal auth API on 127.0.0.1:8000 (background) ───────────────
# Bound to localhost only — never exposed externally
echo "[accfino] Starting internal auth API on 127.0.0.1:8000..."
python -m uvicorn main_app.api_call:app \
    --host 127.0.0.1 \
    --port 8000 \
    --log-level warning &

AUTH_PID=$!
echo "[accfino] Auth API PID: $AUTH_PID"

# ── Wait for auth API to bind (covers Neon cold-start latency) ────────────
sleep 3

# Verify auth API is still running
if ! kill -0 $AUTH_PID 2>/dev/null; then
    echo "[accfino] ERROR: Auth API failed to start — check api_call.py imports"
    exit 1
fi
echo "[accfino] Auth API ready"

# ── Start main API on :8001 (foreground) ──────────────────────────────────
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
