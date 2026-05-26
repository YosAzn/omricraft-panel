#!/usr/bin/env bash
set -euo pipefail

# Usage: ./restart-server.sh SERVER_ID MEMORY_MB

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 SERVER_ID MEMORY_MB"
  exit 1
fi

SERVER_ID="$1"
MEMORY_MB="$2"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date)] Restarting server $SERVER_ID..."
bash "$SCRIPTS_DIR/stop-server.sh" "$SERVER_ID"
sleep 3
bash "$SCRIPTS_DIR/start-server.sh" "$SERVER_ID" "$MEMORY_MB"
echo "[$(date)] Server $SERVER_ID restarted."
