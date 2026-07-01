#!/usr/bin/env bash
set -euo pipefail

# Usage: ./archive-server.sh SERVER_ID
#
# Creates a REVERSIBLE soft-delete archive of a server BEFORE it is hard-deleted.
# The archive lives on the VPS (NOT Firestore) to avoid the Oracle<->Firestore
# desync class of bugs. It captures ONLY the irreplaceable data + a manifest that
# lists the reproducible parts so they can be re-fetched on restore (D2).
#
# Output tarball:  $BACKUP_DIR/<serverId>-<epoch>.tar.gz
# Sidecar manifest: $BACKUP_DIR/<serverId>-<epoch>.manifest.json
#
# INCLUDED (irreplaceable): world*/ (incl. world/datapacks/), server.properties,
#   ops/whitelist/banned-* .json, *.yml (bukkit/spigot/paper), config/,
#   plugins/ (configs + data + the small plugin jars).
# EXCLUDED (heavy + re-downloadable): top-level server.jar, mods/ (mod jars),
#   libraries/, versions/, cache/, logs/, existing backups, disabled-*/.
#
# Fail-loud: NO `2>/dev/null` around tar. If tar fails, set -e aborts with tar's
# real exit code. A 0-byte / empty tarball is deleted and treated as a failure.
# Prints "OK <tarball> <bytes>" on success (mirrors backup-server.sh contract).

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID" >&2
  exit 1
fi

SERVER_ID="$1"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
BACKUP_DIR="$BASE/backups"
SERVERS_JSON="$BASE/manager/servers.json"

# --- Safety: validate SERVER_ID + confirm the dir is inside SERVERS_DIR ---
if ! echo "$SERVER_ID" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SERVER_ID '$SERVER_ID' has invalid characters." >&2
  exit 1
fi
if [ ${#SERVER_ID} -lt 3 ]; then
  echo "[$(date)] ERROR: SERVER_ID too short. Refusing archive." >&2
  exit 1
fi
if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] ERROR: Server dir not found: $SERVER_DIR" >&2
  exit 1
fi
REAL_SERVER_DIR="$(realpath "$SERVER_DIR")"
REAL_SERVERS_DIR="$(realpath "$SERVERS_DIR")"
if [[ "$REAL_SERVER_DIR" != "$REAL_SERVERS_DIR/"* ]]; then
  echo "[$(date)] ERROR: Resolved path '$REAL_SERVER_DIR' is outside '$REAL_SERVERS_DIR'. Aborting." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

EPOCH=$(date +%s)
PURGE_AT=$((EPOCH + 2592000))   # 30 days = 2,592,000 seconds
TARBALL="$BACKUP_DIR/${SERVER_ID}-${EPOCH}.tar.gz"
MANIFEST="$BACKUP_DIR/${SERVER_ID}-${EPOCH}.manifest.json"

# --- Build the list of paths to include (only those that actually exist) ---
INCLUDE=()

# Worlds (nether/end may be absent — do NOT fail). world/datapacks/ rides along
# inside world/ automatically.
for w in world world_nether world_the_end; do
  [ -d "$SERVER_DIR/$w" ] && INCLUDE+=("$w")
done

# Top-level irreplaceable config files.
for f in server.properties ops.json whitelist.json banned-players.json banned-ips.json; do
  [ -f "$SERVER_DIR/$f" ] && INCLUDE+=("$f")
done

# Bukkit/Spigot/Paper *.yml at the top level (bukkit.yml, spigot.yml, paper*.yml,
# permissions.yml, commands.yml, help.yml, ...). Collected relative to SERVER_DIR.
while IFS= read -r y; do
  INCLUDE+=("$y")
done < <(cd "$SERVER_DIR" && find . -maxdepth 1 -type f -name '*.yml' -printf '%P\n' 2>/dev/null | sort)

# config/ (loader + plugin/mod config trees).
[ -d "$SERVER_DIR/config" ] && INCLUDE+=("config")

# plugins/ — configs + data + the (small) plugin jars. Kept whole so restore is
# faithful; plugin jars are small unlike mods/libraries.
[ -d "$SERVER_DIR/plugins" ] && INCLUDE+=("plugins")

if [ "${#INCLUDE[@]}" -eq 0 ]; then
  echo "[$(date)] ERROR: nothing to archive under $SERVER_DIR (no world/config/props)." >&2
  exit 1
fi

# Display metadata (name/slug/type/version) is pulled from servers.json directly
# inside the manifest-writing node script below — no fragile shell round-trip.

echo "[$(date)] Archiving $SERVER_ID -> $TARBALL"
echo "[$(date)] Including: ${INCLUDE[*]}"

# --- Create the tarball. Fail-loud (no 2>/dev/null). Exclude re-downloadable
# heavy parts that might live INSIDE an included dir (defence in depth; the
# top-level mods/libraries/versions/cache/logs are simply never added above). ---
tar -czf "$TARBALL" \
  --exclude='./mods' \
  --exclude='./libraries' \
  --exclude='./versions' \
  --exclude='./cache' \
  --exclude='./logs' \
  --exclude='./server.jar' \
  -C "$SERVER_DIR" "${INCLUDE[@]}"

if [ ! -s "$TARBALL" ]; then
  echo "[$(date)] ERROR: archive is empty: $TARBALL — deleting and failing." >&2
  rm -f "$TARBALL"
  exit 1
fi

SIZE_BYTES=$(stat -c '%s' "$TARBALL")

# --- Manifest: display metadata (from servers.json) + names of the mod jars &
# plugin jars so restore can re-fetch mods and know which plugins were present.
# Written via node for correct JSON escaping; node also reads servers.json itself
# (no fragile shell round-trip). loader is derived from type. ---
MODS_DIR="$SERVER_DIR/mods"
PLUGINS_DIR="$SERVER_DIR/plugins"
node -e "
  const fs=require('fs');
  function jars(dir){
    try { return fs.readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.jar')); }
    catch(e){ return []; }
  }
  let meta={};
  try {
    let arr=JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    if(!Array.isArray(arr)) arr=arr.servers||[];
    meta=arr.find(x=>x&&x.id==='$SERVER_ID')||{};
  } catch(e){ meta={}; }
  const type = meta.type || '';
  const manifest={
    serverId: '$SERVER_ID',
    name: meta.name || meta.displayName || '',
    slug: meta.slug || '',
    type: type,
    version: meta.version || '',
    loader: type,
    deletedAt: $EPOCH,
    purgeAt: $PURGE_AT,
    mods: jars('$MODS_DIR'),
    plugins: jars('$PLUGINS_DIR'),
    sizeBytes: $SIZE_BYTES,
    archiveFile: '${SERVER_ID}-${EPOCH}.tar.gz'
  };
  fs.writeFileSync('$MANIFEST', JSON.stringify(manifest, null, 2));
"

if [ ! -s "$MANIFEST" ]; then
  echo "[$(date)] ERROR: manifest not written: $MANIFEST — removing tarball and failing." >&2
  rm -f "$TARBALL"
  exit 1
fi

echo "[$(date)] Archive complete: $TARBALL ($SIZE_BYTES bytes), manifest: $MANIFEST"
echo "OK $TARBALL $SIZE_BYTES"
