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

# Generate whitelist.json if whitelist players provided
if [ -n "$WHITELIST_PLAYERS" ] && [ "$WHITELIST_PLAYERS" != "[]" ]; then
  node -e "
    const names = JSON.parse(process.argv[1]);
    const entries = names.map(function(n){ return {uuid:'',name:n}; });
    require('fs').writeFileSync(process.argv[2], JSON.stringify(entries, null, 2));
  " "$WHITELIST_PLAYERS" "$SERVER_DIR/whitelist.json" && echo "[$(date)] whitelist.json written" || echo "[$(date)] Warning: could not write whitelist.json"
fi

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
# --- Plugins with direct download URLs ---
PLUGIN_URLS["p1"]="https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsX-2.22.0.jar"
PLUGIN_URLS["p2"]="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
PLUGIN_URLS["p3"]="https://github.com/PlayPro/CoreProtect/releases/download/v22.4/CoreProtect-22.4.jar"
PLUGIN_URLS["p4"]="https://cdn.modrinth.com/data/Vebnzrzj/versions/MBSY8toc/LuckPerms-Bukkit-5.5.53.jar"
PLUGIN_URLS["p5"]="https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar"
PLUGIN_URLS["p6"]="https://cdn.modrinth.com/data/1u6JkXh5/versions/ecqqLKUO/worldedit-bukkit-7.3.8.jar"
PLUGIN_URLS["p9"]="https://github.com/BlueMap-Minecraft/BlueMap/releases/latest/download/BlueMap-Paper.jar"
PLUGIN_URLS["p10"]="https://github.com/Gecolay/GSit/releases/latest/download/GSit.jar"
PLUGIN_URLS["p11"]="https://github.com/Gecolay/GSit/releases/latest/download/GSit.jar"
PLUGIN_URLS["p12"]="https://github.com/Multiverse/Multiverse-Core/releases/latest/download/multiverse-core.jar"
PLUGIN_URLS["p14"]="https://github.com/PlaceholderAPI/PlaceholderAPI/releases/download/2.11.6/PlaceholderAPI-2.11.6.jar"
PLUGIN_URLS["p16"]="https://github.com/kangarko/ChatControl-Free/releases/download/v8.0.4/ChatControl-8.0.4.jar"
PLUGIN_URLS["p17"]="https://github.com/TownyAdvanced/Towny/releases/latest/download/Towny.jar"
PLUGIN_URLS["p19"]="https://github.com/Archy-X/AureliumSkills/releases/latest/download/AuraSkills.jar"
PLUGIN_URLS["p20"]="https://github.com/Bazalbuilder/AuctionHouse/releases/latest/download/AuctionHouse.jar"
PLUGIN_URLS["p22"]="https://github.com/BadBoy-ultimate/BetterRTP/releases/latest/download/BetterRTP.jar"
PLUGIN_URLS["p23"]="https://github.com/lucko/spark/releases/latest/download/spark-paper.jar"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
PLUGIN_URLS["p29"]="https://github.com/GrimAnticheat/Grim/releases/latest/download/Grim.jar"
PLUGIN_URLS["p30"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/latest/PAPER/download"
PLUGIN_URLS["p32"]="https://github.com/pop4959/Chunky/releases/latest/download/Chunky-Paper.jar"
PLUGIN_URLS["p33"]="https://github.com/NEZNAMY/TAB/releases/latest/download/TAB.v4.1.13.jar"
PLUGIN_URLS["p35"]="https://github.com/jchristopher327/ClearLagg/releases/latest/download/ClearLagg.jar"
PLUGIN_URLS["p-chatfmt"]="https://github.com/bergerch/ChatFormatter/releases/latest/download/ChatFormatter.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/B1GP5Esg/versions/vBbWYVRp/Axiom-Paper-5.1.jar"
# ViaVersion is auto-included from templates/plugins (already installed)
PLUGIN_URLS["p-viaversion"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/latest/PAPER/download"

# Explicit filenames for URLs that don't end in .jar (API redirects, no extension in URL)
declare -A PLUGIN_FILENAMES
PLUGIN_FILENAMES["p2"]="Geyser-Spigot.jar"
PLUGIN_FILENAMES["p30"]="ViaVersion.jar"
PLUGIN_FILENAMES["p-viaversion"]="ViaVersion.jar"

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
      wget -q -L --timeout=60 "$url" -O "$SERVER_DIR/plugins/$filename" && echo "[$(date)] OK: $addonId" || { rm -f "$SERVER_DIR/plugins/$filename"; echo "[$(date)] Failed to download $addonId"; }
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