#!/usr/bin/env bash
set -euo pipefail

BASE="/home/ubuntu/omricraft"
VEL_DIR="$BASE/velocity"
PID_FILE="$VEL_DIR/velocity.pid"
LOG_FILE="$VEL_DIR/logs/console.log"

echo "[$(date)] Starting Velocity..."

if [ ! -f "$VEL_DIR/velocity.jar" ]; then
  echo "[$(date)] ERROR: velocity.jar not found. Run install-velocity.sh first."
  exit 1
fi

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[$(date)] Velocity is already running (PID $PID). Refusing to start again."
    exit 1
  else
    echo "[$(date)] Stale PID file found. Removing."
    rm -f "$PID_FILE"
  fi
fi

cd "$VEL_DIR"
nohup java -Xms512M -Xmx512M \
  -XX:+UseG1GC \
  -XX:G1HeapRegionSize=4M \
  -XX:+UnlockExperimentalVMOptions \
  -XX:+ParallelRefProcEnabled \
  -XX:+AlwaysPreTouch \
  -jar velocity.jar \
  > "$LOG_FILE" 2>&1 &

VELOCITY_PID=$!
echo "$VELOCITY_PID" > "$PID_FILE"

echo "[$(date)] Velocity started (PID $VELOCITY_PID)."
echo "[$(date)] Log: $LOG_FILE"
