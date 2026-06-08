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
    echo "[accfino] ⚠️  SQLite is ephemeral on Northflank — data WILL BE LOST on container restart"
    echo "[accfino] ⚠️  Set DATABASE_URL to a Postgres connection string for persistent storage"
    echo "[accfino] Set DATABASE_URL in Northflank environment variables"
fi

# ── Ensure persistent volume subdirectories exist ─────────────────────────
mkdir -p /app/db_app/data
mkdir -p /app/main_app/data
mkdir -p /app/main_app/classifier_model
mkdir -p /app/main_app/backend/cash_flow/outputs/plots

# ── Ensure DB file exists at primary path BEFORE any Python imports ────────
# CRITICAL: database.py evaluates the path at IMPORT TIME (module level).
# init_db.py imports database.py — so the DB file must exist at the right
# path BEFORE init_db runs, otherwise it falls back to db_app/data/.
#
# Priority order:
#   1. /app/db_app/hsledger.db  — shipped in Docker image (from git/zip)
#   2. /app/db_app/data/hsledger.db — persistent volume (survives restarts)
#   3. Create fresh /app/db_app/hsledger.db — first-time Northflank deploy

if [ -f /app/db_app/hsledger.db ] && [ -s /app/db_app/hsledger.db ]; then
    echo "[accfino] ✅ Using shipped DB at /app/db_app/hsledger.db"
elif [ -f /app/db_app/data/hsledger.db ] && [ -s /app/db_app/data/hsledger.db ]; then
    # Persistent volume has existing data — copy it to primary location
    echo "[accfino] Copying persistent DB from data/ to primary location..."
    cp /app/db_app/data/hsledger.db /app/db_app/hsledger.db
    echo "[accfino] ✅ Using persistent DB ($(du -sh /app/db_app/hsledger.db | cut -f1))"
else
    # First run — create empty file at primary location so database.py picks it up
    echo "[accfino] Creating fresh database at /app/db_app/hsledger.db"
    touch /app/db_app/hsledger.db
fi

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
# ── Backup DB to persistent volume after init ─────────────────────────────
# If a persistent volume is mounted at db_app/data/, keep it in sync
if [ -f /app/db_app/hsledger.db ] && [ -s /app/db_app/hsledger.db ]; then
    cp /app/db_app/hsledger.db /app/db_app/data/hsledger.db 2>/dev/null || true
fi

echo "[accfino] Starting main API on :8001..."
echo "[accfino] Note: scikit-learn/pandas/CV models take 30-90s to load on first start"
echo "[accfino] App will be READY once /ready returns 200 — configure Northflank health check to use /ready"
if [ -n "$DATABASE_URL" ]; then
    echo "[accfino] Postgres detected — running with 2 workers"
    exec python -m uvicorn main_app.react_api:app \
        --host 0.0.0.0 \
        --port 8001 \
        --workers 2 \
        --timeout-keep-alive 75 \
        --timeout-graceful-shutdown 30
else
    echo "[accfino] SQLite fallback — running with 1 worker"
    exec python -m uvicorn main_app.react_api:app \
        --host 0.0.0.0 \
        --port 8001 \
        --workers 1 \
        --timeout-keep-alive 75 \
        --timeout-graceful-shutdown 30
fi
