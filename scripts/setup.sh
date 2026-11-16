#!/usr/bin/env bash
# Thiết lập môi trường Python .venv và build frontend cho macOS / Linux
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> 1. Thiết lập môi trường Python..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements-lock.txt
.venv/bin/pip install --no-deps -e .

echo "==> 2. Cài đặt và build frontend..."
(
    cd frontend
    npm ci
    npm run build
)

chmod +x scripts/*.sh 2>/dev/null || true

echo "==> Hoàn tất cài đặt! Bạn có thể khởi động hệ thống bằng lệnh:"
echo "    ./scripts/start.sh"
echo "    Sau đó truy cập: http://127.0.0.1:8000"
