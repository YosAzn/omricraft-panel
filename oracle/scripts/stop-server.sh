#!/usr/bin/env bash
set -euo pipefail

# Usage: ./stop-server.sh SERVER_ID

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID"
  exit 1
fi

SERVER_ID="$1"

BASE="/home/ubuntu/omricraft"
SERVER_DIR="$BASE/servers/$SERVER_ID"
PID_FILE="$SERVER_DIR/server.pid"
SERVERS_JSON="$BASE/manager/servers.json"

echo "[$(date)] Stopping server $SERVER_ID..."

if [ ! -f "$PID_FILE" ]; then
  echo "[$(date)] No server.pid found for $SERVER_ID. May not be running."
else
  PID=$(cat "$PID_FILE")

  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"

    for i in $(seq 1 20); do
      if ! kill -0 "$PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done

    if kill -0 "$PID" 2>/dev/null; then
      echo "[$(date)] Force killing PID $PID..."
      kill -9 "$PID" 2>/dev/null || true
    fi
  else
    echo "[$(date)] Process $PID not found. Removing stale PID file."
  fi

  rm -f "$PID_FILE"
fi

# Update servers.json status
if [ -f "$SERVERS_JSON" ] && command -v node &>/dev/null; then
  TMP_JSON="$SERVERS_JSON.tmp.$$"
  node -e "
    const fs = require('fs');
    const arr = JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    const entry = arr.find(s => s.id === '$SERVER_ID');
    if (entry) entry.status = 'stopped';
    fs.writeFileSync('$TMP_JSON', JSON.stringify(arr, null, 2));
  " && mv "$TMP_JSON" "$SERVERS_JSON"
fi

echo "[$(date)] Server $SERVER_ID stopped."
