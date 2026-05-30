#!/usr/bin/env bash
set -euo pipefail

# Usage: ./create-server.sh SERVER_ID DISPLAY_NAME SLUG TYPE VERSION GAME_PORT RCON_PORT MEMORY_MB [SEED] [OPS_JSON] [ADDONS_JSON] [MAX_PLAYERS] [GAMEMODE] [WHITELIST]

if [ "$#" -lt 8 ]; then
  echo "Usage: $0 SERVER_ID DISPLAY_NAME SLUG TYPE VERSION GAME_PORT RCON_PORT MEMORY_MB [SEED] [OPS_JSON] [ADDONS_JSON] [MAX_PLAYERS] [GAMEMODE] [WHITELIST]"
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
SEED="${9:-}"
OPS="${10:-[]}"
ADDONS="${11:-[]}"
MAX_PLAYERS="${12:-20}"
GAMEMODE="${13:-survival}"
WHITELIST="${14:-false}"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
TEMPLATE_JAR="$BASE/templates/paper/server.jar"
SERVERS_JSON="$BASE/manager/servers.json"
FORWARDING_SECRET_FILE="$BASE/velocity/forwarding.secret"

echo "[$(date)] Creating server $SERVER_ID (slug: $SLUG, port: $GAME_PORT, version: $VERSION)..."

if ! echo "$SERVER_ID" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SERVER_ID '$SERVER_ID' contains invalid characters."
  exit 1
fi

if ! echo "$SLUG" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SLUG '$SLUG' contains invalid characters."
  exit 1
fi

if [ ! -f "$FORWARDING_SECRET_FILE" ]; then
  echo "[$(date)] ERROR: forwarding.secret not found."
  exit 1
fi

FORWARDING_SECRET=$(cat "$FORWARDING_SECRET_FILE")

mkdir -p "$SERVER_DIR/logs" "$SERVER_DIR/plugins" "$SERVER_DIR/mods" "$SERVER_DIR/config"

# Version-aware jar selection with auto-download
VERSION_JAR="$BASE/templates/paper/paper-${VERSION}.jar"
if [ ! -f "$VERSION_JAR" ]; then
  echo "[$(date)] Downloading Paper $VERSION..."
  BUILD=$(curl -sf "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds" | \
    node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{try{const o=JSON.parse(d); console.log(o.builds[o.builds.length-1].build);}catch(e){process.exit(1);}})" 2>/dev/null || echo "")
  if [ -n "$BUILD" ]; then
    wget -q "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/${BUILD}/downloads/paper-${VERSION}-${BUILD}.jar" \
      -O "$VERSION_JAR" && echo "[$(date)] Downloaded Paper $VERSION build $BUILD"
  else
    echo "[$(date)] WARNING: Could not download Paper $VERSION, using template jar"
    VERSION_JAR="$TEMPLATE_JAR"
  fi
fi

if [ ! -f "$VERSION_JAR" ]; then
  if [ -f "$TEMPLATE_JAR" ]; then
    echo "[$(date)] Version jar not found, falling back to template jar"
    VERSION_JAR="$TEMPLATE_JAR"
  else
    echo "[$(date)] ERROR: No jar available"
    exit 1
  fi
fi

cp "$VERSION_JAR" "$SERVER_DIR/server.jar"

if [ -d "$BASE/templates/plugins" ]; then
  cp "$BASE/templates/plugins"/*.jar "$SERVER_DIR/plugins/" 2>/dev/null || true
  echo "[$(date)] Default plugins copied."
fi

echo "eula=true" > "$SERVER_DIR/eula.txt"

RCON_PASS=$(cat /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 16 || true)
[ -z "$RCON_PASS" ] && RCON_PASS=$(openssl rand -hex 8)

cat > "$SERVER_DIR/server.properties" <<PROPS
server-port=${GAME_PORT}
server-ip=127.0.0.1
enable-rcon=true
rcon.port=${RCON_PORT}
rcon.password=${RCON_PASS}
online-mode=false
level-name=world
level-seed=${SEED}
motd=${DISPLAY_NAME}
max-players=${MAX_PLAYERS}
difficulty=normal
gamemode=${GAMEMODE}
white-list=${WHITELIST}
spawn-protection=16
enable-command-block=false
PROPS

mkdir -p "$SERVER_DIR/config"
cat > "$SERVER_DIR/config/paper-global.yml" <<PAPERCONF
_version: 28
proxies:
  bungee-cord:
    online-mode: false
  velocity:
    enabled: true
    online-mode: true
    secret: '${FORWARDING_SECRET}'
PAPERCONF

# Generate ops.json if ops provided
if [ -n "$OPS" ] && [ "$OPS" != "[]" ]; then
  node -e "
    const names = JSON.parse(process.argv[1]);
    const ops = names.map(function(n){ return {uuid:'',name:n,level:4,bypassesPlayerLimit:false}; });
    require('fs').writeFileSync(process.argv[2], JSON.stringify(ops, null, 2));
  " "$OPS" "$SERVER_DIR/ops.json" && echo "[$(date)] ops.json written with $(echo "$OPS" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.length);") operators" || echo "[$(date)] Warning: could not write ops.json"
fi

# Download plugins if addons provided
declare -A PLUGIN_URLS
PLUGIN_URLS["p1"]="https://github.com/EssentialsX/Essentials/releases/download/2.21.2/EssentialsX-2.21.2.jar"
PLUGIN_URLS["p4"]="https://cdn.modrinth.com/data/Vebnzrzj/versions/MBSY8toc/LuckPerms-Bukkit-5.5.53.jar"
PLUGIN_URLS["p6"]="https://cdn.modrinth.com/data/1u6JkXh5/versions/ecqqLKUO/worldedit-bukkit-7.3.8.jar"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
PLUGIN_URLS["p-chatfmt"]="https://github.com/bergerch/ChatFormatter/releases/latest/download/ChatFormatter.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/B1GP5Esg/versions/vBbWYVRp/Axiom-Paper-5.1.jar"
# ViaVersion is auto-included from templates/plugins — no need to select it
PLUGIN_URLS["p-viaversion"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/5.9.1/PAPER/download"

if [ -n "$ADDONS" ] && [ "$ADDONS" != "[]" ]; then
  echo "[$(date)] Installing addons..."
  while IFS= read -r addonId; do
    [ -z "$addonId" ] && continue
    url="${PLUGIN_URLS[$addonId]:-}"
    if [ -n "$url" ]; then
      filename=$(basename "$url" | sed 's/\?.*$//')
      echo "[$(date)] Downloading $addonId: $filename"
      wget -q "$url" -O "$SERVER_DIR/plugins/$filename" && echo "[$(date)] OK: $addonId" || echo "[$(date)] Failed to download $addonId"
    else
      echo "[$(date)] No URL mapped for addon: $addonId (skipping)"
    fi
  done < <(node -e "const ids=JSON.parse(process.argv[1]); ids.forEach(function(i){console.log(i);})" "$ADDONS")
fi

# Update servers.json atomically
mkdir -p "$(dirname "$SERVERS_JSON")"

NEW_ENTRY=$(cat <<ENTRY
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
ENTRY
)

TMP_JSON="$SERVERS_JSON.tmp.$$"

if [ -f "$SERVERS_JSON" ]; then
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