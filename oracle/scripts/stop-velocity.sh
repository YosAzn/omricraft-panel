#!/usr/bin/env bash
set -euo pipefail

BASE="/home/ubuntu/omricraft"
VEL_DIR="$BASE/velocity"
PID_FILE="$VEL_DIR/velocity.pid"

echo "[$(date)] Stopping Velocity..."

if [ ! -f "$PID_FILE" ]; then
  echo "[$(date)] No velocity.pid found. Velocity may not be running."
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
  echo "[$(date)] Process $PID not found. Removing stale PID file."
  rm -f "$PID_FILE"
  exit 0
fi

kill "$PID"

# Wait up to 15 seconds for graceful shutdown
for i in $(seq 1 15); do
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Force kill if still running
if kill -0 "$PID" 2>/dev/null; then
  echo "[$(date)] Velocity did not stop gracefully, force killing..."
  kill -9 "$PID" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "[$(date)] Velocity stopped."
