#!/usr/bin/env bash
set -euo pipefail

# install-datapack.sh — install a single datapack into SERVER_DIR via the Modrinth
# API (loader "datapack"). VERSION-AWARE: always resolves the newest build that
# supports the server's MC version, so we never install an incompatible pack that
# crashes the server on boot (the Terralith-1.21-on-1.21.11 bug). Mirrors
# install-mod.sh. FAILS LOUD: exit 1 on API/network/corrupt; exit 2 when NO build
# exists for that MC version (caller skips loudly instead of installing a crasher).
#
# Usage: ./install-datapack.sh SERVER_DIR MC_VERSION MODRINTH_SLUG TARGET
#   SERVER_DIR    absolute path to the server dir
#   MC_VERSION    e.g. 1.21.11
#   MODRINTH_SLUG e.g. terralith
#   TARGET        world | pending  (world -> world/datapacks; pending -> datapacks-pending)
#
# Deps: curl + python3 (both present on the VPS). Validation via jar-utils.sh.

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 SERVER_DIR MC_VERSION MODRINTH_SLUG TARGET(world|pending)"
  exit 1
fi

SERVER_DIR="$1"
MC_VERSION="$2"
SLUG="$3"
TARGET="$4"

# Shared jar/zip validation helper (B-8) — a datapack zip is also PK\x03\x04.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jar-utils.sh"

if ! echo "$SLUG" | grep -qE '^[A-Za-z0-9_-]+$'; then
  echo "ERROR: invalid Modrinth slug '$SLUG'"
  exit 1
fi

if [ ! -d "$SERVER_DIR" ]; then
  echo "ERROR: server directory not found: $SERVER_DIR"
  exit 1
fi

# Minecraft only loads datapacks from world/datapacks (live) or, before the world
# exists, we stage them in datapacks-pending (start-server.sh drains -> world).
case "$TARGET" in
  world)   DEST_DIR="$SERVER_DIR/world/datapacks" ;;
  pending) DEST_DIR="$SERVER_DIR/datapacks-pending" ;;
  *) echo "ERROR: invalid TARGET '$TARGET' (expected world|pending)"; exit 1 ;;
esac
mkdir -p "$DEST_DIR"

UA="omricraft/1.0 (datapack-installer)"
API="https://api.modrinth.com/v2/project/${SLUG}/version?loaders=%5B%22datapack%22%5D&game_versions=%5B%22${MC_VERSION}%22%5D"

echo "[$(date)] Resolving datapack '$SLUG' for Minecraft $MC_VERSION via Modrinth..."
JSON=$(curl -sfL --connect-timeout 20 --max-time 60 -A "$UA" "$API" || true)

if [ -z "$JSON" ]; then
  echo "ERROR: Modrinth API request failed for datapack '$SLUG' ($MC_VERSION)"
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
  echo "ERROR: no datapack build of '$SLUG' for Minecraft $MC_VERSION on Modrinth"
  exit 2
fi

URL="${PICK%%$'\t'*}"
FILENAME="${PICK#*$'\t'}"

# Only accept Modrinth's own CDN — the API returns cdn.modrinth.com URLs.
case "$URL" in
  https://cdn.modrinth.com/*) ;;
  *) echo "ERROR: unexpected download host for datapack '$SLUG': $URL"; exit 1 ;;
esac

# Minecraft only recognises a .zip (or a folder) inside datapacks/. Modrinth
# datapack files are already .zip, but enforce it so a non-.zip name never loads.
case "$FILENAME" in
  *.zip) ;;
  *) FILENAME="${FILENAME}.zip" ;;
esac

DEST="$DEST_DIR/$FILENAME"
echo "[$(date)] Downloading datapack $SLUG -> $FILENAME"
curl -sfL --connect-timeout 20 --max-time 120 -A "$UA" "$URL" -o "$DEST" || true

# B-8: real zip validation (PK magic + size floor); deletes file on failure.
if validate_jar_or_fail "$DEST" "datapack $SLUG ($MC_VERSION)"; then
  echo "[$(date)] OK: datapack $SLUG installed at $DEST"
else
  echo "ERROR: download failed / corrupt zip for datapack $SLUG"
  exit 1
fi
