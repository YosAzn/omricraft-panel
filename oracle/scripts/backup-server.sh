#!/usr/bin/env bash
set -euo pipefail

# Usage: ./backup-server.sh SERVER_ID
# Creates a MANUAL backup tarball of the server's world dirs.
# Tarballs: $BACKUP_DIR/<serverId>-manual-<timestamp>.tar.gz
# Fail-loud: NO `2>/dev/null`. Real exit codes. 0-byte tar -> delete + exit 1.
# Output: prints "OK <path> <bytes>" on success.

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID" >&2
  exit 1
fi

SERVER_ID="$1"

BASE="/home/ubuntu/omricraft"
SERVER_DIR="$BASE/servers/$SERVER_ID"
BACKUP_DIR="$BASE/backups"

if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] Server dir not found: $SERVER_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Collect which world dirs actually exist (nether/end may be absent — do NOT fail).
WORLDS=()
for w in world world_nether world_the_end; do
  if [ -d "$SERVER_DIR/$w" ]; then
    WORLDS+=("$w")
  fi
done

if [ "${#WORLDS[@]}" -eq 0 ]; then
  echo "[$(date)] No world dirs (world/world_nether/world_the_end) found under $SERVER_DIR" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${SERVER_ID}-manual-${TS}.tar.gz"

echo "[$(date)] Backing up $SERVER_ID worlds: ${WORLDS[*]}"
# Fail-loud: no 2>/dev/null. If tar fails, set -e aborts with tar's real exit code.
tar -czf "$BACKUP_FILE" -C "$SERVER_DIR" "${WORLDS[@]}"

# Guard against a 0-byte / empty tarball.
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date)] Backup file is empty: $BACKUP_FILE — deleting and failing." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE_BYTES=$(stat -c '%s' "$BACKUP_FILE")
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE_BYTES bytes)"
echo "OK $BACKUP_FILE $SIZE_BYTES"
