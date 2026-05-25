#!/usr/bin/env bash
set -euo pipefail

# Usage: ./create-server.sh SERVER_ID DISPLAY_NAME SLUG TYPE VERSION GAME_PORT RCON_PORT MEMORY_MB
# Example: ./create-server.sh server-1001 "Test Server" test-server paper 1.21.1 25566 25576 3072

if [ "$#" -lt 8 ]; then
  echo "Usage: $0 SERVER_ID DISPLAY_NAME SLUG TYPE VERSION GAME_PORT RCON_PORT MEMORY_MB"
  exit 1
fi

SERVER_ID="$1"
DISPLAY_NAME="$2"
SLUG="$3"
TYPE="$4"
VERSION="$5"
GAME_PORT="$6"
RCON_PORT="$7"
MEMORY_MB="$8"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
TEMPLATE_JAR="$BASE/templates/paper/server.jar"
SERVERS_JSON="$BASE/manager/servers.json"
FORWARDING_SECRET_FILE="$BASE/velocity/forwarding.secret"

echo "[$(date)] Creating server $SERVER_ID (slug: $SLUG, port: $GAME_PORT)..."

# Validate SERVER_ID and SLUG
if ! echo "$SERVER_ID" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SERVER_ID '$SERVER_ID' contains invalid characters. Use only [a-z0-9_-]."
  exit 1
fi

if ! echo "$SLUG" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SLUG '$SLUG' contains invalid characters. Use only [a-z0-9_-]."
  exit 1
fi

# Check template jar
if [ ! -f "$TEMPLATE_JAR" ]; then
  echo "[$(date)] ERROR: Template jar not found at $TEMPLATE_JAR"
  echo "[$(date)] Download Paper from https://papermc.io/downloads/paper"
  echo "[$(date)] Place the jar at: $TEMPLATE_JAR"
  exit 1
fi

# Check forwarding secret
if [ ! -f "$FORWARDING_SECRET_FILE" ]; then
  echo "[$(date)] ERROR: forwarding.secret not found. Run install-velocity.sh first."
  exit 1
fi

FORWARDING_SECRET=$(cat "$FORWARDING_SECRET_FILE")

# Create server directory structure
mkdir -p "$SERVER_DIR/logs" "$SERVER_DIR/plugins" "$SERVER_DIR/mods" "$SERVER_DIR/config"

# Copy server jar
cp "$TEMPLATE_JAR" "$SERVER_DIR/server.jar"

# eula.txt
echo "eula=true" > "$SERVER_DIR/eula.txt"

# Generate random RCON password
RCON_PASS=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 16)

# server.properties
cat > "$SERVER_DIR/server.properties" <<EOF
server-port=${GAME_PORT}
server-ip=127.0.0.1
enable-rcon=true
rcon.port=${RCON_PORT}
rcon.password=${RCON_PASS}
online-mode=false
level-name=world
motd=${DISPLAY_NAME}
max-players=20
difficulty=normal
gamemode=survival
spawn-protection=16
enable-command-block=false
EOF

# Paper velocity forwarding config
mkdir -p "$SERVER_DIR/config"
cat > "$SERVER_DIR/config/paper-global.yml" <<EOF
_version: 28
proxies:
  bungee-cord:
    online-mode: false
  velocity:
    enabled: true
    online-mode: true
    secret: '${FORWARDING_SECRET}'
EOF

# Update servers.json atomically
mkdir -p "$(dirname "$SERVERS_JSON")"

NEW_ENTRY=$(cat <<EOF
{
  "id": "${SERVER_ID}",
  "displayName": "${DISPLAY_NAME}",
  "slug": "${SLUG}",
  "type": "${TYPE}",
  "version": "${VERSION}",
  "gamePort": ${GAME_PORT},
  "rconPort": ${RCON_PORT},
  "memoryMb": ${MEMORY_MB},
  "path": "${SERVER_DIR}",
  "publicHost": "${SLUG}.omricraft.com",
  "address": "${SLUG}.omricraft.com",
  "backendAddress": "127.0.0.1:${GAME_PORT}",
  "status": "created"
}
EOF
)

TMP_JSON="$SERVERS_JSON.tmp.$$"

if [ -f "$SERVERS_JSON" ]; then
  # Append to existing array
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    const arr = Array.isArray(data) ? data : (data.servers || []);
    arr.push($NEW_ENTRY);
    fs.writeFileSync('$TMP_JSON', JSON.stringify(arr, null, 2));
  "
else
  echo "[$NEW_ENTRY]" > "$TMP_JSON"
fi

mv "$TMP_JSON" "$SERVERS_JSON"

echo "[$(date)] Server $SERVER_ID created at $SERVER_DIR"
echo "[$(date)] Address: ${SLUG}.omricraft.com"
echo "[$(date)] Backend: 127.0.0.1:${GAME_PORT}"
echo "[$(date)] Next step: ./start-server.sh $SERVER_ID $MEMORY_MB"
