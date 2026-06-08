#!/usr/bin/env bash
#
# sync-proxy-routes.sh  (STUB)
# Responsibility: Read $GLASS_ROOT/manager/routes.json and (LATER) regenerate the
#   Velocity proxy route/forced-host config under $GLASS_ROOT/proxy/routes/ .
#   THIS PHASE: validate + read-only summary only. It does NOT write proxy
#   config and does NOT reload Velocity yet.
#
# NOTE: Operates only under $GLASS_ROOT. Does NOT touch the live OmriCraft
#       Velocity (/home/ubuntu/omricraft/velocity). See DECISIONS.md sec.6.
#
# Usage:
#   sync-proxy-routes.sh [--apply]   (--apply is reserved for a later phase; no-op now)

set -euo pipefail

# --- single config variable ---
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"

MODE="${1:-}"

ROUTES_FILE="$GLASS_ROOT/manager/routes.json"
PROXY_ROUTES_DIR="$GLASS_ROOT/proxy/routes"

# --- assert paths stay under $GLASS_ROOT ---
case "$ROUTES_FILE" in "$GLASS_ROOT"/*) : ;; *) echo "ERROR: routes path escapes GLASS_ROOT" >&2; exit 1 ;; esac
case "$PROXY_ROUTES_DIR" in "$GLASS_ROOT"/*) : ;; *) echo "ERROR: proxy dir escapes GLASS_ROOT" >&2; exit 1 ;; esac

[ -f "$ROUTES_FILE" ] || { echo "ERROR: routes file not found: $ROUTES_FILE" >&2; exit 1; }

echo "INFO: reading $ROUTES_FILE"

# --- prefer jq if present, fall back to a simple grep summary ---
if command -v jq >/dev/null 2>&1; then
  COUNT="$(jq '.routes | length' "$ROUTES_FILE")"
  echo "INFO: $COUNT route(s) defined:"
  jq -r '.routes[] | "  \(.host) -> \(.proxyTarget) (\(.targetWorld)) [\(.status)]"' "$ROUTES_FILE" || true
else
  echo "INFO: jq not installed — raw host lines:"
  grep -E '"host"' "$ROUTES_FILE" || echo "  (no host entries)"
fi

if [ "$MODE" = "--apply" ]; then
  echo "WARN: --apply is reserved for a later phase. No proxy config written, no Velocity reload."
  echo "      (Target output dir would be: $PROXY_ROUTES_DIR)"
fi

echo "OK: routes read (stub; no proxy mutation performed)."

# --- one-line proof command ---
echo "TEST: test -f '$ROUTES_FILE' && echo routes-readable-ok"
