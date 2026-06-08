#!/usr/bin/env bash
set -euo pipefail

# Usage: ./create-server.sh SERVER_ID DISPLAY_NAME SLUG TYPE VERSION GAME_PORT RCON_PORT MEMORY_MB [SEED] [OPS_JSON] [ADDONS_JSON] [MAX_PLAYERS] [GAMEMODE] [WHITELIST] [DIFFICULTY] [WORLD_TYPE] [WHITELIST_PLAYERS_JSON]

if [ "$#" -lt 8 ]; then
  echo "Usage: $0 SERVER_ID DISPLAY_NAME SLUG TYPE VERSION GAME_PORT RCON_PORT MEMORY_MB [SEED] [OPS_JSON] [ADDONS_JSON] [MAX_PLAYERS] [GAMEMODE] [WHITELIST] [DIFFICULTY] [WORLD_TYPE] [WHITELIST_PLAYERS_JSON]"
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
DIFFICULTY="${15:-normal}"
WORLD_TYPE_RAW="${16:-default}"
WHITELIST_PLAYERS="${17:-[]}"

# Map UI world types to Minecraft 1.18+ level-type values
case "$WORLD_TYPE_RAW" in
  flat)       LEVEL_TYPE="minecraft:flat" ;;
  large_biomes) LEVEL_TYPE="minecraft:large_biomes" ;;
  amplified)  LEVEL_TYPE="minecraft:amplified" ;;
  *)          LEVEL_TYPE="minecraft:normal" ;;
esac

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
  DOWNLOADED=false

  # 26.x versions use new PaperMC download system (fill-data.papermc.io)
  if echo "$VERSION" | grep -qE '^[2-9][0-9]\.' ; then
    echo "[$(date)] Using new PaperMC download system for $VERSION..."
    DL_URL=$(python3 -c "
import re, urllib.request
try:
    req = urllib.request.Request('https://papermc.io/downloads/paper', headers={'User-Agent': 'curl/7.88'})
    content = urllib.request.urlopen(req, timeout=20).read().decode('latin-1', errors='replace')
    ver = '${VERSION}'.replace('.', r'\\\.')
    urls = re.findall(r'fill-data\\.papermc\\.io/v1/objects/[a-f0-9]+/paper-' + ver + r'-[0-9]+\\.jar', content)
    print('https://' + urls[0] if urls else '')
except Exception as e:
    print('')
" 2>/dev/null || echo "")
    if [ -n "$DL_URL" ]; then
      wget -q --timeout=120 -L "$DL_URL" -O "$VERSION_JAR" \
        && echo "[$(date)] Downloaded Paper $VERSION from $DL_URL" && DOWNLOADED=true
    fi

  else
    # 1.x.x versions use old PaperMC API
    BUILD=$(curl -sf "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds" | \
      node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{try{const o=JSON.parse(d); console.log(o.builds[o.builds.length-1].build);}catch(e){process.exit(1);}})" 2>/dev/null || echo "")
    if [ -n "$BUILD" ]; then
      wget -q "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/${BUILD}/downloads/paper-${VERSION}-${BUILD}.jar" \
        -O "$VERSION_JAR" && echo "[$(date)] Downloaded Paper $VERSION build $BUILD" && DOWNLOADED=true
    fi
  fi

  if [ "$DOWNLOADED" != "true" ]; then
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
level-type=${LEVEL_TYPE}
motd=${DISPLAY_NAME}
max-players=${MAX_PLAYERS}
difficulty=${DIFFICULTY}
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
  " "$OPS" "$SERVER_DIR/ops.json" && echo "[$(date)] ops.json written" || echo "[$(date)] Warning: could not write ops.json"
fi

# Generate whitelist.json for private servers:
# always include ops (server owners) + any explicit whitelistPlayers
if [ "$WHITELIST" = "true" ]; then
  node -e "
    const ops = JSON.parse(process.argv[1] || '[]');
    const wl  = JSON.parse(process.argv[2] || '[]');
    const all = [...new Set([...ops, ...wl])].filter(Boolean);
    const entries = all.map(function(n){ return {uuid:'',name:n}; });
    require('fs').writeFileSync(process.argv[3], JSON.stringify(entries, null, 2));
    console.log('whitelist.json: ' + all.join(', ') + ' (' + all.length + ' players)');
  " "$OPS" "$WHITELIST_PLAYERS" "$SERVER_DIR/whitelist.json" || echo "[$(date)] Warning: could not write whitelist.json"
fi

# Download plugins if addons provided
declare -A PLUGIN_URLS
# --- Plugins with direct download URLs ---
PLUGIN_URLS["p1"]="https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsX-2.22.0.jar"
PLUGIN_URLS["p2"]="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
PLUGIN_URLS["p3"]="https://cdn.modrinth.com/data/Lu3KuzdV/versions/6W2ad1iI/CoreProtect-CE-23.2.jar"
PLUGIN_URLS["p4"]="https://cdn.modrinth.com/data/Vebnzrzj/versions/MBSY8toc/LuckPerms-Bukkit-5.5.53.jar"
PLUGIN_URLS["p5"]="https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar"
PLUGIN_URLS["p6"]="https://cdn.modrinth.com/data/1u6JkXh5/versions/ecqqLKUO/worldedit-bukkit-7.3.8.jar"
PLUGIN_URLS["p9"]="https://github.com/BlueMap-Minecraft/BlueMap/releases/download/v5.20/bluemap-5.20-paper.jar"
PLUGIN_URLS["p10"]="https://cdn.modrinth.com/data/FnE6S0Zk/versions/TyzRB3KW/FastLeafDecay-1.0.6.jar"
PLUGIN_URLS["p11"]="https://github.com/gecolay/GSit/releases/download/3.4.2/GSit-3.4.2.jar"
PLUGIN_URLS["p12"]="https://github.com/Multiverse/Multiverse-Core/releases/download/5.7.0/multiverse-core-5.7.0.jar"
PLUGIN_URLS["p14"]="https://github.com/PlaceholderAPI/PlaceholderAPI/releases/download/2.12.2/PlaceholderAPI-2.12.2.jar"
PLUGIN_URLS["p16"]="https://github.com/kangarko/ChatControl-Free/releases/download/5.9.6/ChatControl-Free-5.9.6.jar"
PLUGIN_URLS["p17"]="https://github.com/TownyAdvanced/Towny/releases/download/0.103.0.2/towny-0.103.0.2.jar"
PLUGIN_URLS["p19"]="https://github.com/Archy-X/AuraSkills/releases/download/2.3.12/AuraSkills-2.3.12.jar"
PLUGIN_URLS["p20"]="https://cdn.modrinth.com/data/mRfwcqe3/versions/th0S9rok/AuctionHouse-1.0.0-SNAPSHOT.jar"
PLUGIN_URLS["p22"]="https://cdn.modrinth.com/data/8fW0q2Yg/versions/nl3u6PJq/RtpGUI.jar"
PLUGIN_URLS["p23"]="https://ci.lucko.me/job/spark/lastSuccessfulBuild/artifact/spark-paper/build/libs/spark-1.10.172-paper.jar"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
PLUGIN_URLS["p29"]="https://cdn.modrinth.com/data/LJNGWSvH/versions/DLhBWSiW/grimac-bukkit-2.3.74-41b0fff.jar"
PLUGIN_URLS["p30"]="https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.9.1/PAPER/ViaVersion-5.9.1.jar"
PLUGIN_URLS["p32"]="https://cdn.modrinth.com/data/fALzjamp/versions/MdY6JATr/Chunky-Bukkit-1.5.3.jar"
PLUGIN_URLS["p33"]="https://hangarcdn.papermc.io/plugins/NEZNAMY/TAB/versions/5.0.7/PAPER/TAB%20v5.0.7.jar"
PLUGIN_URLS["p35"]="https://cdn.modrinth.com/data/KAaZvh09/versions/6Yb1ntAi/ClearLaggEnhanced-2026.5.3.jar"
PLUGIN_URLS["p-chatfmt"]="https://github.com/EternalCodeTeam/ChatFormatter/releases/download/v1.3.5/ChatFormatter.v1.3.5.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/evkiwA7V/versions/mSS9faHn/AxiomPaperPlugin-5.0.4-for-MC1.21.11.jar"
# ViaVersion is auto-included from templates/plugins (already installed)
PLUGIN_URLS["p-viaversion"]="https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.9.1/PAPER/ViaVersion-5.9.1.jar"

# Explicit filenames for URLs that don't end in .jar (API redirects, no extension in URL)
declare -A PLUGIN_FILENAMES
PLUGIN_FILENAMES["p2"]="Geyser-Spigot.jar"
PLUGIN_FILENAMES["p33"]="TAB.jar"

if [ -n "$ADDONS" ] && [ "$ADDONS" != "[]" ]; then
  echo "[$(date)] Installing addons..."
  while IFS= read -r addonId; do
    [ -z "$addonId" ] && continue
    url="${PLUGIN_URLS[$addonId]:-}"
    if [ -n "$url" ]; then
      if [[ -n "${PLUGIN_FILENAMES[$addonId]:-}" ]]; then
        filename="${PLUGIN_FILENAMES[$addonId]}"
      else
        filename=$(basename "$url" | sed 's/\?.*$//')
      fi
      echo "[$(date)] Downloading $addonId: $filename"
      wget -q -L --timeout=60 "$url" -O "$SERVER_DIR/plugins/$filename"
      if [ ! -s "$SERVER_DIR/plugins/$filename" ]; then
        rm -f "$SERVER_DIR/plugins/$filename"
        echo "[$(date)] FAILED (0 bytes): $addonId ($filename)"
      else
        echo "[$(date)] OK: $addonId ($filename)"
      fi
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