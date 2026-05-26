#!/usr/bin/env bash
set -euo pipefail

# Usage: ./register-server-in-velocity.sh SERVER_ID SLUG GAME_PORT

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 SERVER_ID SLUG GAME_PORT"
  exit 1
fi

SERVER_ID="$1"
SLUG="$2"
GAME_PORT="$3"

BASE="/home/ubuntu/omricraft"
VEL_TOML="$BASE/velocity/velocity.toml"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date)] Registering $SERVER_ID ($SLUG.omricraft.com → 127.0.0.1:$GAME_PORT)..."

if [ ! -f "$VEL_TOML" ]; then
  echo "[$(date)] ERROR: velocity.toml not found. Run install-velocity.sh first."
  exit 1
fi

# Check if already registered (idempotent)
if grep -q "^${SERVER_ID} = " "$VEL_TOML"; then
  echo "[$(date)] $SERVER_ID already registered in velocity.toml. Skipping."
else
  # Insert after [servers] section header
  sed -i "/^\[servers\]/a ${SERVER_ID} = \"127.0.0.1:${GAME_PORT}\"" "$VEL_TOML"
  echo "[$(date)] Added backend: $SERVER_ID = \"127.0.0.1:$GAME_PORT\""
fi

FORCED_HOST_LINE="\"${SLUG}.omricraft.com\" = [\"${SERVER_ID}\"]"

if grep -q "\"${SLUG}.omricraft.com\"" "$VEL_TOML"; then
  echo "[$(date)] Forced host ${SLUG}.omricraft.com already registered. Skipping."
else
  # Insert after [forced-hosts] section header
  sed -i "/^\[forced-hosts\]/a ${FORCED_HOST_LINE}" "$VEL_TOML"
  echo "[$(date)] Added forced host: $FORCED_HOST_LINE"
fi

echo "[$(date)] Reloading Velocity..."
bash "$SCRIPTS_DIR/reload-velocity.sh"

echo "[$(date)] Done. Players can now connect via ${SLUG}.omricraft.com"
