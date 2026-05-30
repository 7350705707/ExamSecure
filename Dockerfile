# ── Python backend with embedded frontend ─────────────────────────────────────
# Before building this image, run the following in the frontend-admin/ folder:
#   cd frontend-admin
#   VITE_BASE=/admin/ npm run build     (Linux/Mac)
#   $env:VITE_BASE='/admin/'; npm run build   (Windows PowerShell)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps for PyMuPDF / thefuzz
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev gcc build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY exam-server-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY exam-server-backend/ .

# Create runtime dirs and static admin dir
RUN mkdir -p logs uploads static/admin

# Copy pre-built frontend — served by FastAPI at /admin
COPY frontend-admin/dist/ static/admin/

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health')"

CMD ["python", "run.py"]
