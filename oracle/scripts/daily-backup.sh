#!/bin/bash
# OmriCraft daily backup (run by cron at 03:00; see crontab).
# Active path on VPS: /home/ubuntu/omricraft/scripts/daily-backup.sh
# Backs up every server's world dirs (world + nether + end when present).
# fail-loud: NO `2>/dev/null` — errors surface in the cron log (backup.log).
SERVERS_DIR="/home/ubuntu/omricraft/servers"
BACKUP_DIR="/home/ubuntu/omricraft/backups"
DATE=$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"
for dir in "$SERVERS_DIR"/*/; do
    sid=$(basename "$dir")
    if [ -d "$dir/world" ]; then
        # Include nether/end only when they exist, so tar does not error on absent dirs.
        WORLDS=(world)
        [ -d "$dir/world_nether" ]  && WORLDS+=(world_nether)
        [ -d "$dir/world_the_end" ] && WORLDS+=(world_the_end)
        tar -czf "$BACKUP_DIR/${sid}-world-${DATE}.tar.gz" -C "$dir" "${WORLDS[@]}"
        echo "$(date): backed up $sid (${WORLDS[*]})"
    fi
done
