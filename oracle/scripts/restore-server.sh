#!/usr/bin/env bash
set -euo pipefail

# restore-server.sh — RESTORE a soft-deleted server from its 30-day archive (D2).
#
# Usage: ./restore-server.sh SERVER_ID [ARCHIVE_BASENAME]
#   SERVER_ID        the original server id (must match the archive prefix).
#   ARCHIVE_BASENAME (optional) e.g. "server-1699999999999-1700000000.tar.gz".
#                    When omitted, the NEWEST "<SERVER_ID>-*.tar.gz" archive that has
#                    a sidecar manifest is used.
#
# What it does (fail-loud at every step):
#   1. Refuse if a server with this id already exists (dir OR servers.json entry) —
#      restore never clobbers a live server.
#   2. Recreate SERVERS_DIR/<id>/ and EXTRACT the tarball into it (world + configs +
#      plugins come back; mods/ + server.jar were EXCLUDED from the archive).
#   3. Re-download server.jar for the manifest's type+version via download-server-jar.sh
#      (single source of truth). Re-apply Velocity modern-forwarding config so the
#      restored server is joinable (FabricProxy-Lite mod for fabric; paper-global.yml
#      for Bukkit families — the mods/ dir and that mod were not in the archive).
#   4. Allocate a FREE game+rcon port that does NOT collide with any server in
#      servers.json (same scheme as createServerInternal: game>=25566, rcon=game+10000),
#      write server.properties' server-port/rcon.port to the allocated values (new
#      random rcon password), and re-register in servers.json + velocity.toml.
#   5. Reload Velocity.
#
# The backup is NOT deleted on restore (kept until purge / permanent delete).
#
# Prints "OK restored <SERVER_ID> port <GAME_PORT> rcon <RCON_PORT>" on success.

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID [ARCHIVE_BASENAME]" >&2
  exit 1
fi

SERVER_ID="$1"
ARCHIVE_ARG="${2:-}"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
BACKUP_DIR="$BASE/backups"
SERVERS_JSON="$BASE/manager/servers.json"
VEL_TOML="$BASE/velocity/velocity.toml"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Safety: validate SERVER_ID (same rules as archive/delete) ---
if ! echo "$SERVER_ID" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: SERVER_ID '$SERVER_ID' has invalid characters." >&2
  exit 1
fi
if [ ${#SERVER_ID} -lt 3 ]; then
  echo "[$(date)] ERROR: SERVER_ID too short. Refusing restore." >&2
  exit 1
fi

# --- Refuse to clobber an existing server (dir OR servers.json entry) ---
if [ -d "$SERVER_DIR" ]; then
  echo "[$(date)] ERROR: server dir already exists: $SERVER_DIR — refusing to overwrite a live server." >&2
  exit 1
fi
if [ -f "$SERVERS_JSON" ] && command -v node &>/dev/null; then
  EXISTS=$(node -e "
    const fs=require('fs');
    let arr=JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    if(!Array.isArray(arr)) arr=arr.servers||[];
    process.stdout.write(arr.some(function(s){return s&&s.id==='$SERVER_ID';})?'1':'');
  " 2>/dev/null || echo "")
  if [ -n "$EXISTS" ]; then
    echo "[$(date)] ERROR: server id '$SERVER_ID' still present in servers.json — refusing to overwrite." >&2
    exit 1
  fi
fi

# --- Resolve the archive + manifest ---
if [ -n "$ARCHIVE_ARG" ]; then
  # Path-safety: plain basename only, must start with "<SERVER_ID>-", end in .tar.gz.
  case "$ARCHIVE_ARG" in
    */*|*..*) echo "[$(date)] ERROR: ARCHIVE_BASENAME must be a plain filename: $ARCHIVE_ARG" >&2; exit 1 ;;
  esac
  case "$ARCHIVE_ARG" in
    "${SERVER_ID}-"*.tar.gz) : ;;
    *) echo "[$(date)] ERROR: ARCHIVE_BASENAME must start with '${SERVER_ID}-' and end with .tar.gz: $ARCHIVE_ARG" >&2; exit 1 ;;
  esac
  ARCHIVE_FILE="$ARCHIVE_ARG"
else
  # Newest archive for this id (by mtime) that also has a manifest sidecar.
  ARCHIVE_FILE=""
  while IFS= read -r cand; do
    [ -n "$cand" ] || continue
    b="$(basename "$cand")"
    if [ -f "$BACKUP_DIR/${b%.tar.gz}.manifest.json" ]; then
      ARCHIVE_FILE="$b"
      break
    fi
  done < <(ls -1t "$BACKUP_DIR/${SERVER_ID}-"*.tar.gz 2>/dev/null || true)
  if [ -z "$ARCHIVE_FILE" ]; then
    echo "[$(date)] ERROR: no archive with a manifest found for '$SERVER_ID' under $BACKUP_DIR." >&2
    exit 1
  fi
fi

TARBALL="$BACKUP_DIR/$ARCHIVE_FILE"
MANIFEST="$BACKUP_DIR/${ARCHIVE_FILE%.tar.gz}.manifest.json"

# Resolve real paths + confirm the tarball is strictly inside BACKUP_DIR.
REAL_BACKUP_DIR="$(readlink -f "$BACKUP_DIR")"
REAL_TARBALL="$(readlink -f "$TARBALL" 2>/dev/null || echo "$TARBALL")"
case "$REAL_TARBALL" in
  "$REAL_BACKUP_DIR"/*) : ;;
  *) echo "[$(date)] ERROR: resolved archive path escapes BACKUP_DIR: $REAL_TARBALL" >&2; exit 1 ;;
esac
if [ ! -s "$TARBALL" ]; then
  echo "[$(date)] ERROR: archive not found or empty: $TARBALL" >&2
  exit 1
fi
if [ ! -f "$MANIFEST" ]; then
  echo "[$(date)] ERROR: manifest not found: $MANIFEST" >&2
  exit 1
fi

# --- Read type/version/slug/name from the manifest (via node for correct JSON) ---
read_manifest() {
  node -e "
    const fs=require('fs');
    let m={};
    try { m=JSON.parse(fs.readFileSync('$MANIFEST','utf8'))||{}; } catch(e){ m={}; }
    process.stdout.write(String(m['$1']||''));
  " 2>/dev/null || echo ""
}
TYPE="$(read_manifest type)"
VERSION="$(read_manifest version)"
SLUG="$(read_manifest slug)"
NAME="$(read_manifest name)"

[ -z "$TYPE" ]    && TYPE="paper"
[ -z "$VERSION" ] && { echo "[$(date)] ERROR: manifest has no version — cannot re-download server.jar." >&2; exit 1; }
[ -z "$SLUG" ]    && SLUG="$SERVER_ID"
[ -z "$NAME" ]    && NAME="$SLUG"

if ! echo "$SLUG" | grep -qE '^[a-z0-9_-]+$'; then
  echo "[$(date)] ERROR: manifest slug '$SLUG' has invalid characters." >&2
  exit 1
fi

echo "[$(date)] Restoring $SERVER_ID from $ARCHIVE_FILE (type=$TYPE version=$VERSION slug=$SLUG)"

# --- Recreate the server dir + extract the archive ---
mkdir -p "$SERVER_DIR/logs" "$SERVER_DIR/plugins" "$SERVER_DIR/mods" "$SERVER_DIR/config"
echo "[$(date)] Extracting $TARBALL into $SERVER_DIR ..."
if ! tar -xzf "$TARBALL" -C "$SERVER_DIR"; then
  echo "[$(date)] ERROR: extraction failed — cleaning up partial dir." >&2
  rm -rf "$SERVER_DIR"
  exit 1
fi

echo "eula=true" > "$SERVER_DIR/eula.txt"

# --- Re-download the server.jar (single source of truth) ---
if ! bash "$SCRIPTS_DIR/download-server-jar.sh" "$SERVER_DIR" "$TYPE" "$VERSION"; then
  echo "[$(date)] ERROR: server.jar download failed for $TYPE $VERSION — cleaning up." >&2
  rm -rf "$SERVER_DIR"
  exit 1
fi

# --- Re-apply Velocity modern-forwarding config (joinability) ---
# The tarball carries config/paper-global.yml for Bukkit families, but for fabric the
# FabricProxy-Lite mod lives in mods/ (EXCLUDED from the archive), so it MUST be
# reinstalled. Calling this for every family keeps the server born-correct + joinable.
if ! bash "$SCRIPTS_DIR/apply-forwarding-config.sh" "$SERVER_DIR" "$TYPE" "$VERSION"; then
  echo "[$(date)] ERROR: forwarding-config failed for $TYPE $VERSION — restored server would be unjoinable; cleaning up." >&2
  rm -rf "$SERVER_DIR"
  exit 1
fi

# --- Allocate a FREE game+rcon port that does NOT collide with any live server ---
# Same scheme as createServerInternal (functions/index.js): game>=25566, rcon=game+10000,
# and the pair must avoid every gamePort AND rconPort already in servers.json.
ALLOC=$(node -e "
  const fs=require('fs');
  let arr=[];
  try { arr=JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8')); if(!Array.isArray(arr)) arr=arr.servers||[]; } catch(e){ arr=[]; }
  const used=new Set();
  arr.forEach(function(s){ if(s&&s.gamePort) used.add(s.gamePort); if(s&&s.rconPort) used.add(s.rconPort); });
  let g=25566;
  while(used.has(g)||used.has(g+10000)) g++;
  process.stdout.write(g+' '+(g+10000));
" 2>/dev/null || echo "")
GAME_PORT="${ALLOC%% *}"
RCON_PORT="${ALLOC##* }"
if ! echo "$GAME_PORT" | grep -qE '^[0-9]+$' || ! echo "$RCON_PORT" | grep -qE '^[0-9]+$'; then
  echo "[$(date)] ERROR: could not allocate free ports (got '$ALLOC') — cleaning up." >&2
  rm -rf "$SERVER_DIR"
  exit 1
fi
echo "[$(date)] Allocated game port $GAME_PORT, rcon port $RCON_PORT"

# --- Rewrite server-port / rcon.port in the restored server.properties, with a fresh
# random rcon password. The archived server.properties has the OLD (possibly colliding)
# ports; the restored server MUST use the freshly allocated ports. ---
PROPS="$SERVER_DIR/server.properties"
RCON_PASS=$(cat /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 16 || true)
[ -z "$RCON_PASS" ] && RCON_PASS=$(openssl rand -hex 8)

if [ -f "$PROPS" ]; then
  # Update in place (or append if missing). server-ip pinned to loopback like create.
  set_prop() {  # $1=key $2=value
    if grep -qE "^$1=" "$PROPS"; then
      sed -i "s|^$1=.*|$1=$2|" "$PROPS"
    else
      printf '%s=%s\n' "$1" "$2" >> "$PROPS"
    fi
  }
  set_prop server-port "$GAME_PORT"
  set_prop server-ip 127.0.0.1
  set_prop enable-rcon true
  set_prop rcon.port "$RCON_PORT"
  set_prop rcon.password "$RCON_PASS"
  set_prop online-mode false
else
  # No archived properties (unusual) — write a minimal born-correct file.
  cat > "$PROPS" <<PROPS_EOF
server-port=${GAME_PORT}
server-ip=127.0.0.1
enable-rcon=true
rcon.port=${RCON_PORT}
rcon.password=${RCON_PASS}
online-mode=false
enforce-secure-profile=false
level-name=world
motd=${NAME}
PROPS_EOF
fi
# server.properties holds the RCON password — owner-only.
chmod 600 "$PROPS"

# --- Re-register in servers.json (atomic) ---
NEW_ENTRY=$(cat <<ENTRY
{
  "id": "${SERVER_ID}",
  "displayName": "${NAME}",
  "slug": "${SLUG}",
  "type": "${TYPE}",
  "version": "${VERSION}",
  "gamePort": ${GAME_PORT},
  "rconPort": ${RCON_PORT},
  "memoryMb": 2048,
  "path": "${SERVER_DIR}",
  "publicHost": "${SLUG}.omricraft.com",
  "address": "${SLUG}.omricraft.com",
  "backendAddress": "127.0.0.1:${GAME_PORT}",
  "status": "stopped"
}
ENTRY
)

mkdir -p "$(dirname "$SERVERS_JSON")"
TMP_JSON="$SERVERS_JSON.tmp.$$"
if [ -f "$SERVERS_JSON" ]; then
  node -e "
    const fs=require('fs');
    let arr=JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    if(!Array.isArray(arr)) arr=arr.servers||[];
    arr.push($NEW_ENTRY);
    fs.writeFileSync('$TMP_JSON', JSON.stringify(arr, null, 2));
  " && mv "$TMP_JSON" "$SERVERS_JSON"
else
  echo "[$NEW_ENTRY]" > "$SERVERS_JSON"
fi
echo "[$(date)] Re-registered $SERVER_ID in servers.json"

# --- Re-register in velocity.toml (backend line + forced-host by slug) + reload ---
if ! bash "$SCRIPTS_DIR/register-server-in-velocity.sh" "$SERVER_ID" "$SLUG" "$GAME_PORT"; then
  echo "[$(date)] WARNING: velocity registration/reload reported a problem for $SERVER_ID." >&2
fi

echo "[$(date)] Restore complete: $SERVER_ID at $SERVER_DIR (backup kept: $ARCHIVE_FILE)"
echo "OK restored $SERVER_ID port $GAME_PORT rcon $RCON_PORT"
