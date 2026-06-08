#!/usr/bin/env bash
#
# create-dome.sh
# Responsibility: Register a Dome (metadata + targetWorld) inside an existing
#   GlassProfile Server. THIS PHASE: metadata only — writes a per-dome record
#   file and echoes the intended domes.json / routes.json entries. It does NOT
#   yet create the actual world. Real world creation via internal Multiverse
#   (PaperWorldAdapter) is a LATER phase (spec phase 6 / phase 7).
#
# NOTE: Operates only under $GLASS_ROOT. No raw Multiverse access for users.
#       See DECISIONS.md sec.3 and sec.6.
#
# Usage:
#   create-dome.sh <SERVER_ID> <DOME_ID> "<DISPLAY_NAME>" [SLUG]
# Example:
#   create-dome.sh gps-001 dome-1001 "Shahar Server" shahar

set -euo pipefail

# --- single config variable ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

SERVER_ID="${1:-}"
DOME_ID="${2:-}"
DISPLAY_NAME="${3:-}"
SLUG="${4:-}"

[ -n "$SERVER_ID" ] && [ -n "$DOME_ID" ] && [ -n "$DISPLAY_NAME" ] || {
  echo "Usage: $0 <SERVER_ID> <DOME_ID> \"<DISPLAY_NAME>\" [SLUG]" >&2; exit 2;
}

# --- validate ids ---
for v in "$SERVER_ID" "$DOME_ID"; do
  case "$v" in
    *..*|*/*|/*|"") echo "ERROR: invalid id '$v'" >&2; exit 1 ;;
  esac
  printf '%s' "$v" | grep -Eq '^[a-zA-Z0-9_-]+$' || { echo "ERROR: bad id '$v'" >&2; exit 1; }
done

# --- derive slug if not provided: lowercase the dome id tail ---
if [ -z "$SLUG" ]; then
  SLUG="$(printf '%s' "$DOME_ID" | tr '[:upper:]' '[:lower:]')"
fi
printf '%s' "$SLUG" | grep -Eq '^[a-z0-9-]+$' || { echo "ERROR: SLUG must match ^[a-z0-9-]+$" >&2; exit 1; }

SERVERS_DIR="$GLASS_ROOT/servers"
TARGET_DIR="$SERVERS_DIR/$SERVER_ID"
case "$TARGET_DIR" in
  "$SERVERS_DIR"/*) : ;;
  *) echo "ERROR: refusing — '$TARGET_DIR' escapes '$SERVERS_DIR/'" >&2; exit 1 ;;
esac
[ -d "$TARGET_DIR" ] || { echo "ERROR: GlassProfile Server not found: $TARGET_DIR" >&2; exit 1; }

# --- derived metadata ---
TARGET_WORLD="world_${DOME_ID//-/_}"
PUBLIC_HOST="${SLUG}.omricraft.net"
DOMES_REC_DIR="$TARGET_DIR/domes"
mkdir -p "$DOMES_REC_DIR"
DOME_REC="$DOMES_REC_DIR/$DOME_ID.json"

if [ -f "$DOME_REC" ]; then
  echo "ERROR: dome record already exists: $DOME_REC" >&2; exit 1
fi

# --- write per-dome record (metadata only; Manager merges into domes.json) ---
cat > "$DOME_REC" <<EOF
{
  "id": "$DOME_ID",
  "ownerUserId": "CHANGE_ME",
  "displayName": "$DISPLAY_NAME",
  "slug": "$SLUG",
  "publicHost": "$PUBLIC_HOST",
  "serverInstanceId": "$SERVER_ID",
  "targetWorld": "$TARGET_WORLD",
  "requestedAddons": [],
  "allowedCapabilities": ["vanilla.basic"],
  "entryPolicy": "direct_to_world",
  "status": "registered"
}
EOF

echo "OK: registered Dome $DOME_ID on $SERVER_ID"
echo "     targetWorld = $TARGET_WORLD   publicHost = $PUBLIC_HOST"
echo "INFO: world NOT created yet (PaperWorldAdapter/Multiverse is a later phase)."
echo "INFO: Manager should now merge this into domes.json and add a route to routes.json."

# --- one-line proof command ---
echo "TEST: grep -q '\"$DOME_ID\"' '$DOME_REC' && echo dome-registered-ok"
