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

# Guard: velocity must run as ubuntu (systemd User=ubuntu). A manually root-started
# velocity becomes an orphan that ubuntu scripts cannot pkill — it then holds :25565
# and deadlocks systemd (the 7-day-orphan / 37k-restart incident, 2026-07-05).
if [ "$(id -u)" = "0" ]; then
  echo "[$(date)] ERROR: refusing to run velocity as root. Start it with: sudo systemctl start omricraft-velocity.service"
  exit 1
fi

if [ ! -f "$VEL_DIR/velocity.jar" ]; then
  echo "[$(date)] ERROR: velocity.jar not found. Run install-velocity.sh first."
  exit 1
fi

# --- Inoculation: port/process pre-check (lock pattern) ---
# Root cause of the recurring "port 25565 still occupied" deadlock: the old logic
# killed by NAME (pkill -f velocity.jar) as ubuntu, which cannot signal a stray
# root-owned velocity and silently no-ops (|| true). A 7-day root orphan then held
# :25565 while systemd restart-looped 37k times (2026-07-05 incident).
# Fix: find the actual PID(s) holding the port (sudo, so we see other users'
# processes too) and escalate TERM->KILL against them. Verify real release.
PROXY_PORT=25565

# PIDs currently LISTENing on the proxy port, regardless of process name or owner.
port_pids() {
  { sudo -n ss -ltnp 2>/dev/null || ss -ltnp 2>/dev/null; } \
    | grep ":$PROXY_PORT " \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
}

echo "[$(date)] Pre-check: freeing port $PROXY_PORT..."
for sig in TERM KILL; do
  PIDS=$(port_pids)
  [ -z "$PIDS" ] && break
  echo "[$(date)] Port $PROXY_PORT held by PID(s): $PIDS — sending SIG$sig..."
  for p in $PIDS; do sudo -n kill -"$sig" "$p" 2>/dev/null || kill -"$sig" "$p" 2>/dev/null || true; done
  for _ in 1 2 3 4 5 6; do if [ -z "$(port_pids)" ]; then break; fi; sleep 1; done
done
# Belt-and-suspenders: clear any stale velocity.jar procs not bound to the port.
pkill -f velocity.jar 2>/dev/null || true

if [ -n "$(port_pids)" ]; then
  echo "[$(date)] ERROR: Port $PROXY_PORT still occupied after TERM+KILL. Aborting to avoid orphan/bind conflict."
  { sudo -n ss -ltnp 2>/dev/null || ss -ltnp 2>/dev/null; } | grep ":$PROXY_PORT " || true
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
