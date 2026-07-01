#!/usr/bin/env bash
set -euo pipefail

# install-plugin-url.sh — download a single plugin .jar into SERVER_DIR/plugins/
# from a DIRECT URL or a GitHub-release "latest jar asset". Used for free plugins
# that are NOT on Modrinth (e.g. ProtocolLib, distributed via GitHub releases).
# FAILS LOUD when the download is missing/corrupt — never silently keeps a bad jar.
#
# Usage: ./install-plugin-url.sh SERVER_DIR SOURCE [FILENAME]
#   SERVER_DIR  absolute path to the server dir (…/omricraft/servers/<id>)
#   SOURCE      one of:
#                 github:<owner>/<repo>   resolve the latest release's .jar asset
#                                         via the GitHub API (browser_download_url)
#                 https://…/foo.jar       a direct https download URL
#   FILENAME    optional explicit output filename (basename only). Defaults to the
#               basename of the resolved URL (query string stripped).
#
# For github: sources we ALSO accept an optional pinned fallback URL via the
# PROTOCOLLIB_FALLBACK_URL / PLUGIN_FALLBACK_URL env var, used only when the GitHub
# API call fails (rate-limit / outage) so the install still succeeds on a known build.
#
# Deps: curl + python3 (both present on the VPS). Validation via jar-utils.sh.

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 SERVER_DIR SOURCE [FILENAME]"
  exit 1
fi

SERVER_DIR="$1"
SOURCE="$2"
FILENAME_OVERRIDE="${3:-}"

# Shared jar validation helper (B-8) — same convention as the other install scripts.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jar-utils.sh"

if [ ! -d "$SERVER_DIR" ]; then
  echo "ERROR: server directory not found: $SERVER_DIR"
  exit 1
fi

PLUGINS_DIR="$SERVER_DIR/plugins"
mkdir -p "$PLUGINS_DIR"

UA="omricraft/1.0 (plugin-url-installer)"
URL=""
FALLBACK_URL="${PLUGIN_FALLBACK_URL:-${PROTOCOLLIB_FALLBACK_URL:-}}"

resolve_github_asset() {
  # $1 = owner/repo → prints the first .jar asset's browser_download_url (or nothing).
  local repo="$1"
  if ! echo "$repo" | grep -qE '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'; then
    echo "ERROR: invalid github repo '$repo'" >&2
    return 1
  fi
  local api="https://api.github.com/repos/${repo}/releases/latest"
  local json
  json=$(curl -sfL --connect-timeout 20 --max-time 45 -A "$UA" \
    -H "Accept: application/vnd.github+json" "$api" || true)
  [ -n "$json" ] || return 1
  printf '%s' "$json" | python3 -c "
import sys, json
try:
    rel = json.load(sys.stdin)
except Exception:
    sys.exit(0)
assets = rel.get('assets') or []
# Prefer an exact 'ProtocolLib.jar'-style asset (no classifier); else first .jar.
jars = [a for a in assets if str(a.get('name','')).lower().endswith('.jar')]
if not jars:
    sys.exit(0)
plain = [a for a in jars if '-' not in a.get('name','')]
a = (plain or jars)[0]
u = a.get('browser_download_url')
if u:
    print(u)
"
}

case "$SOURCE" in
  github:*)
    REPO="${SOURCE#github:}"
    echo "[$(date)] Resolving latest GitHub release jar for '$REPO'..."
    URL=$(resolve_github_asset "$REPO" || true)
    if [ -z "$URL" ] && [ -n "$FALLBACK_URL" ]; then
      echo "[$(date)] GitHub API resolve failed — using pinned fallback URL."
      URL="$FALLBACK_URL"
    fi
    if [ -z "$URL" ]; then
      echo "ERROR: could not resolve a release jar for '$REPO' (and no fallback set)"
      exit 1
    fi
    ;;
  https://*)
    URL="$SOURCE"
    ;;
  *)
    echo "ERROR: unsupported source '$SOURCE' (expected github:owner/repo or an https URL)"
    exit 1
    ;;
esac

# Only accept GitHub-family or the pinned host — never let an arbitrary host through.
case "$URL" in
  https://github.com/*|https://*.githubusercontent.com/*|https://objects.githubusercontent.com/*) ;;
  *)
    if [ "$URL" != "$FALLBACK_URL" ]; then
      echo "ERROR: unexpected download host: $URL"
      exit 1
    fi
    ;;
esac

if [ -n "$FILENAME_OVERRIDE" ]; then
  FILENAME="$(basename "$FILENAME_OVERRIDE")"
else
  FILENAME=$(basename "$URL" | sed 's/\?.*$//')
fi
# Path-traversal safety on the resolved filename.
if ! echo "$FILENAME" | grep -qE '^[A-Za-z0-9._-]+\.jar$'; then
  echo "ERROR: invalid resolved filename '$FILENAME'"
  exit 1
fi

DEST="$PLUGINS_DIR/$FILENAME"
echo "[$(date)] Downloading plugin jar -> $FILENAME ($URL)"
curl -sfL --connect-timeout 20 --max-time 120 -A "$UA" "$URL" -o "$DEST" || true

# B-8: real jar validation (ZIP magic + size floor); deletes the file on failure.
if validate_jar_or_fail "$DEST" "plugin-url $FILENAME"; then
  echo "[$(date)] OK: plugin jar installed at $DEST"
else
  echo "ERROR: download failed / corrupt jar for $FILENAME"
  exit 1
fi
