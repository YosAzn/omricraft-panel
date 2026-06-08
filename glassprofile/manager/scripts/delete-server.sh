#!/usr/bin/env bash
#
# delete-server.sh
# Responsibility: Stop (via stop-server.sh) then DELETE only
#   $GLASS_ROOT/servers/<SERVER_ID>/ after STRICT path validation. Refuses any
#   target that does not resolve to a real path strictly under
#   $GLASS_ROOT/servers/ . Never deletes anything outside that prefix.
#
# NOTE: Operates only under $GLASS_ROOT. NEVER touches the live OmriCraft
#       system at /home/ubuntu/omricraft. See DECISIONS.md sec.6.
#
# Usage:
#   delete-server.sh <SERVER_ID> [--yes]
# Example:
#   delete-server.sh gps-001 --yes

set -euo pipefail

# --- single config variable ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

SERVER_ID="${1:-}"
CONFIRM="${2:-}"

[ -n "$SERVER_ID" ] || { echo "Usage: $0 <SERVER_ID> [--yes]" >&2; exit 2; }

# --- validate SERVER_ID: reject empty, '..', absolute, slashes ---
case "$SERVER_ID" in
  /*) echo "ERROR: SERVER_ID must not be an absolute path" >&2; exit 1 ;;
  *..*) echo "ERROR: SERVER_ID must not contain '..'" >&2; exit 1 ;;
  */*) echo "ERROR: SERVER_ID must not contain '/'" >&2; exit 1 ;;
  "") echo "ERROR: empty SERVER_ID" >&2; exit 1 ;;
esac
printf '%s' "$SERVER_ID" | grep -Eq '^[a-zA-Z0-9_-]+$' || { echo "ERROR: bad SERVER_ID" >&2; exit 1; }

SERVERS_DIR="$GLASS_ROOT/servers"
TARGET_DIR="$SERVERS_DIR/$SERVER_ID"

# --- STRICT validation #1: literal prefix must be exactly $GLASS_ROOT/servers/ ---
case "$TARGET_DIR" in
  "$SERVERS_DIR"/*) : ;;
  *) echo "ERROR: refusing — '$TARGET_DIR' is not under '$SERVERS_DIR/'" >&2; exit 1 ;;
esac

# --- never allow the servers dir itself or the root ---
if [ "$TARGET_DIR" = "$SERVERS_DIR" ] || [ "$TARGET_DIR" = "$GLASS_ROOT" ] || [ "$TARGET_DIR" = "/" ]; then
  echo "ERROR: refusing to delete a root/servers directory" >&2; exit 1
fi

[ -d "$TARGET_DIR" ] || { echo "ERROR: no such server dir: $TARGET_DIR" >&2; exit 1; }

# --- STRICT validation #2: re-check the REAL (canonical) path prefix ---
REAL_TARGET="$(cd "$TARGET_DIR" && pwd -P)"
REAL_SERVERS="$(cd "$SERVERS_DIR" && pwd -P)"
case "$REAL_TARGET" in
  "$REAL_SERVERS"/*) : ;;
  *) echo "ERROR: refusing — resolved '$REAL_TARGET' escapes '$REAL_SERVERS/' (symlink?)" >&2; exit 1 ;;
esac
if [ "$REAL_TARGET" = "$REAL_SERVERS" ]; then
  echo "ERROR: resolved target equals servers dir — refusing" >&2; exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "DRY-RUN: would stop and delete: $REAL_TARGET"
  echo "Re-run with: $0 $SERVER_ID --yes"
  exit 0
fi

# --- stop first (single-pid, never killall) ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/stop-server.sh" "$SERVER_ID" || true

# --- delete only the validated, canonical target ---
rm -rf -- "$REAL_TARGET"

echo "OK: deleted $REAL_TARGET"

# --- one-line proof command ---
echo "TEST: test ! -d '$TARGET_DIR' && echo deleted-ok"
