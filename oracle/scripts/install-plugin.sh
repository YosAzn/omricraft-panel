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

# Paid plugins — cannot auto-install
declare -A PAID_PLUGINS
PAID_PLUGINS["p21"]="MythicMobs (Premium) — purchase at mythiccraft.io"
PAID_PLUGINS["p27"]="MythicMounts (Premium) — purchase at mythiccraft.io"
PAID_PLUGINS["p28"]="ItemsAdder (Premium) — purchase at spigotmc.org/resources/73355"

if [[ -n "${PAID_PLUGINS[$PLUGIN_ID]:-}" ]]; then
  echo "ERROR: ${PAID_PLUGINS[$PLUGIN_ID]} — cannot auto-install premium plugins"
  exit 2
fi

# Download URLs — GitHub releases preferred (most reliable)
declare -A PLUGIN_URLS
# --- Core ---
PLUGIN_URLS["p1"]="https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsX-2.22.0.jar"
PLUGIN_URLS["p2"]="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
PLUGIN_URLS["p3"]="https://github.com/PlayPro/CoreProtect/releases/download/v22.4/CoreProtect-22.4.jar"
PLUGIN_URLS["p4"]="https://cdn.modrinth.com/data/Vebnzrzj/versions/MBSY8toc/LuckPerms-Bukkit-5.5.53.jar"
PLUGIN_URLS["p5"]="https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar"
PLUGIN_URLS["p6"]="https://cdn.modrinth.com/data/1u6JkXh5/versions/ecqqLKUO/worldedit-bukkit-7.3.8.jar"
PLUGIN_URLS["p9"]="https://github.com/BlueMap-Minecraft/BlueMap/releases/latest/download/BlueMap-Paper.jar"
PLUGIN_URLS["p10"]="https://cdn.modrinth.com/data/Mcalive/versions/latest/FastLeafDecay.jar"
PLUGIN_URLS["p11"]="https://github.com/Gecolay/GSit/releases/latest/download/GSit.jar"
PLUGIN_URLS["p12"]="https://github.com/Multiverse/Multiverse-Core/releases/latest/download/multiverse-core.jar"
PLUGIN_URLS["p13"]="https://github.com/Pyrbu/ZNPCsPlus/releases/latest/download/ZNPCsPlus.jar"
PLUGIN_URLS["p14"]="https://github.com/PlaceholderAPI/PlaceholderAPI/releases/download/2.11.6/PlaceholderAPI-2.11.6.jar"
PLUGIN_URLS["p15"]="https://github.com/nicholasnre/PowerRanks/releases/latest/download/PowerRanks.jar"
PLUGIN_URLS["p16"]="https://github.com/kangarko/ChatControl-Free/releases/download/v8.0.4/ChatControl-8.0.4.jar"
PLUGIN_URLS["p17"]="https://github.com/TownyAdvanced/Towny/releases/latest/download/Towny.jar"
PLUGIN_URLS["p18"]="https://blob.build/dl/Slimefun4/Dev/latest"
PLUGIN_URLS["p19"]="https://cdn.modrinth.com/data/jdQ7AFqJ/versions/latest/AuraSkills-Paper.jar"
PLUGIN_URLS["p20"]="https://github.com/Bazalbuilder/AuctionHouse/releases/latest/download/AuctionHouse.jar"
PLUGIN_URLS["p22"]="https://cdn.modrinth.com/data/2o5JaElC/versions/latest/BetterRTP.jar"
PLUGIN_URLS["p23"]="https://github.com/lucko/spark/releases/latest/download/spark-paper.jar"
PLUGIN_URLS["p24"]="https://hangar.papermc.io/api/v1/projects/PlugManX/versions/latest/PAPER/download"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
PLUGIN_URLS["p26"]="https://github.com/devmart10/AdvancedShulkerboxes/releases/latest/download/AdvancedShulkerboxes.jar"
PLUGIN_URLS["p29"]="https://cdn.modrinth.com/data/pReHPcIz/versions/latest/GrimAC.jar"
PLUGIN_URLS["p30"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/latest/PAPER/download"
PLUGIN_URLS["p31"]="https://github.com/LOOHP/InteractiveChat/releases/latest/download/InteractiveChat.jar"
PLUGIN_URLS["p32"]="https://github.com/pop4959/Chunky/releases/latest/download/Chunky-Paper.jar"
PLUGIN_URLS["p33"]="https://github.com/NEZNAMY/TAB/releases/latest/download/TAB.v4.1.13.jar"
PLUGIN_URLS["p34"]="https://github.com/LMBishop/InvisibleItemFrames/releases/latest/download/InvisibleItemFrames.jar"
PLUGIN_URLS["p35"]="https://github.com/jchristopher327/ClearLagg/releases/latest/download/ClearLagg.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/B1GP5Esg/versions/vBbWYVRp/Axiom-Paper-5.1.jar"
PLUGIN_URLS["p-chatfmt"]="https://github.com/bergerch/ChatFormatter/releases/latest/download/ChatFormatter.jar"
PLUGIN_URLS["p-viaversion"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/latest/PAPER/download"

# Explicit filenames for URLs that don't end in .jar (API redirects)
declare -A PLUGIN_FILENAMES
PLUGIN_FILENAMES["p2"]="Geyser-Spigot.jar"
PLUGIN_FILENAMES["p18"]="Slimefun4.jar"
PLUGIN_FILENAMES["p24"]="PlugManX.jar"
PLUGIN_FILENAMES["p30"]="ViaVersion.jar"
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
