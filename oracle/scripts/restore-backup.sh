#!/usr/bin/env bash
set -euo pipefail

# Usage: ./restore-backup.sh SERVER_ID FILE_NAME
# DESTRUCTIVE: replaces the server's current world dirs with the contents of a backup.
# Safety:
#   - FILE_NAME must start with "<SERVER_ID>-", contain no "/" and no "..".
#   - Resolved path must live directly under $BACKUP_DIR.
#   - Stops the server first (cannot swap world on a live server) and VERIFIES it stopped.
#   - Takes a pre-restore safety backup of the CURRENT worlds before deleting them.
#   - Does NOT auto-start the server. Caller decides when to (re)start.
# Output: prints "OK restored <file>; prerestore <file>" on success.

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 SERVER_ID FILE_NAME" >&2
  exit 1
fi

SERVER_ID="$1"
FILE_NAME="$2"

BASE="/home/ubuntu/omricraft"
SERVER_DIR="$BASE/servers/$SERVER_ID"
BACKUP_DIR="$BASE/backups"
SCRIPTS_DIR="$BASE/manager/scripts"

if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] Server dir not found: $SERVER_DIR" >&2
  exit 1
fi

# --- fileName validation (path-traversal guard) ---
case "$FILE_NAME" in
  */*)   echo "[$(date)] fileName must not contain '/': $FILE_NAME" >&2; exit 1 ;;
  *..*)  echo "[$(date)] fileName must not contain '..': $FILE_NAME" >&2; exit 1 ;;
esac
case "$FILE_NAME" in
  "${SERVER_ID}-"*) : ;;
  *) echo "[$(date)] fileName must start with '${SERVER_ID}-': $FILE_NAME" >&2; exit 1 ;;
esac

BACKUP_FILE="$BACKUP_DIR/$FILE_NAME"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[$(date)] Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

# Resolve and confirm the real path is under BACKUP_DIR (defense in depth).
REAL_BACKUP_DIR=$(readlink -f "$BACKUP_DIR")
REAL_FILE=$(readlink -f "$BACKUP_FILE")
case "$REAL_FILE" in
  "$REAL_BACKUP_DIR"/*) : ;;
  *) echo "[$(date)] Resolved path escapes BACKUP_DIR: $REAL_FILE" >&2; exit 1 ;;
esac

# --- stop the server (mandatory) and verify it actually stopped ---
echo "[$(date)] Stopping server $SERVER_ID before restore..."
bash "$SCRIPTS_DIR/stop-server.sh" "$SERVER_ID"

# Verify the game port is no longer listening (consistent with /server-status logic).
PROPS="$SERVER_DIR/server.properties"
GAME_PORT=""
if [ -f "$PROPS" ]; then
  GAME_PORT=$(grep -E '^server-port=' "$PROPS" | head -n1 | cut -d= -f2 | tr -d '[:space:]' || true)
fi
if [ -n "$GAME_PORT" ]; then
  for i in $(seq 1 15); do
    if ss -ltn "sport = :$GAME_PORT" | grep -q LISTEN; then
      sleep 1
    else
      break
    fi
  done
  if ss -ltn "sport = :$GAME_PORT" | grep -q LISTEN; then
    echo "[$(date)] Server $SERVER_ID still listening on port $GAME_PORT after stop — aborting restore." >&2
    exit 1
  fi
fi
echo "[$(date)] Server $SERVER_ID confirmed stopped."

# --- pre-restore safety backup of CURRENT worlds ---
CURRENT_WORLDS=()
for w in world world_nether world_the_end; do
  if [ -d "$SERVER_DIR/$w" ]; then
    CURRENT_WORLDS+=("$w")
  fi
done

TS=$(date +%Y%m%d-%H%M%S)
PRERESTORE_FILE="$BACKUP_DIR/${SERVER_ID}-prerestore-${TS}.tar.gz"

if [ "${#CURRENT_WORLDS[@]}" -gt 0 ]; then
  echo "[$(date)] Pre-restore backup of current worlds: ${CURRENT_WORLDS[*]}"
  tar -czf "$PRERESTORE_FILE" -C "$SERVER_DIR" "${CURRENT_WORLDS[@]}"
  if [ ! -s "$PRERESTORE_FILE" ]; then
    echo "[$(date)] Pre-restore backup is empty — aborting before destructive step." >&2
    rm -f "$PRERESTORE_FILE"
    exit 1
  fi
  echo "[$(date)] Pre-restore backup created: $PRERESTORE_FILE"
else
  echo "[$(date)] No current world dirs to pre-back-up (fresh restore)."
  PRERESTORE_FILE="(none)"
fi

# --- destructive: move current worlds aside, then extract backup ---
STAGE="$SERVER_DIR/.restore-old-${TS}"
mkdir -p "$STAGE"
for w in "${CURRENT_WORLDS[@]}"; do
  mv "$SERVER_DIR/$w" "$STAGE/$w"
done

echo "[$(date)] Extracting backup into $SERVER_DIR ..."
if tar -xzf "$BACKUP_FILE" -C "$SERVER_DIR"; then
  # Success: drop the staged old worlds (we already have prerestore tarball).
  rm -rf "$STAGE"
  echo "[$(date)] Restore complete from $FILE_NAME"
  echo "OK restored $FILE_NAME; prerestore $(basename "$PRERESTORE_FILE")"
else
  # Extraction failed: roll back the move so we don't leave the server world-less.
  echo "[$(date)] Extraction FAILED — rolling back to previous worlds." >&2
  for w in "${CURRENT_WORLDS[@]}"; do
    rm -rf "${SERVER_DIR:?}/$w"
    if [ -d "$STAGE/$w" ]; then
      mv "$STAGE/$w" "$SERVER_DIR/$w"
    fi
  done
  rm -rf "$STAGE"
  echo "[$(date)] Rolled back. Server worlds restored to pre-restore state." >&2
  exit 1
fi
