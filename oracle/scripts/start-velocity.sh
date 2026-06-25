#!/usr/bin/env bash
set -euo pipefail

BASE="/home/ubuntu/omricraft"
VEL_DIR="$BASE/velocity"
PID_FILE="$VEL_DIR/velocity.pid"
LOG_FILE="$VEL_DIR/logs/console.log"

# Java 25 (Temurin) — required for MC 26.x, backward-compatible with older. Fallback to system java.
JAVA_BIN="/home/ubuntu/jdk-25/bin/java"
[ -x "$JAVA_BIN" ] || JAVA_BIN="java"

echo "[$(date)] Starting Velocity..."

if [ ! -f "$VEL_DIR/velocity.jar" ]; then
  echo "[$(date)] ERROR: velocity.jar not found. Run install-velocity.sh first."
  exit 1
fi

# --- Inoculation: port/process pre-check (lock pattern) ---
# Root cause of the "Outdated client" bug: previous Velocity processes were never
# killed, accumulating orphans that held :25565 with half-initialized state.
# Before launching, kill any stale velocity.jar process and ensure :25565 is free.
PROXY_PORT=25565

echo "[$(date)] Pre-check: killing any stale velocity.jar process..."
pkill -f velocity.jar 2>/dev/null || true
sleep 3

# Verify the proxy port is free; escalate to SIGKILL if still held.
if ss -ltnp 2>/dev/null | grep -q ":$PROXY_PORT "; then
  echo "[$(date)] Port $PROXY_PORT still in use after pkill. Escalating to SIGKILL..."
  pkill -9 -f velocity.jar 2>/dev/null || true
  sleep 3
fi

if ss -ltnp 2>/dev/null | grep -q ":$PROXY_PORT "; then
  echo "[$(date)] ERROR: Port $PROXY_PORT still occupied after SIGKILL. Aborting to avoid orphan/bind conflict."
  ss -ltnp 2>/dev/null | grep ":$PROXY_PORT " || true
  exit 1
fi
echo "[$(date)] Port $PROXY_PORT is free. Proceeding."
# --- end inoculation ---

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

# Export manager-api credentials so the ServerWaker plugin (running inside this JVM)
# can authenticate its wake requests. The key lives ONLY in .env (chmod 600) — it is
# NEVER compiled into the plugin jar. Rotating the key is then just editing .env and
# restarting velocity; no plugin rebuild.
ENV_FILE="$BASE/manager/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
export MANAGER_API_URL="${MANAGER_API_URL:-http://127.0.0.1:3001}"
if [ -z "${MANAGER_API_KEY:-}" ]; then
  echo "[$(date)] WARNING: MANAGER_API_KEY not set ($ENV_FILE) — ServerWaker wake requests will be rejected (401)."
fi

cd "$VEL_DIR"
nohup "$JAVA_BIN" -Xms512M -Xmx512M \
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
