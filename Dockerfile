# Stage 1: Build React frontend
# Using node:22-alpine to match local development environment
# (rollup 4.61+ has compatibility issues with node:20)
FROM node:22-alpine AS frontend-build

WORKDIR /build

COPY react_frontend/package.json ./
RUN npm install --legacy-peer-deps

COPY react_frontend/ ./
RUN npm run build
RUN test -f /build/dist/index.html || (echo "ERROR: Vite build failed" && exit 1)

# Stage 2: Python runtime
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 poppler-utils tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .
RUN rm -rf react_frontend/node_modules react_frontend/src react_frontend/public
COPY --from=frontend-build /build/dist ./react_frontend/dist

RUN mkdir -p db_app/data main_app/data main_app/classifier_model \
        main_app/backend/cash_flow/outputs/plots

RUN test -f /app/db_app/hsledger.db \
    && echo "✅ DB present" || echo "⚠️  DB not found"

RUN test -f /app/db_app/models/company.py \
    && test -f /app/db_app/api/company.py \
    && test -f /app/db_app/company_seed.py \
    && echo "✅ Company files present" \
    || (echo "ERROR: company files missing" && exit 1)

RUN touch /app/db_app/hsledger.db.placeholder
RUN chmod +x /app/entrypoint.sh

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/ready')" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
