#!/usr/bin/env bash
# deploy-offline-macos.sh — Deploy exam-system from offline bundle on macOS
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# macOS-specific: verify Docker Desktop is running
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker Desktop for Mac first."
    open -a "Docker" 2>/dev/null || true
    echo "Waiting for Docker to start (30s)..."
    for i in $(seq 1 30); do
        sleep 1
        docker info >/dev/null 2>&1 && break
        if [[ $i -eq 30 ]]; then
            echo "ERROR: Docker did not start in time. Please start it manually."
            exit 1
        fi
    done
fi

command -v docker-compose >/dev/null 2>&1 || {
    echo "ERROR: docker-compose not found. Install via: brew install docker-compose"
    exit 1
}

echo "==> Loading Docker images..."
for tar in exam-backend.tar exam-frontend.tar; do
    [[ -f "$tar" ]] || { echo "ERROR: Missing $tar"; exit 1; }
    docker load -i "$tar"
done

# Create .env if missing
if [[ ! -f .env && -f .env.example ]]; then
    cp .env.example .env
    echo "==> Created .env from .env.example — edit before production use!"
fi

# Ensure data directories (macOS requires volumes to be accessible)
mkdir -p data/uploads data/logs

echo "==> Starting stack..."
docker-compose up -d

echo ""
echo "==> Exam system is running!"
echo "    Admin panel : http://localhost:80"
echo "    Backend API  : http://localhost:8001"
echo "    Default admin: admin / admin123  (change this!)"
