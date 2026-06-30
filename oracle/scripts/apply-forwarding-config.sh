#!/usr/bin/env bash
set -euo pipefail

# apply-forwarding-config.sh — writes the correct Velocity MODERN-forwarding
# config for a server's TYPE/family. Velocity (our proxy) uses modern player
# forwarding, so EVERY backend MUST be configured for it or players simply
# cannot connect ("If you wish to use IP forwarding, please enable it in your
# BungeeCord config..."). This is the project's recurring "created server won't
# connect" bug — so this is FAIL-LOUD.
#
# Usage: ./apply-forwarding-config.sh SERVER_DIR TYPE VERSION
#
# Families:
#   paper/purpur/folia/mohist/youer (Bukkit-based) → config/paper-global.yml velocity block
#   fabric                                    → FabricProxy-Lite mod + config/FabricProxy-Lite.toml
#   forge/neoforge                            → REJECTED (no clean modern-forwarding mod)
#   vanilla                                   → REJECTED (cannot do modern forwarding)

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 SERVER_DIR TYPE VERSION"
  exit 1
fi

SERVER_DIR="$1"
TYPE="$2"
VERSION="$3"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jar-utils.sh"

BASE="/home/ubuntu/omricraft"
FORWARDING_SECRET_FILE="$BASE/velocity/forwarding.secret"

if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] ERROR: SERVER_DIR '$SERVER_DIR' does not exist"
  exit 1
fi
if [ ! -f "$FORWARDING_SECRET_FILE" ]; then
  echo "[$(date)] ERROR: forwarding.secret not found at $FORWARDING_SECRET_FILE"
  exit 1
fi
FORWARDING_SECRET=$(cat "$FORWARDING_SECRET_FILE")

case "$TYPE" in
  paper|purpur|folia|mohist|youer)
    # Youer (NeoForge hybrid, Mohist's maintained successor) implements the Paper/Purpur
    # API and reads config/paper-global.yml for Velocity modern forwarding exactly like
    # Mohist — same Bukkit-family forwarding path.
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
    echo "[$(date)] paper-global.yml velocity forwarding written for $TYPE"
    ;;

  fabric)
    mkdir -p "$SERVER_DIR/mods" "$SERVER_DIR/config"
    # Resolve a FabricProxy-Lite build compatible with this MC version from Modrinth.
    # Project slug: fabricproxy-lite. We query versions filtered by game_version
    # and loader=fabric, then take the newest matching file.
    DL_URL=$(curl -sf "https://api.modrinth.com/v2/project/fabricproxy-lite/version?game_versions=%5B%22${VERSION}%22%5D&loaders=%5B%22fabric%22%5D" \
      | python3 -c "
import sys, json
try:
    vs = json.load(sys.stdin)
    if not vs:
        print('')
    else:
        # newest first (Modrinth returns date_published desc); pick primary file
        files = vs[0].get('files', [])
        primary = next((f for f in files if f.get('primary')), files[0] if files else None)
        print(primary['url'] if primary else '')
except Exception:
    print('')
" 2>/dev/null || echo "")
    if [ -z "$DL_URL" ]; then
      echo "[$(date)] ERROR: No FabricProxy-Lite build found for Fabric MC $VERSION. Refusing to leave an unjoinable Fabric server (modern forwarding requires FabricProxy-Lite)."
      exit 1
    fi
    # Remove any older copy first to avoid duplicate-mod conflicts.
    rm -f "$SERVER_DIR/mods"/fabricproxy-lite*.jar "$SERVER_DIR/mods"/FabricProxy-Lite*.jar 2>/dev/null || true
    FPL_DEST="$SERVER_DIR/mods/FabricProxy-Lite.jar"
    echo "[$(date)] Downloading FabricProxy-Lite: $DL_URL"
    wget -q -L --timeout=60 "$DL_URL" -O "$FPL_DEST" || true
    if ! validate_jar_or_fail "$FPL_DEST" "FabricProxy-Lite"; then
      echo "[$(date)] ERROR: FabricProxy-Lite download failed/corrupt. Refusing to leave an unjoinable Fabric server."
      exit 1
    fi
    cat > "$SERVER_DIR/config/FabricProxy-Lite.toml" <<FPLCONF
# FabricProxy-Lite — modern (Velocity) forwarding for OmriCraft.
hackOnlineMode = true
hackEarlySend = false
hackMessageChat = false
disableSrvLookup = false
secret = "${FORWARDING_SECRET}"
FPLCONF
    echo "[$(date)] FabricProxy-Lite installed + config written for Fabric $VERSION"
    ;;

  forge|neoforge)
    echo "[$(date)] ERROR: $TYPE is not supported behind the Velocity proxy — there is no reliable modern-forwarding mod across all $TYPE versions. Refusing to create an unjoinable server."
    exit 2
    ;;

  vanilla)
    echo "[$(date)] ERROR: vanilla cannot do modern player forwarding behind Velocity. Pick Paper/Purpur/Folia/Mohist/Youer or Fabric."
    exit 2
    ;;

  *)
    echo "[$(date)] ERROR: unknown TYPE '$TYPE' — cannot configure forwarding."
    exit 1
    ;;
esac

echo "[$(date)] apply-forwarding-config OK: $TYPE $VERSION"
