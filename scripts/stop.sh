#!/usr/bin/env bash
# Dừng server Uvicorn CS336 đang chạy local
set -euo pipefail

PORT="${1:-8000}"
echo "==> Tìm tiến trình đang lắng nghe trên cổng $PORT..."

PID=$(lsof -ti :"$PORT" 2>/dev/null || true)

if [ -n "$PID" ]; then
    echo "==> Đang dừng tiến trình PID $PID..."
    kill "$PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
        echo "==> Buộc dừng tiến trình PID $PID..."
        kill -9 "$PID" 2>/dev/null || true
    fi
    echo "==> Đã dừng server trên cổng $PORT."
else
    echo "==> Không có tiến trình nào đang chạy trên cổng $PORT."
fi
