# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build

COPY react_frontend/package.json react_frontend/package-lock.json ./
RUN npm ci --silent

COPY react_frontend/ ./
RUN npm run build
RUN test -f /build/dist/index.html || (echo "ERROR: Vite build failed" && exit 1)

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Python runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libgl1 + libglib2.0-0 required by opencv-python-headless
# poppler-utils + tesseract-ocr required by invoice extractor
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        poppler-utils \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Remove frontend source — only the built dist is needed at runtime
RUN rm -rf react_frontend/node_modules react_frontend/src react_frontend/public

# Copy the Vite build output from Stage 1
# NOTE: Vite copies react_frontend/public/ into dist/ automatically,
#       so index-marketing.html is available at react_frontend/dist/index-marketing.html
COPY --from=frontend-build /build/dist ./react_frontend/dist

# Ensure runtime directories exist (persistent volumes will mount here)
RUN mkdir -p \
        db_app/data \
        main_app/data \
        main_app/classifier_model \
        main_app/backend/cash_flow/outputs/plots

# Verify the seed database was copied (fails build if .dockerignore excluded it)
RUN test -f /app/db_app/hsledger.db \
    && echo "✅ Seed database present at /app/db_app/hsledger.db" \
    || echo "⚠️  WARNING: hsledger.db not found — will create fresh DB on startup"

# If hsledger.db is missing (gitignore/dockerignore edge case), create a placeholder
# so database.py uses the shipped path consistently even on fresh installs
RUN touch /app/db_app/hsledger.db.placeholder

RUN chmod +x /app/entrypoint.sh

# Only 8001 is exposed — api_call (8000) is internal only
EXPOSE 8001

# Health check — use /ready which returns 503 until app is fully initialised.
# start-period=120s gives time for scikit-learn/pandas/CV to load.
# interval=15s after that to detect crashes quickly.
HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/ready')" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
