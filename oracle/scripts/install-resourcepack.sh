#!/usr/bin/env bash
set -euo pipefail

# install-resourcepack.sh — point a server at a server-forced resource pack via the
# Modrinth API (loader "minecraft"). VERSION-AWARE: resolves the newest resourcepack
# build that supports the server's MC version, then writes the pack's direct
# cdn.modrinth.com URL + sha1 into server.properties so the client downloads it on
# join. Mirrors install-mod.sh / install-datapack.sh. FAILS LOUD: exit 1 on
# API/network/bad-host; exit 2 when NO build exists for that MC version.
#
# server.properties supports exactly ONE resource-pack, so calling it again REPLACES
# the previous pack (last one wins). require-resource-pack=false lets players decline.
#
# Usage: ./install-resourcepack.sh SERVER_DIR MC_VERSION MODRINTH_SLUG
#   SERVER_DIR    absolute path to the server dir
#   MC_VERSION    e.g. 1.21.11
#   MODRINTH_SLUG e.g. faithful-32x
#
# Deps: curl + python3 (both present on the VPS).

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 SERVER_DIR MC_VERSION MODRINTH_SLUG"
  exit 1
fi

SERVER_DIR="$1"
MC_VERSION="$2"
SLUG="$3"

if ! echo "$SLUG" | grep -qE '^[A-Za-z0-9_-]+$'; then
  echo "ERROR: invalid Modrinth slug '$SLUG'"
  exit 1
fi

if [ ! -d "$SERVER_DIR" ]; then
  echo "ERROR: server directory not found: $SERVER_DIR"
  exit 1
fi

PROPS="$SERVER_DIR/server.properties"
if [ ! -f "$PROPS" ]; then
  echo "ERROR: server.properties not found at $PROPS"
  exit 1
fi

UA="omricraft/1.0 (resourcepack-installer)"
# Resource packs are published under the "minecraft" loader on Modrinth.
API="https://api.modrinth.com/v2/project/${SLUG}/version?loaders=%5B%22minecraft%22%5D&game_versions=%5B%22${MC_VERSION}%22%5D"

echo "[$(date)] Resolving resourcepack '$SLUG' for Minecraft $MC_VERSION via Modrinth..."
JSON=$(curl -sfL --connect-timeout 20 --max-time 60 -A "$UA" "$API" || true)

if [ -z "$JSON" ]; then
  echo "ERROR: Modrinth API request failed for resourcepack '$SLUG' ($MC_VERSION)"
  exit 1
fi

# Pick the newest matching version (by date_published); emit "url<TAB>sha1<TAB>filename".
# Prints nothing if there is no compatible version or no sha1 (we REQUIRE a sha1 —
# the vanilla client rejects a resource pack whose download does not match it).
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
sha1 = (f.get('hashes') or {}).get('sha1')
if not url or not name or not sha1:
    sys.exit(0)
print(url + '\t' + sha1 + '\t' + name)
" || true)

if [ -z "$PICK" ]; then
  echo "ERROR: no resourcepack build of '$SLUG' for Minecraft $MC_VERSION on Modrinth (or missing sha1)"
  exit 2
fi

URL="${PICK%%$'\t'*}"
REST="${PICK#*$'\t'}"
SHA1="${REST%%$'\t'*}"
FILENAME="${REST#*$'\t'}"

# Only accept Modrinth's own CDN — the API returns cdn.modrinth.com URLs.
case "$URL" in
  https://cdn.modrinth.com/*) ;;
  *) echo "ERROR: unexpected download host for resourcepack '$SLUG': $URL"; exit 1 ;;
esac

# sha1 must be 40 hex chars.
if ! echo "$SHA1" | grep -qE '^[0-9a-f]{40}$'; then
  echo "ERROR: resolved sha1 for '$SLUG' is not a valid hash: $SHA1"
  exit 1
fi

# Reachability probe — confirm the CDN actually serves the file before we point the
# server at it. A dead/moved link would otherwise be written and the client would
# silently reject the pack on join (sibling scripts download+validate; this one only
# sets a URL, so probe here). HEAD request, no body download.
if ! curl -sfI --connect-timeout 20 --max-time 30 -A "$UA" "$URL" >/dev/null 2>&1; then
  echo "ERROR: resource pack URL not reachable (HEAD failed): $URL"
  exit 1
fi

echo "[$(date)] Setting resource-pack for $(basename "$SERVER_DIR") -> $FILENAME (sha1 $SHA1)"

# Idempotent rewrite: drop any existing resource-pack lines, then append the new ones.
# Keep everything else untouched. require-resource-pack=false lets players decline.
TMP="$PROPS.tmp.$$"
trap 'rm -f "$TMP"' EXIT
# grep -v exits 1 when it selects ZERO lines (only if server.properties held ONLY these
# 3 keys — never in practice); || true keeps set -e from aborting on that edge.
grep -vE '^(resource-pack|resource-pack-sha1|require-resource-pack)=' "$PROPS" > "$TMP" || true
{
  echo "resource-pack=${URL}"
  echo "resource-pack-sha1=${SHA1}"
  echo "require-resource-pack=false"
} >> "$TMP"
# server.properties holds the RCON password — preserve owner-only perms.
mv "$TMP" "$PROPS"
chmod 600 "$PROPS"

echo "[$(date)] OK: resourcepack $SLUG applied to server.properties"
