#!/usr/bin/env bash
set -euo pipefail

# Usage: ./start-server.sh SERVER_ID MEMORY_MB

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 SERVER_ID MEMORY_MB"
  exit 1
fi

SERVER_ID="$1"
MEMORY_MB="$2"

BASE="/home/ubuntu/omricraft"
SERVER_DIR="$BASE/servers/$SERVER_ID"
PID_FILE="$SERVER_DIR/server.pid"
LOG_FILE="$SERVER_DIR/logs/console.log"
SERVERS_JSON="$BASE/manager/servers.json"

echo "[$(date)] Starting server $SERVER_ID (${MEMORY_MB}MB)..."

if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] ERROR: Server directory not found: $SERVER_DIR"
  exit 1
fi

if [ ! -f "$SERVER_DIR/server.jar" ]; then
  echo "[$(date)] ERROR: server.jar not found in $SERVER_DIR"
  exit 1
fi

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[$(date)] Server $SERVER_ID is already running (PID $PID). Nothing to do."
    exit 0
  else
    echo "[$(date)] Stale PID file found. Removing."
    rm -f "$PID_FILE"
  fi
fi

cd "$SERVER_DIR"

# For modern Forge (1.17+) and NeoForge, run.sh is the entry point rather than a jar
if [ -f "$SERVER_DIR/run.sh" ] && ([ ! -s "$SERVER_DIR/server.jar" ] || grep -q "neoforge" "$SERVER_DIR/run.sh" 2>/dev/null); then
  chmod +x "$SERVER_DIR/run.sh"
  nohup bash "$SERVER_DIR/run.sh" nogui \
    >> "$LOG_FILE" 2>&1 &
else
  # Paper, Purpur, Fabric (fabric-server-launch.jar copied to server.jar during create)
  nohup java -Xms${MEMORY_MB}M -Xmx${MEMORY_MB}M \
    -XX:+UseG1GC \
    -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=200 \
    -jar server.jar --nogui \
    >> "$LOG_FILE" 2>&1 &
fi

SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

# Background: move datapacks-pending → world/datapacks when world folder appears
DATAPACK_PENDING="$SERVER_DIR/datapacks-pending"
if [ -d "$DATAPACK_PENDING" ] && [ "$(ls -A "$DATAPACK_PENDING" 2>/dev/null)" ]; then
  (
    for i in $(seq 1 24); do
      sleep 5
      if [ -d "$SERVER_DIR/world" ]; then
        mkdir -p "$SERVER_DIR/world/datapacks"
        mv "$DATAPACK_PENDING"/*.zip "$SERVER_DIR/world/datapacks/" 2>/dev/null || true
        mv "$DATAPACK_PENDING"/*.jar "$SERVER_DIR/world/datapacks/" 2>/dev/null || true
        echo "[$(date)] Datapacks installed: $(ls "$SERVER_DIR/world/datapacks/" 2>/dev/null | wc -l) files" >> "$LOG_FILE"
        rmdir "$DATAPACK_PENDING" 2>/dev/null || true
        exit 0
      fi
    done
    echo "[$(date)] WARNING: world folder never appeared, datapacks not installed" >> "$LOG_FILE"
  ) &
fi

# Update servers.json status
if [ -f "$SERVERS_JSON" ] && command -v node &>/dev/null; then
  TMP_JSON="$SERVERS_JSON.tmp.$$"
  node -e "
    const fs = require('fs');
    const arr = JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    const entry = arr.find(s => s.id === '$SERVER_ID');
    if (entry) entry.status = 'starting';
    fs.writeFileSync('$TMP_JSON', JSON.stringify(arr, null, 2));
  " && mv "$TMP_JSON" "$SERVERS_JSON"
fi

echo "[$(date)] Server $SERVER_ID started (PID $SERVER_PID)."
echo "[$(date)] Log: $LOG_FILE"
