#!/bin/bash
# Called on boot — starts all servers that were running before reboot
SERVERS_JSON="/home/ubuntu/omricraft/manager/servers.json"
START_SCRIPT="/home/ubuntu/omricraft/manager/scripts/start-server.sh"

if [ ! -f "$SERVERS_JSON" ]; then
  echo "No servers.json found, skipping autostart"
  exit 0
fi

node -e "
const servers = JSON.parse(require('fs').readFileSync('$SERVERS_JSON','utf8'));
const arr = Array.isArray(servers) ? servers : (servers.servers || []);
arr.forEach(s => console.log(s.id + ' ' + (s.memoryMb || 2048)));
" | while read SERVER_ID MEMORY_MB; do
  echo "[$(date)] Auto-starting server $SERVER_ID (${MEMORY_MB}MB)..."
  bash "$START_SCRIPT" "$SERVER_ID" "$MEMORY_MB" || echo "[$(date)] Failed to start $SERVER_ID"
  sleep 5
done
