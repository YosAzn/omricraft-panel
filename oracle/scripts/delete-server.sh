#!/usr/bin/env bash
set -euo pipefail

# Usage: ./delete-server.sh SERVER_ID [MODE] [ADDONS_JSON]
#   MODE = soft (default) | permanent
#   ADDONS_JSON = JSON array of the server's installedAddons catalog ids (optional)
#
# soft (default): archive the server FIRST (reversible 30-day VPS backup via
#   archive-server.sh — must SUCCEED), THEN do the existing hard removal.
# permanent: skip the archive and do the current hard-delete behaviour.
# Backward-compatible: an old 1-arg call (no MODE) behaves as soft.
#
# ADDONS_JSON is passed THROUGH to archive-server.sh so the manifest records the
# authoritative catalog id list (installedAddons) for a faithful restore (D2). It
# is only used in soft mode; permanent skips the archive. Omitting it → [].

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID [soft|permanent] [ADDONS_JSON]"
  exit 1
fi

SERVER_ID="$1"
MODE="${2:-soft}"
ADDONS_JSON="${3:-[]}"

if [ "$MODE" != "soft" ] && [ "$MODE" != "permanent" ]; then
  echo "[$(date)] ERROR: invalid MODE '$MODE' (expected soft|permanent)." >&2
  exit 1
fi

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
VEL_TOML="$BASE/velocity/velocity.toml"
SERVERS_JSON="$BASE/manager/servers.json"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date)] Deleting server $SERVER_ID (mode=$MODE)..."

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

# SOFT DELETE: archive the (now-stopped) server BEFORE any destructive removal.
# The archive MUST succeed — if it fails we abort and leave the server intact,
# so a soft-delete can never silently lose data. Skipped in permanent mode.
if [ "$MODE" = "soft" ]; then
  if [ -d "$SERVER_DIR" ]; then
    echo "[$(date)] Soft delete: archiving $SERVER_ID before removal..."
    if ! bash "$SCRIPTS_DIR/archive-server.sh" "$SERVER_ID" "$ADDONS_JSON"; then
      echo "[$(date)] ERROR: archive failed for $SERVER_ID — ABORTING delete (server left intact)." >&2
      exit 1
    fi
  else
    echo "[$(date)] Soft delete: server dir missing, nothing to archive — continuing metadata cleanup."
  fi
else
  echo "[$(date)] Permanent delete: skipping archive."
fi

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
