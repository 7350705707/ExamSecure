# exam-server-backend — multi-stage offline build
FROM python:3.11-slim AS base

WORKDIR /app

# System deps for PyMuPDF / thefuzz
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev gcc build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create runtime dirs
RUN mkdir -p logs uploads static/admin

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health')"

CMD ["python", "run.py"]
