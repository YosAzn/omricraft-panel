#!/usr/bin/env bash
#
# restart-server.sh
# Responsibility: stop -> wait -> start, by delegating to stop-server.sh and
#   start-server.sh in the same scripts/ dir. No direct process handling here.
#
# NOTE: Operates only under $GLASS_ROOT. See DECISIONS.md sec.6.
#
# Usage:
#   restart-server.sh <SERVER_ID> [MEMORY_MB]
# Example:
#   restart-server.sh gps-001 3072

set -euo pipefail

# --- single config variable (kept for consistency/validation parity) ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

SERVER_ID="${1:-}"
MEMORY_MB="${2:-2048}"

[ -n "$SERVER_ID" ] || { echo "Usage: $0 <SERVER_ID> [MEMORY_MB]" >&2; exit 2; }

case "$SERVER_ID" in
  *..*|*/*|"") echo "ERROR: invalid SERVER_ID" >&2; exit 1 ;;
esac
printf '%s' "$SERVER_ID" | grep -Eq '^[a-zA-Z0-9_-]+$' || { echo "ERROR: bad SERVER_ID" >&2; exit 1; }
printf '%s' "$MEMORY_MB" | grep -Eq '^[0-9]+$' || { echo "ERROR: MEMORY_MB must be numeric" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "INFO: restarting $SERVER_ID ..."
"$SCRIPT_DIR/stop-server.sh" "$SERVER_ID"

# brief settle before start
sleep 2

"$SCRIPT_DIR/start-server.sh" "$SERVER_ID" "$MEMORY_MB"

echo "OK: restart sequence issued for $SERVER_ID."

# --- one-line proof command ---
echo "TEST: kill -0 \"\$(cat '$GLASS_ROOT/servers/$SERVER_ID/server.pid')\" 2>/dev/null && echo restarted-ok"
