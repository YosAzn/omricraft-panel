#!/bin/bash
# Runs daily — trims logs and removes old backups
LOG_DIR_MAX_LINES=5000
BACKUP_KEEP_DAYS=7
BASE="/home/ubuntu/omricraft"

echo "[$(date)] Starting disk cleanup..."

for SERVER_DIR in "$BASE/servers"/*/; do
  LOG_FILE="$SERVER_DIR/logs/console.log"
  if [ -f "$LOG_FILE" ]; then
    LINES=$(wc -l < "$LOG_FILE")
    if [ "$LINES" -gt "$LOG_DIR_MAX_LINES" ]; then
      tail -n "$LOG_DIR_MAX_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
      echo "[$(date)] Trimmed $LOG_FILE ($LINES -> $LOG_DIR_MAX_LINES lines)"
    fi
  fi
done

if [ -d "$BASE/backups" ]; then
  find "$BASE/backups" -name "*.tar.gz" -mtime +$BACKUP_KEEP_DAYS -delete
  echo "[$(date)] Removed backups older than $BACKUP_KEEP_DAYS days"
fi

df -h /home/ubuntu | tail -1 | awk '{print "[cleanup] Disk: " $3 " used of " $2 " (" $5 " full)"}'
