#!/usr/bin/env bash
set -euo pipefail

# Usage: ./install-plugin.sh SERVER_ID PLUGIN_ID

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 SERVER_ID PLUGIN_ID"
  exit 1
fi

SERVER_ID="$1"
PLUGIN_ID="$2"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
PLUGINS_DIR="$SERVER_DIR/plugins"

if ! echo "$SERVER_ID" | grep -qE '^[a-z0-9_-]+$'; then
  echo "ERROR: Invalid SERVER_ID"
  exit 1
fi

if [ ! -d "$SERVER_DIR" ]; then
  echo "ERROR: Server directory not found: $SERVER_DIR"
  exit 1
fi

mkdir -p "$PLUGINS_DIR"

# Paid or unavailable plugins — cannot auto-install
declare -A PAID_PLUGINS
PAID_PLUGINS["p21"]="MythicMobs (Premium) — purchase at mythiccraft.io"
PAID_PLUGINS["p26"]="AdvancedShulkerboxes — original repo removed, no active bukkit release available"
PAID_PLUGINS["p27"]="MythicMounts (Premium) — purchase at mythiccraft.io"
PAID_PLUGINS["p28"]="ItemsAdder (Premium) — purchase at spigotmc.org/resources/73355"

if [[ -n "${PAID_PLUGINS[$PLUGIN_ID]:-}" ]]; then
  echo "ERROR: ${PAID_PLUGINS[$PLUGIN_ID]} — cannot auto-install premium plugins"
  exit 2
fi

# Download URLs — verified 2026-06-08 (pinned versions preferred over /latest/download/ redirects)
declare -A PLUGIN_URLS
# --- Core ---
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
PLUGIN_URLS["p13"]="https://cdn.modrinth.com/data/p9LVUS4o/versions/F8kYxiSl/ZNPCsPlus-2.0.0.jar"
PLUGIN_URLS["p14"]="https://github.com/PlaceholderAPI/PlaceholderAPI/releases/download/2.12.2/PlaceholderAPI-2.12.2.jar"
PLUGIN_URLS["p15"]="https://cdn.modrinth.com/data/ecVvYtj3/versions/zjQoKxad/PowerRanks.jar"
PLUGIN_URLS["p16"]="https://github.com/kangarko/ChatControl-Free/releases/download/5.9.6/ChatControl-Free-5.9.6.jar"
PLUGIN_URLS["p17"]="https://github.com/TownyAdvanced/Towny/releases/download/0.103.0.2/towny-0.103.0.2.jar"
PLUGIN_URLS["p18"]="https://blob.build/dl/Slimefun4/Dev/latest"
PLUGIN_URLS["p19"]="https://cdn.modrinth.com/data/uDdZAVls/versions/QOb8ZzmE/AuraSkills-2.3.12.jar"
PLUGIN_URLS["p20"]="https://cdn.modrinth.com/data/mRfwcqe3/versions/th0S9rok/AuctionHouse-1.0.0-SNAPSHOT.jar"
PLUGIN_URLS["p22"]="https://cdn.modrinth.com/data/8fW0q2Yg/versions/nl3u6PJq/RtpGUI.jar"
PLUGIN_URLS["p23"]="https://ci.lucko.me/job/spark/lastSuccessfulBuild/artifact/spark-paper/build/libs/spark-1.10.172-paper.jar"
PLUGIN_URLS["p24"]="https://cdn.modrinth.com/data/yro4niHu/versions/hrMAp7Ww/PlugManX-3.0.4.jar"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
# p26 AdvancedShulkerboxes — repo dead, no active bukkit release found; cannot install
PLUGIN_URLS["p29"]="https://cdn.modrinth.com/data/LJNGWSvH/versions/DLhBWSiW/grimac-bukkit-2.3.74-41b0fff.jar"
PLUGIN_URLS["p30"]="https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.9.1/PAPER/ViaVersion-5.9.1.jar"
PLUGIN_URLS["p31"]="https://cdn.modrinth.com/data/VOenPQ01/versions/A2wO2Mkq/InteractiveChat-2026.1.0.0.jar"
PLUGIN_URLS["p32"]="https://cdn.modrinth.com/data/fALzjamp/versions/MdY6JATr/Chunky-Bukkit-1.5.3.jar"
PLUGIN_URLS["p33"]="https://hangarcdn.papermc.io/plugins/NEZNAMY/TAB/versions/5.0.7/PAPER/TAB%20v5.0.7.jar"
PLUGIN_URLS["p34"]="https://cdn.modrinth.com/data/2BFDqF3g/versions/qeas7jvx/InvisibleItemFramesLite-3.2.1.jar"
PLUGIN_URLS["p35"]="https://cdn.modrinth.com/data/KAaZvh09/versions/6Yb1ntAi/ClearLaggEnhanced-2026.5.3.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/evkiwA7V/versions/mSS9faHn/AxiomPaperPlugin-5.0.4-for-MC1.21.11.jar"
PLUGIN_URLS["p-chatfmt"]="https://github.com/EternalCodeTeam/ChatFormatter/releases/download/v1.3.5/ChatFormatter.v1.3.5.jar"
PLUGIN_URLS["p-viaversion"]="https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.9.1/PAPER/ViaVersion-5.9.1.jar"

# Explicit filenames for URLs that don't end in .jar (API redirects)
declare -A PLUGIN_FILENAMES
PLUGIN_FILENAMES["p2"]="Geyser-Spigot.jar"
PLUGIN_FILENAMES["p18"]="Slimefun4.jar"
PLUGIN_FILENAMES["p30"]="ViaVersion.jar"
PLUGIN_FILENAMES["p33"]="TAB.jar"
PLUGIN_FILENAMES["p-viaversion"]="ViaVersion.jar"

URL="${PLUGIN_URLS[$PLUGIN_ID]:-}"

if [ -z "$URL" ]; then
  echo "ERROR: No download URL for plugin: $PLUGIN_ID"
  exit 1
fi

# Use explicit filename if defined, otherwise derive from URL
if [[ -n "${PLUGIN_FILENAMES[$PLUGIN_ID]:-}" ]]; then
  FILENAME="${PLUGIN_FILENAMES[$PLUGIN_ID]}"
else
  FILENAME=$(basename "$URL" | sed 's/\?.*$//')
fi

DEST="$PLUGINS_DIR/$FILENAME"

echo "[$(date)] Installing $PLUGIN_ID -> $FILENAME"
wget -q --timeout=60 -L "$URL" -O "$DEST"

if [ $? -eq 0 ] && [ -s "$DEST" ]; then
  echo "[$(date)] OK: $PLUGIN_ID installed at $DEST"
else
  rm -f "$DEST"
  echo "ERROR: Download failed for $PLUGIN_ID"
  exit 1
fi
