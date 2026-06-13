#!/bin/bash
# Daily backup of all Minecraft world data
BASE="/home/ubuntu/omricraft"
BACKUP_DIR="$BASE/backups"
DATE=$(date +%Y-%m-%d)

mkdir -p "$BACKUP_DIR"
echo "[$(date)] Starting daily world backup..."

for SERVER_DIR in "$BASE/servers"/*/; do
  SERVER_ID=$(basename "$SERVER_DIR")
  WORLD_DIR="$SERVER_DIR/world"

  if [ ! -d "$WORLD_DIR" ]; then
    echo "[$(date)] No world dir for $SERVER_ID, skipping"
    continue
  fi

  BACKUP_FILE="$BACKUP_DIR/${SERVER_ID}-${DATE}.tar.gz"

  if [ -f "$BACKUP_FILE" ]; then
    echo "[$(date)] Already backed up $SERVER_ID today, skipping"
    continue
  fi

  echo "[$(date)] Backing up $SERVER_ID world..."
  tar -czf "$BACKUP_FILE" -C "$SERVER_DIR" world world_nether world_the_end 2>/dev/null || \
    tar -czf "$BACKUP_FILE" -C "$SERVER_DIR" world 2>/dev/null

  SIZE=$(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1)
  echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"
done

echo "[$(date)] All backups done."
