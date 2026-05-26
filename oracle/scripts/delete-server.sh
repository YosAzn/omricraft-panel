#!/usr/bin/env bash
set -euo pipefail

# Usage: ./delete-server.sh SERVER_ID

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID"
  exit 1
fi

SERVER_ID="$1"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
VEL_TOML="$BASE/velocity/velocity.toml"
SERVERS_JSON="$BASE/manager/servers.json"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date)] Deleting server $SERVER_ID..."

# === SAFETY CHECKS ===

# 1. Validate SERVER_ID format
if ! echo "$SERVER_ID" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SERVER_ID '$SERVER_ID' has invalid characters."
  exit 1
fi

# 2. Refuse to delete if SERVER_ID is empty or too short
if [ ${#SERVER_ID} -lt 3 ]; then
  echo "[$(date)] ERROR: SERVER_ID too short. Refusing deletion."
  exit 1
fi

# 3. Resolve absolute path and verify it's inside SERVERS_DIR
REAL_SERVER_DIR="$(realpath "$SERVER_DIR" 2>/dev/null || echo "$SERVER_DIR")"
REAL_SERVERS_DIR="$(realpath "$SERVERS_DIR")"

if [[ "$REAL_SERVER_DIR" != "$REAL_SERVERS_DIR/"* ]]; then
  echo "[$(date)] ERROR: Resolved path '$REAL_SERVER_DIR' is outside '$REAL_SERVERS_DIR'. Aborting."
  exit 1
fi

# 4. Check directory exists
if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] WARNING: Server directory not found: $SERVER_DIR"
  echo "[$(date)] Continuing to clean up metadata..."
fi

# Stop the server if running
echo "[$(date)] Stopping server $SERVER_ID if running..."
bash "$SCRIPTS_DIR/stop-server.sh" "$SERVER_ID" 2>/dev/null || true

# Remove from velocity.toml
if [ -f "$VEL_TOML" ]; then
  echo "[$(date)] Removing $SERVER_ID from velocity.toml..."
  # Get the slug from servers.json for forced-host removal
  SLUG=""
  if [ -f "$SERVERS_JSON" ] && command -v node &>/dev/null; then
    SLUG=$(node -e "
      const arr = JSON.parse(require('fs').readFileSync('$SERVERS_JSON','utf8'));
      const s = arr.find(x => x.id === '$SERVER_ID');
      process.stdout.write(s ? s.slug : '');
    " 2>/dev/null || echo "")
  fi

  # Remove backend server line
  sed -i "/^${SERVER_ID} = /d" "$VEL_TOML"

  # Remove forced host line if slug found
  if [ -n "$SLUG" ]; then
    sed -i "/\"${SLUG}\.omricraft\.com\"/d" "$VEL_TOML"
    echo "[$(date)] Removed forced host: ${SLUG}.omricraft.com"
  fi

  echo "[$(date)] Removed $SERVER_ID from velocity.toml"
fi

# Reload Velocity
echo "[$(date)] Reloading Velocity..."
bash "$SCRIPTS_DIR/reload-velocity.sh" 2>/dev/null || echo "[$(date)] WARNING: Velocity reload failed, may not be running."

# Remove from servers.json
if [ -f "$SERVERS_JSON" ] && command -v node &>/dev/null; then
  TMP_JSON="$SERVERS_JSON.tmp.$$"
  node -e "
    const fs = require('fs');
    const arr = JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    const filtered = arr.filter(s => s.id !== '$SERVER_ID');
    fs.writeFileSync('$TMP_JSON', JSON.stringify(filtered, null, 2));
  " && mv "$TMP_JSON" "$SERVERS_JSON"
  echo "[$(date)] Removed $SERVER_ID from servers.json"
fi

# Delete server directory
if [ -d "$SERVER_DIR" ]; then
  echo "[$(date)] Deleting $SERVER_DIR..."
  rm -rf "$SERVER_DIR"
  echo "[$(date)] Directory deleted."
fi

echo "[$(date)] Server $SERVER_ID deleted successfully."
