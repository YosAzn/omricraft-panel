#!/usr/bin/env bash
set -euo pipefail

# Usage: ./install-plugin.sh SERVER_ID PLUGIN_ID

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 SERVER_ID PLUGIN_ID"
  exit 1
fi

SERVER_ID="$1"
PLUGIN_ID="$2"

# Shared jar validation helper (B-8)
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jar-utils.sh"

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

# --- GitHub-release plugins (free, NOT on Modrinth) ---
# Some free plugins are distributed only via GitHub releases (e.g. ProtocolLib).
# For these we resolve the current release's .jar asset from the GitHub API via the
# shared install-plugin-url.sh primitive, so we always grab the latest build. A
# pinned fallback URL (exported below) is used only if the API call fails.
declare -A PLUGIN_GITHUB_REPOS
declare -A PLUGIN_GITHUB_FALLBACK
# (No plugins currently use GitHub /releases/latest resolution — the mechanism is kept
# for future GitHub-only plugins.) p37 ProtocolLib was MOVED to PLUGIN_URLS below and
# pinned to the rolling 'dev-build' asset: stable ProtocolLib (/releases/latest = 5.4.0)
# caps at MC 1.21.8 and breaks InteractiveChat/ItemsAdder on 1.21.9+; the dev-build
# channel tracks the newest MC and updates in place at a stable URL.

if [[ -n "${PLUGIN_GITHUB_REPOS[$PLUGIN_ID]:-}" ]]; then
  echo "[$(date)] $PLUGIN_ID resolves via GitHub release (${PLUGIN_GITHUB_REPOS[$PLUGIN_ID]})"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  export PLUGIN_FALLBACK_URL="${PLUGIN_GITHUB_FALLBACK[$PLUGIN_ID]:-}"
  exec bash "$SCRIPT_DIR/install-plugin-url.sh" "$SERVER_DIR" "github:${PLUGIN_GITHUB_REPOS[$PLUGIN_ID]}"
fi

# Download URLs — verified 2026-06-08 (pinned versions preferred over /latest/download/ redirects)
declare -A PLUGIN_URLS
# --- Core ---
PLUGIN_URLS["p1"]="https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsX-2.22.0.jar"
PLUGIN_URLS["p2"]="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
PLUGIN_URLS["p3"]="https://cdn.modrinth.com/data/Lu3KuzdV/versions/6W2ad1iI/CoreProtect-CE-23.2.jar"
PLUGIN_URLS["p4"]="https://cdn.modrinth.com/data/Vebnzrzj/versions/MBSY8toc/LuckPerms-Bukkit-5.5.53.jar"
PLUGIN_URLS["p5"]="https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar"
# p6 WorldEdit 7.4.4 (bukkit). NOTE: 7.4.x DROPS MC 1.21-1.21.3 (older servers) —
# acceptable because the panel's version form defaults to 1.21.4, and 7.3.8 capped at
# 1.21.1 and broke on the 1.21.11 default+newest.
PLUGIN_URLS["p6"]="https://cdn.modrinth.com/data/1u6JkXh5/versions/qNuPcliz/worldedit-bukkit-7.4.4.jar"
# p9 BlueMap 5.16 covers MC 1.21.5-1.21.11 (5.20 targets MC 26.x only).
PLUGIN_URLS["p9"]="https://github.com/BlueMap-Minecraft/BlueMap/releases/download/v5.16/bluemap-5.16-paper.jar"
PLUGIN_URLS["p10"]="https://cdn.modrinth.com/data/FnE6S0Zk/versions/TyzRB3KW/FastLeafDecay-1.0.6.jar"
PLUGIN_URLS["p11"]="https://github.com/gecolay/GSit/releases/download/3.4.2/GSit-3.4.2.jar"
PLUGIN_URLS["p12"]="https://github.com/Multiverse/Multiverse-Core/releases/download/5.7.0/multiverse-core-5.7.0.jar"
PLUGIN_URLS["p13"]="https://cdn.modrinth.com/data/p9LVUS4o/versions/F8kYxiSl/ZNPCsPlus-2.0.0.jar"
PLUGIN_URLS["p14"]="https://github.com/PlaceholderAPI/PlaceholderAPI/releases/download/2.12.2/PlaceholderAPI-2.12.2.jar"
PLUGIN_URLS["p15"]="https://cdn.modrinth.com/data/ecVvYtj3/versions/zjQoKxad/PowerRanks.jar"
# p16 ChatSentinel 2.0.2 (OSS, maintained, Folia-aware, MC 1.21.11) — replaces the dead
# ChatControl-Free 5.9.6 (a <=1.16.4 build). Catalog id/name handled by the frontend;
# only the download source + filename (ChatSentinel.jar) change here.
PLUGIN_URLS["p16"]="https://cdn.modrinth.com/data/d1aRSTsI/versions/WgAO7PZY/ChatSentinel.jar"
PLUGIN_URLS["p17"]="https://github.com/TownyAdvanced/Towny/releases/download/0.103.0.2/towny-0.103.0.2.jar"
PLUGIN_URLS["p18"]="https://blob.build/dl/Slimefun4/Dev/latest"
PLUGIN_URLS["p19"]="https://cdn.modrinth.com/data/uDdZAVls/versions/QOb8ZzmE/AuraSkills-2.3.12.jar"
# p20 AuctionHouse by Kiran Hart (canonical, free) — SpigotMC resource 61836, fetched via
# the Spiget API (Kiran Hart publishes no GitHub releases and SpigotMC has no direct
# download API). Replaces the obscure "AuctionsHouse" look-alike (modrinth mRfwcqe3).
# URL ends in /download (not .jar) -> needs PLUGIN_FILENAMES["p20"] below.
PLUGIN_URLS["p20"]="https://api.spiget.org/v2/resources/61836/download"
# p22 BetterRTP 3.6.13 (RonanCraft — the actual RTP engine, Folia-aware, MC 1.21.11).
# Replaces RtpGUI, which is only a GUI and hard-requires the BetterRTP engine we never
# installed (so p22 was broken).
PLUGIN_URLS["p22"]="https://cdn.modrinth.com/data/GHjSx3E3/versions/OF3rd3g9/BetterRTP-3.6.13.jar"
PLUGIN_URLS["p23"]="https://ci.lucko.me/job/spark/lastSuccessfulBuild/artifact/spark-bukkit/build/libs/spark-1.10.173-bukkit.jar"
PLUGIN_URLS["p24"]="https://cdn.modrinth.com/data/yro4niHu/versions/hrMAp7Ww/PlugManX-3.0.4.jar"
PLUGIN_URLS["p25"]="https://cdn.modrinth.com/data/QufNAmjx/versions/uFIoBZOK/ExcellentEnchants-5.4.1.jar"
# p26 AdvancedShulkerboxes — repo dead, no active bukkit release found; cannot install
PLUGIN_URLS["p29"]="https://cdn.modrinth.com/data/LJNGWSvH/versions/DLhBWSiW/grimac-bukkit-2.3.74-41b0fff.jar"
PLUGIN_URLS["p30"]="https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.9.1/PAPER/ViaVersion-5.9.1.jar"
PLUGIN_URLS["p31"]="https://cdn.modrinth.com/data/VOenPQ01/versions/A2wO2Mkq/InteractiveChat-2026.1.0.0.jar"
# p32 Chunky 1.4.40 covers MC 1.21.11 (1.5.3 is 26.x-only).
PLUGIN_URLS["p32"]="https://cdn.modrinth.com/data/fALzjamp/versions/P3y2MXnd/Chunky-Bukkit-1.4.40.jar"
# p33 TAB 6.1.0 (5.0.7 capped at MC 1.21.4). Keep PLUGIN_FILENAMES["p33"]="TAB.jar".
PLUGIN_URLS["p33"]="https://github.com/NEZNAMY/TAB/releases/download/6.1.0/TAB.v6.1.0.jar"
PLUGIN_URLS["p34"]="https://cdn.modrinth.com/data/2BFDqF3g/versions/qeas7jvx/InvisibleItemFramesLite-3.2.1.jar"
PLUGIN_URLS["p35"]="https://cdn.modrinth.com/data/KAaZvh09/versions/6Yb1ntAi/ClearLaggEnhanced-2026.5.3.jar"
PLUGIN_URLS["p36"]="https://cdn.modrinth.com/data/Y4NRwMW5/versions/V3X0pOQr/nightcore-2.16.2.jar"
# p37 ProtocolLib — rolling 'dev-build' asset. Stable ProtocolLib lags new MC (latest
# release 5.4.0 caps at 1.21.8), which breaks InteractiveChat/ItemsAdder on 1.21.9+.
PLUGIN_URLS["p37"]="https://github.com/dmulloy2/ProtocolLib/releases/download/dev-build/ProtocolLib.jar"
# p38 GriefPrevention 16.18.7 (land claims / anti-grief), MC 1.21.11.
PLUGIN_URLS["p38"]="https://cdn.modrinth.com/data/O4o4mKaq/versions/dGfCZHqk/GriefPrevention.jar"
PLUGIN_URLS["p-axiom"]="https://cdn.modrinth.com/data/evkiwA7V/versions/mSS9faHn/AxiomPaperPlugin-5.0.4-for-MC1.21.11.jar"
PLUGIN_URLS["p-chatfmt"]="https://github.com/EternalCodeTeam/ChatFormatter/releases/download/v1.3.5/ChatFormatter.v1.3.5.jar"
PLUGIN_URLS["p-viaversion"]="https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.9.1/PAPER/ViaVersion-5.9.1.jar"

# Explicit filenames for URLs that don't end in .jar (API redirects)
declare -A PLUGIN_FILENAMES
PLUGIN_FILENAMES["p2"]="Geyser-Spigot.jar"
PLUGIN_FILENAMES["p20"]="AuctionHouse.jar"
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
wget -q --timeout=60 -L "$URL" -O "$DEST" || true

# B-8: real jar validation (ZIP magic + size floor), not just 0-byte.
if validate_jar_or_fail "$DEST" "$PLUGIN_ID"; then
  echo "[$(date)] OK: $PLUGIN_ID installed at $DEST"
else
  echo "ERROR: Download failed / corrupt jar for $PLUGIN_ID"
  exit 1
fi

# --- Companion installs (modules / deps shipped as SEPARATE jars) ---
# Reached only after the main jar validated above (failure exits 1 before here).

# p1 EssentialsX: the advertised /spawn command lives in the EssentialsXSpawn module,
# a separate jar in the SAME 2.22.0 GitHub release. Install it alongside EssentialsX.
if [ "$PLUGIN_ID" = "p1" ]; then
  SPAWN_URL="https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsXSpawn-2.22.0.jar"
  SPAWN_DEST="$PLUGINS_DIR/EssentialsXSpawn-2.22.0.jar"
  echo "[$(date)] Installing companion EssentialsXSpawn (adds /spawn)"
  wget -q --timeout=60 -L "$SPAWN_URL" -O "$SPAWN_DEST" || true
  if validate_jar_or_fail "$SPAWN_DEST" "p1:EssentialsXSpawn"; then
    echo "[$(date)] OK: EssentialsXSpawn installed"
  else
    echo "ERROR: EssentialsXSpawn download failed / corrupt jar for p1"
    exit 1
  fi
fi

# p2 GeyserMC: install Floodgate so Bedrock players can join WITHOUT a paid Java (Mojang)
# account, and point Geyser at Floodgate auth. Geyser regenerates its config on first
# boot; we pre-seed plugins/Geyser-Spigot/config.yml with remote.auth-type: floodgate
# (Geyser merges missing keys from its defaults, so a minimal file is enough to flip it).
if [ "$PLUGIN_ID" = "p2" ]; then
  FLOODGATE_URL="https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot"
  FLOODGATE_DEST="$PLUGINS_DIR/floodgate-spigot.jar"
  echo "[$(date)] Installing companion Floodgate (Bedrock auth for Geyser)"
  wget -q --timeout=60 -L "$FLOODGATE_URL" -O "$FLOODGATE_DEST" || true
  if validate_jar_or_fail "$FLOODGATE_DEST" "p2:Floodgate"; then
    echo "[$(date)] OK: Floodgate installed"
  else
    echo "ERROR: Floodgate download failed / corrupt jar for p2"
    exit 1
  fi
  # Seed Geyser auth-type only if no config exists yet (never clobber a real config).
  GEYSER_CFG_DIR="$PLUGINS_DIR/Geyser-Spigot"
  if [ ! -f "$GEYSER_CFG_DIR/config.yml" ]; then
    mkdir -p "$GEYSER_CFG_DIR"
    cat > "$GEYSER_CFG_DIR/config.yml" <<'GEYSERCONF'
# Minimal Geyser config seeded by OmriCraft (install-plugin.sh).
# auth-type: floodgate lets Bedrock players join without a paid Java (Mojang) account.
# Geyser fills every other option with its defaults on first boot and rewrites this file.
remote:
  auth-type: floodgate
GEYSERCONF
    echo "[$(date)] Seeded Geyser config (remote.auth-type: floodgate)"
  else
    # Do not overwrite an existing config; flag the manual step loudly.
    echo "[$(date)] TODO: Geyser-Spigot/config.yml already exists — ensure remote.auth-type: floodgate is set for passwordless Bedrock join."
  fi
fi
