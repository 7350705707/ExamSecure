#!/usr/bin/env bash
# deploy-offline.sh — Deploy exam-system from offline bundle on Linux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is not installed. Please install Docker."; exit 1; }
}

require_cmd docker
require_cmd docker-compose

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

# Ensure data directories
mkdir -p data/uploads data/logs

echo "==> Starting stack..."
docker-compose up -d

echo ""
echo "==> Exam system is running!"
echo "    Admin panel : http://localhost:80"
echo "    Backend API  : http://localhost:8001"
echo "    Default admin: admin / admin123  (change this!)"
