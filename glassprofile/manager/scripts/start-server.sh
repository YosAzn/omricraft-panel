#!/usr/bin/env bash
#
# start-server.sh
# Responsibility: Start a GlassProfile Server Java process as an independent
#   process, write logs/console.log and server.pid. REFUSES to start if a live
#   PID already exists (no double-start). Never touches other servers.
#
# NOTE: Operates only under $GLASS_ROOT/servers/<SERVER_ID>/. Does NOT touch the
#       live OmriCraft system. See DECISIONS.md sec.6.
#
# Usage:
#   start-server.sh <SERVER_ID> [MEMORY_MB]
# Example:
#   start-server.sh gps-001 3072

set -euo pipefail

# --- single config variable ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

SERVER_ID="${1:-}"
MEMORY_MB="${2:-2048}"

[ -n "$SERVER_ID" ] || { echo "Usage: $0 <SERVER_ID> [MEMORY_MB]" >&2; exit 2; }

# --- validate SERVER_ID ---
case "$SERVER_ID" in
  *..*|*/*|"") echo "ERROR: invalid SERVER_ID" >&2; exit 1 ;;
esac
printf '%s' "$SERVER_ID" | grep -Eq '^[a-zA-Z0-9_-]+$' || { echo "ERROR: bad SERVER_ID" >&2; exit 1; }
printf '%s' "$MEMORY_MB" | grep -Eq '^[0-9]+$' || { echo "ERROR: MEMORY_MB must be numeric" >&2; exit 1; }

SERVERS_DIR="$GLASS_ROOT/servers"
TARGET_DIR="$SERVERS_DIR/$SERVER_ID"
case "$TARGET_DIR" in
  "$SERVERS_DIR"/*) : ;;
  *) echo "ERROR: refusing — '$TARGET_DIR' escapes '$SERVERS_DIR/'" >&2; exit 1 ;;
esac

[ -d "$TARGET_DIR" ] || { echo "ERROR: no such server dir: $TARGET_DIR" >&2; exit 1; }
[ -f "$TARGET_DIR/server.jar" ] || { echo "ERROR: missing server.jar in $TARGET_DIR" >&2; exit 1; }

PID_FILE="$TARGET_DIR/server.pid"

# --- refuse double-start: only if PID is actually alive ---
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "ERROR: server $SERVER_ID already running (pid $OLD_PID)" >&2; exit 1
  fi
  echo "INFO: stale pid file found (pid '$OLD_PID' not alive) — clearing."
  rm -f "$PID_FILE"
fi

XMX="${MEMORY_MB}M"

# --- start detached; record our own pid file ---
(
  cd "$TARGET_DIR"
  nohup java -Xms1G "-Xmx${XMX}" -jar server.jar nogui >> "logs/console.log" 2>&1 &
  echo $! > "server.pid"
)

NEW_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
echo "OK: started $SERVER_ID (pid ${NEW_PID:-unknown}, Xmx ${XMX})"

# --- one-line proof command ---
echo "TEST: kill -0 \"\$(cat '$PID_FILE')\" 2>/dev/null && echo running-ok || echo not-running"
