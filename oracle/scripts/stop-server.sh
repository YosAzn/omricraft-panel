#!/usr/bin/env bash
set -euo pipefail

# Usage: ./stop-server.sh SERVER_ID

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 SERVER_ID"
  exit 1
fi

SERVER_ID="$1"

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
PID_FILE="$SERVER_DIR/server.pid"
SERVERS_JSON="$BASE/manager/servers.json"

echo "[$(date)] Stopping server $SERVER_ID..."

# graceful_kill PID: SIGTERM, wait up to 20s, then SIGKILL. Returns 0 if dead.
graceful_kill() {
  local pid="$1"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  echo "[$(date)] Force killing PID $pid..."
  kill -9 "$pid" 2>/dev/null || true
  for _ in $(seq 1 5); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  return 1
}

# resolve_pid_by_port_cwd: find the java PID that BOTH listens on the server's
# configured port AND has its cwd == this server's directory (double verification
# so we never kill a foreign process). Echoes PID on success, empty on no match.
resolve_pid_by_port_cwd() {
  local port pid pcwd
  port="$(grep -E '^server-port=' "$SERVER_DIR/server.properties" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if [ -z "$port" ]; then
    return 0
  fi
  # All PIDs listening on that exact port (LISTEN sockets only).
  for pid in $(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    [ -n "$pid" ] || continue
    # Verify the process command looks like a minecraft server.jar java process.
    grep -qa 'server.jar' "/proc/$pid/cmdline" 2>/dev/null || continue
    # Verify cwd matches THIS server's directory exactly (authoritative check).
    pcwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)"
    # readlink may append " (deleted)"; strip it for comparison.
    pcwd="${pcwd% (deleted)}"
    if [ "$pcwd" = "$SERVER_DIR" ]; then
      echo "$pid"
      return 0
    fi
  done
  return 0
}

# port_listening: returns 0 if the server's configured port is still in LISTEN.
port_listening() {
  local port
  port="$(grep -E '^server-port=' "$SERVER_DIR/server.properties" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  [ -n "$port" ] || return 1
  ss -ltnH "sport = :$port" 2>/dev/null | grep -q LISTEN
}

KILLED=""

# Path 1: valid pid file (preserves existing behaviour exactly).
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    if graceful_kill "$PID"; then
      KILLED="$PID"
    else
      echo "[$(date)] ERROR: failed to kill PID $PID from pid file." >&2
    fi
  else
    echo "[$(date)] Process $PID not found. Removing stale PID file."
  fi
  rm -f "$PID_FILE"
fi

# Path 2: no kill happened via pid file (missing/stale). Robust fallback:
# locate the java process by port AND cwd double-match, then kill it.
if [ -z "$KILLED" ]; then
  echo "[$(date)] No live PID via pid file; attempting port+cwd resolution for $SERVER_ID..."
  FALLBACK_PID="$(resolve_pid_by_port_cwd)"
  if [ -n "$FALLBACK_PID" ]; then
    echo "[$(date)] Resolved $SERVER_ID -> java PID $FALLBACK_PID (port+cwd verified). Killing..."
    if graceful_kill "$FALLBACK_PID"; then
      KILLED="$FALLBACK_PID"
    else
      echo "[$(date)] ERROR: failed to kill resolved PID $FALLBACK_PID for $SERVER_ID." >&2
      exit 3
    fi
  else
    echo "[$(date)] No matching java process (port+cwd) for $SERVER_ID — treating as not running."
  fi
fi

# VERIFY: the server's port must no longer be listening. Loud failure if it is.
if port_listening; then
  echo "[$(date)] ERROR: $SERVER_ID port still LISTENING after stop attempt — NOT stopped." >&2
  exit 4
fi

# Update servers.json status
if [ -f "$SERVERS_JSON" ] && command -v node &>/dev/null; then
  TMP_JSON="$SERVERS_JSON.tmp.$$"
  node -e "
    const fs = require('fs');
    const arr = JSON.parse(fs.readFileSync('$SERVERS_JSON','utf8'));
    const entry = arr.find(s => s.id === '$SERVER_ID');
    if (entry) entry.status = 'stopped';
    fs.writeFileSync('$TMP_JSON', JSON.stringify(arr, null, 2));
  " && mv "$TMP_JSON" "$SERVERS_JSON"
fi

echo "[$(date)] Server $SERVER_ID stopped."
