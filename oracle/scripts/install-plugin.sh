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

declare -A PLUGIN_URLS
PLUGIN_URLS["p1"]="https://github.com/EssentialsX/Essentials/releases/download/2.21.2/EssentialsX-2.21.2.jar"
PLUGIN_URLS["p2"]="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
PLUGIN_URLS["p3"]="https://github.com/PlayPro/CoreProtect/releases/download/v22.4/CoreProtect-22.4.jar"
PLUGIN_URLS["p4"]="https://cdn.modrinth.com/data/Vebnzrzj/versions/MBSY8toc/LuckPerms-Bukkit-5.5.53.jar"
PLUGIN_URLS["p5"]="https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar"
PLUGIN_URLS["p6"]="https://cdn.modrinth.com/data/1u6JkXh5/versions/ecqqLKUO/worldedit-bukkit-7.3.8.jar"
PLUGIN_URLS["p9"]="https://cdn.modrinth.com/data/swbUV1cr/versions/latest/BlueMap-Paper.jar"
PLUGIN_URLS["p10"]="https://cdn.modrinth.com/data/Mcalive/versions/latest/FastLeafDecay.jar"
PLUGIN_URLS["p11"]="https://cdn.modrinth.com/data/oY2B1pjg/versions/latest/GSit.jar"
PLUGIN_URLS["p12"]="https://dev.bukkit.org/projects/multiverse-core/files/latest"
PLUGIN_URLS["p14"]="https://github.com/PlaceholderAPI/PlaceholderAPI/releases/download/2.11.6/PlaceholderAPI-2.11.6.jar"
PLUGIN_URLS["p17"]="https://cdn.modrinth.com/data/jP3RJxYe/versions/latest/Towny.jar"
PLUGIN_URLS["p19"]="https://cdn.modrinth.com/data/jdQ7AFqJ/versions/latest/AuraSkills-Paper.jar"
PLUGIN_URLS["p20"]="https://github.com/Kaktushose/AuctionHouse/releases/latest/download/AuctionHouse.jar"
PLUGIN_URLS["p22"]="https://cdn.modrinth.com/data/2o5JaElC/versions/latest/BetterRTP.jar"
PLUGIN_URLS["p23"]="https://cdn.modrinth.com/data/l6ZpMe3o/versions/latest/spark-paper.jar"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
PLUGIN_URLS["p29"]="https://cdn.modrinth.com/data/pReHPcIz/versions/latest/GrimAC.jar"
PLUGIN_URLS["p30"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/5.9.2-SNAPSHOT%2B1000/PAPER/download"
PLUGIN_URLS["p32"]="https://cdn.modrinth.com/data/fALzjamp/versions/latest/Chunky-1.4.28.jar"
PLUGIN_URLS["p33"]="https://cdn.modrinth.com/data/mC4QyMY3/versions/latest/TAB.jar"
PLUGIN_URLS["p35"]="https://dev.bukkit.org/projects/clearlag/files/latest"
PLUGIN_URLS["p-chatfmt"]="https://github.com/bergerch/ChatFormatter/releases/latest/download/ChatFormatter.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/B1GP5Esg/versions/vBbWYVRp/Axiom-Paper-5.1.jar"
PLUGIN_URLS["p-viaversion"]="https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/5.9.2-SNAPSHOT%2B1000/PAPER/download"

URL="${PLUGIN_URLS[$PLUGIN_ID]:-}"

if [ -z "$URL" ]; then
  echo "ERROR: No download URL for plugin: $PLUGIN_ID"
  exit 1
fi

FILENAME=$(basename "$URL" | sed 's/\?.*$//')
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
