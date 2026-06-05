# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build

COPY react_frontend/package.json react_frontend/package-lock.json ./
RUN npm ci --silent

COPY react_frontend/ ./

# In production (Northflank/Docker) there is no Vite dev proxy.
# The built JS calls /api/* which FastAPI strips via StripApiPrefix middleware.
# No VITE_API_BASE_URL needed — relative /api path works for same-origin deployments.
RUN npm run build

# Verify the build succeeded and index.html exists
RUN test -f /build/dist/index.html || (echo "ERROR: Vite build failed — dist/index.html missing" && exit 1)

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

RUN chmod +x /app/entrypoint.sh

# Only 8001 is exposed — api_call (8000) is internal only
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
