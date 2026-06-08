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
nohup java -Xms${MEMORY_MB}M -Xmx${MEMORY_MB}M \
  -XX:+UseG1GC \
  -XX:+ParallelRefProcEnabled \
  -XX:MaxGCPauseMillis=200 \
  -jar server.jar --nogui \
  >> "$LOG_FILE" 2>&1 &

SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

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
