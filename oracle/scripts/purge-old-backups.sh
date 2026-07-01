#!/usr/bin/env bash
set -euo pipefail

# Usage: ./purge-old-backups.sh
#
# Daily housekeeping for soft-delete archives created by archive-server.sh.
# Scans $BACKUP_DIR/*.manifest.json; for each manifest whose purgeAt < now
# (fallback: the manifest file's mtime is older than 30 days), deletes BOTH the
# archive tarball AND the manifest. Idempotent + safe: it ONLY touches files
# inside $BACKUP_DIR, and only ones that have a manifest. Manual world backups
# (<id>-manual-*.tar.gz, which have NO manifest) are never touched.

BASE="/home/ubuntu/omricraft"
BACKUP_DIR="$BASE/backups"
NOW=$(date +%s)
THIRTY_DAYS=2592000

REAL_BACKUP_DIR="$(realpath "$BACKUP_DIR" 2>/dev/null || echo "")"
if [ -z "$REAL_BACKUP_DIR" ] || [ ! -d "$REAL_BACKUP_DIR" ]; then
  echo "[$(date)] Backup dir not present ($BACKUP_DIR) — nothing to purge."
  exit 0
fi

shopt -s nullglob
MANIFESTS=("$BACKUP_DIR"/*.manifest.json)
if [ "${#MANIFESTS[@]}" -eq 0 ]; then
  echo "[$(date)] No archive manifests in $BACKUP_DIR — nothing to purge."
  exit 0
fi

purged=0
kept=0
for MANIFEST in "${MANIFESTS[@]}"; do
  [ -f "$MANIFEST" ] || continue

  # Safety: the manifest must resolve to inside the backups dir.
  REAL_MANIFEST="$(realpath "$MANIFEST" 2>/dev/null || echo "")"
  if [ -z "$REAL_MANIFEST" ] || [[ "$REAL_MANIFEST" != "$REAL_BACKUP_DIR/"* ]]; then
    echo "[$(date)] SKIP (outside backups dir): $MANIFEST" >&2
    continue
  fi

  # Read purgeAt (numeric). Fallback to file mtime + 30d if missing/unparseable.
  PURGE_AT=""
  if command -v node &>/dev/null; then
    PURGE_AT=$(node -e "
      const fs=require('fs');
      try { const m=JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
            const v=Number(m.purgeAt);
            process.stdout.write(Number.isFinite(v)?String(Math.trunc(v)):''); }
      catch(e){ process.stdout.write(''); }
    " 2>/dev/null || echo "")
  fi
  if ! [[ "$PURGE_AT" =~ ^[0-9]+$ ]]; then
    MTIME=$(stat -c '%Y' "$MANIFEST" 2>/dev/null || echo "$NOW")
    PURGE_AT=$((MTIME + THIRTY_DAYS))
    echo "[$(date)] $MANIFEST: no valid purgeAt, using mtime+30d ($PURGE_AT)."
  fi

  if [ "$PURGE_AT" -ge "$NOW" ]; then
    kept=$((kept + 1))
    continue
  fi

  # Expired — remove the matching tarball (manifest basename minus .manifest.json + .tar.gz).
  BASENAME="$(basename "$MANIFEST")"
  STEM="${BASENAME%.manifest.json}"
  TARBALL="$BACKUP_DIR/${STEM}.tar.gz"

  # Prefer archiveFile from the manifest if present (authoritative name), still path-checked.
  if command -v node &>/dev/null; then
    AF=$(node -e "
      const fs=require('fs');
      try { const m=JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
            const f=String(m.archiveFile||'');
            if(f && !f.includes('/') && !f.includes('..')) process.stdout.write(f); }
      catch(e){}
    " 2>/dev/null || echo "")
    if [ -n "$AF" ]; then
      TARBALL="$BACKUP_DIR/$AF"
    fi
  fi

  REAL_TARBALL="$(realpath "$TARBALL" 2>/dev/null || echo "")"
  if [ -n "$REAL_TARBALL" ] && [[ "$REAL_TARBALL" == "$REAL_BACKUP_DIR/"* ]] && [ -f "$TARBALL" ]; then
    rm -f "$TARBALL"
    echo "[$(date)] Purged tarball: $TARBALL (purgeAt=$PURGE_AT < now=$NOW)"
  else
    echo "[$(date)] Tarball not found for expired manifest (already gone?): $TARBALL"
  fi

  rm -f "$MANIFEST"
  echo "[$(date)] Purged manifest: $MANIFEST"
  purged=$((purged + 1))
done

echo "[$(date)] Purge done. Purged $purged archive(s), kept $kept."
