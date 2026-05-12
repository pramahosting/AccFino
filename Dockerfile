# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build

COPY react_frontend/package.json react_frontend/package-lock.json ./
RUN npm ci --silent

COPY react_frontend/ ./
RUN npm run build
# Output: /build/dist/


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Python runtime
# react_api (port 8001) serves the API + the built React SPA
# api_call  (port 8000) is the internal DB/auth layer
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System libs required by opencv, pdf2image, pytesseract
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

# Drop any Windows node_modules that snuck in via zip
RUN rm -rf react_frontend/node_modules

# Copy the Vite production build from Stage 1
COPY --from=frontend-build /build/dist ./react_frontend/dist

# Ensure writable runtime directories exist
RUN mkdir -p \
        db_app \
        main_app/data \
        main_app/classifier_model \
        main_app/backend/cash_flow/outputs/plots

# Initialise DB at build time so first cold-start is instant
RUN python db_app/init_db.py

EXPOSE 8001

CMD ["sh", "-c", \
     "python -m uvicorn main_app.api_call:app --host 0.0.0.0 --port 8000 & \
      python -m uvicorn main_app.react_api:app --host 0.0.0.0 --port 8001"]
