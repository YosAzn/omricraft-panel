#!/usr/bin/env bash
#
# stop-server.sh
# Responsibility: Stop ONLY the GlassProfile Server identified by its own
#   server.pid (later: graceful RCON 'stop'). NEVER pkill/killall java —
#   that would kill the live OmriCraft servers sharing the box. Targets a
#   single PID that we ourselves recorded.
#
# NOTE: Operates only under $GLASS_ROOT/servers/<SERVER_ID>/. See DECISIONS.md sec.6.
#
# Usage:
#   stop-server.sh <SERVER_ID>
# Example:
#   stop-server.sh gps-001

set -euo pipefail

# --- single config variable ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

SERVER_ID="${1:-}"
[ -n "$SERVER_ID" ] || { echo "Usage: $0 <SERVER_ID>" >&2; exit 2; }

case "$SERVER_ID" in
  *..*|*/*|"") echo "ERROR: invalid SERVER_ID" >&2; exit 1 ;;
esac
printf '%s' "$SERVER_ID" | grep -Eq '^[a-zA-Z0-9_-]+$' || { echo "ERROR: bad SERVER_ID" >&2; exit 1; }

SERVERS_DIR="$GLASS_ROOT/servers"
TARGET_DIR="$SERVERS_DIR/$SERVER_ID"
case "$TARGET_DIR" in
  "$SERVERS_DIR"/*) : ;;
  *) echo "ERROR: refusing — '$TARGET_DIR' escapes '$SERVERS_DIR/'" >&2; exit 1 ;;
esac

[ -d "$TARGET_DIR" ] || { echo "ERROR: no such server dir: $TARGET_DIR" >&2; exit 1; }

PID_FILE="$TARGET_DIR/server.pid"
if [ ! -f "$PID_FILE" ]; then
  echo "INFO: no server.pid for $SERVER_ID — nothing to stop."
  echo "TEST: test ! -f '$PID_FILE' && echo already-stopped"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "$PID" ] || ! printf '%s' "$PID" | grep -Eq '^[0-9]+$'; then
  echo "INFO: pid file empty/invalid — clearing stale file."
  rm -f "$PID_FILE"
  exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
  echo "INFO: pid $PID not alive — clearing stale pid file."
  rm -f "$PID_FILE"
  exit 0
fi

# --- graceful stop, single PID only ---
# TODO (later phase): prefer RCON 'stop' using $TARGET_DIR/server.properties
#                     rcon.port + password before falling back to signals.
echo "INFO: stopping $SERVER_ID (pid $PID) with SIGTERM..."
kill -TERM "$PID" 2>/dev/null || true

# wait up to ~30s for clean shutdown
for _ in $(seq 1 30); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done

if kill -0 "$PID" 2>/dev/null; then
  echo "WARN: pid $PID still alive after 30s — sending SIGKILL to that single pid."
  kill -KILL "$PID" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "OK: stopped $SERVER_ID."

# --- one-line proof command ---
echo "TEST: test ! -f '$PID_FILE' && echo stopped-ok"
