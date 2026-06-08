#!/usr/bin/env bash
#
# create-profile-server.sh
# Responsibility: Create a new GlassProfile Server directory skeleton under
#   $GLASS_ROOT/servers/<SERVER_ID>/ : server.properties, eula.txt,
#   plugins/ mods/ logs/ . Does NOT start the server and does NOT mutate
#   the live OmriCraft system. Idempotency: refuses if the dir already exists.
#
# NOTE: Builds under an ISOLATED root ($GLASS_ROOT), NOT /home/ubuntu/omricraft
#       (which hosts the LIVE OmriCraft system). See DECISIONS.md sec.6.
#
# Usage:
#   create-profile-server.sh <SERVER_ID> <RUNTIME> <VERSION> <GAME_PORT> <RCON_PORT> <MEMORY_MB>
# Example:
#   create-profile-server.sh gps-001 paper 1.21.1 25566 25576 3072

set -euo pipefail

# --- single config variable: change after user confirms namespace ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

# --- args ---
SERVER_ID="${1:-}"
RUNTIME="${2:-}"
VERSION="${3:-}"
GAME_PORT="${4:-}"
RCON_PORT="${5:-}"
MEMORY_MB="${6:-}"

usage() {
  echo "Usage: $0 <SERVER_ID> <RUNTIME> <VERSION> <GAME_PORT> <RCON_PORT> <MEMORY_MB>" >&2
  exit 2
}

[ -n "$SERVER_ID" ] && [ -n "$RUNTIME" ] && [ -n "$VERSION" ] || usage
[ -n "$GAME_PORT" ] && [ -n "$RCON_PORT" ] && [ -n "$MEMORY_MB" ] || usage

# --- validate SERVER_ID: alnum + dash only, no path tricks ---
case "$SERVER_ID" in
  *..*|*/*|"") echo "ERROR: invalid SERVER_ID (no '..', no '/', not empty)" >&2; exit 1 ;;
esac
if ! printf '%s' "$SERVER_ID" | grep -Eq '^[a-zA-Z0-9_-]+$'; then
  echo "ERROR: SERVER_ID must match ^[a-zA-Z0-9_-]+$" >&2; exit 1
fi

# --- validate numeric args ---
for n in "$GAME_PORT" "$RCON_PORT" "$MEMORY_MB"; do
  printf '%s' "$n" | grep -Eq '^[0-9]+$' || { echo "ERROR: '$n' must be numeric" >&2; exit 1; }
done

# --- resolve + assert target stays under $GLASS_ROOT/servers/ ---
SERVERS_DIR="$GLASS_ROOT/servers"
TARGET_DIR="$SERVERS_DIR/$SERVER_ID"
case "$TARGET_DIR" in
  "$SERVERS_DIR"/*) : ;;
  *) echo "ERROR: refusing — target '$TARGET_DIR' escapes '$SERVERS_DIR/'" >&2; exit 1 ;;
esac

if [ -d "$TARGET_DIR" ]; then
  echo "ERROR: server dir already exists: $TARGET_DIR (refusing to overwrite)" >&2; exit 1
fi

# --- create skeleton ---
mkdir -p "$TARGET_DIR/plugins" "$TARGET_DIR/mods" "$TARGET_DIR/logs"

echo "eula=true" > "$TARGET_DIR/eula.txt"

cat > "$TARGET_DIR/server.properties" <<EOF
server-port=$GAME_PORT
enable-rcon=true
rcon.port=$RCON_PORT
rcon.password=CHANGE_ME
online-mode=true
level-name=world
motd=GlassProfile Server $SERVER_ID
EOF

# --- record intent metadata locally (Manager reconciles registry separately) ---
cat > "$TARGET_DIR/glassprofile-server.meta.json" <<EOF
{
  "id": "$SERVER_ID",
  "runtime": "$RUNTIME",
  "version": "$VERSION",
  "gamePort": $GAME_PORT,
  "rconPort": $RCON_PORT,
  "memoryMb": $MEMORY_MB,
  "createdBy": "create-profile-server.sh"
}
EOF

echo "OK: created GlassProfile Server skeleton at $TARGET_DIR"
echo "NOTE: copy an approved server.jar into $TARGET_DIR/ before start, and set a real rcon.password (currently CHANGE_ME)."

# --- one-line proof command ---
echo "TEST: test -f \"$TARGET_DIR/server.properties\" && echo created-ok"
