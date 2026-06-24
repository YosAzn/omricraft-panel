#!/usr/bin/env bash
set -euo pipefail

# install-mod.sh — install a single mod into SERVER_DIR/mods/ via the Modrinth API.
# Works for fabric / forge / neoforge (no pinned URL tables). FAILS LOUD when no
# compatible build exists for the loader+version — never silently skips.
#
# Usage: ./install-mod.sh SERVER_DIR LOADER MC_VERSION MODRINTH_SLUG
#   SERVER_DIR    absolute path to the server dir (e.g. /home/ubuntu/omricraft/servers/<id>)
#   LOADER        fabric | forge | neoforge
#   MC_VERSION    e.g. 1.21.1
#   MODRINTH_SLUG e.g. create, jei, simple-voice-chat
#
# Deps: curl + python3 (both present on the VPS). Validation via jar-utils.sh.

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 SERVER_DIR LOADER MC_VERSION MODRINTH_SLUG"
  exit 1
fi

SERVER_DIR="$1"
LOADER="$2"
MC_VERSION="$3"
SLUG="$4"

# Shared jar validation helper (B-8) — same source convention as the other scripts.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jar-utils.sh"

case "$LOADER" in
  fabric|forge|neoforge) ;;
  *) echo "ERROR: unsupported loader '$LOADER' (expected fabric|forge|neoforge)"; exit 1 ;;
esac

if ! echo "$SLUG" | grep -qE '^[A-Za-z0-9_-]+$'; then
  echo "ERROR: invalid Modrinth slug '$SLUG'"
  exit 1
fi

if [ ! -d "$SERVER_DIR" ]; then
  echo "ERROR: server directory not found: $SERVER_DIR"
  exit 1
fi

MODS_DIR="$SERVER_DIR/mods"
mkdir -p "$MODS_DIR"

UA="omricraft/1.0 (mod-installer)"
API="https://api.modrinth.com/v2/project/${SLUG}/version?loaders=%5B%22${LOADER}%22%5D&game_versions=%5B%22${MC_VERSION}%22%5D"

echo "[$(date)] Resolving mod '$SLUG' for $LOADER $MC_VERSION via Modrinth..."
JSON=$(curl -sfL --connect-timeout 20 --max-time 60 -A "$UA" "$API" || true)

if [ -z "$JSON" ]; then
  echo "ERROR: Modrinth API request failed for '$SLUG' ($LOADER $MC_VERSION)"
  exit 1
fi

# Pick the newest matching version (by date_published) and emit its PRIMARY file
# as "url<TAB>filename". Prints nothing if there is no compatible version.
PICK=$(printf '%s' "$JSON" | python3 -c "
import sys, json
try:
    versions = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if not isinstance(versions, list) or not versions:
    sys.exit(0)
versions.sort(key=lambda v: v.get('date_published', ''), reverse=True)
v = versions[0]
files = v.get('files', [])
if not files:
    sys.exit(0)
f = next((x for x in files if x.get('primary')), files[0])
url = f.get('url'); name = f.get('filename')
if not url or not name:
    sys.exit(0)
print(url + '\t' + name)
" || true)

if [ -z "$PICK" ]; then
  echo "ERROR: no $LOADER build of '$SLUG' for Minecraft $MC_VERSION on Modrinth"
  exit 2
fi

URL="${PICK%%$'\t'*}"
FILENAME="${PICK#*$'\t'}"

# Only accept Modrinth's own CDN — the API returns cdn.modrinth.com URLs.
case "$URL" in
  https://cdn.modrinth.com/*) ;;
  *) echo "ERROR: unexpected download host for '$SLUG': $URL"; exit 1 ;;
esac

DEST="$MODS_DIR/$FILENAME"
echo "[$(date)] Downloading mod $SLUG -> $FILENAME"
curl -sfL --connect-timeout 20 --max-time 120 -A "$UA" "$URL" -o "$DEST" || true

# B-8: real jar validation (ZIP magic + size floor); deletes file on failure.
if validate_jar_or_fail "$DEST" "mod $SLUG ($LOADER $MC_VERSION)"; then
  echo "[$(date)] OK: mod $SLUG installed at $DEST"
else
  echo "ERROR: download failed / corrupt jar for mod $SLUG"
  exit 1
fi
