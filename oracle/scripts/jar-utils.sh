#!/usr/bin/env bash
# jar-utils.sh — shared bash helpers for OmriCraft scripts.
# Source this file:  source "$(dirname "${BASH_SOURCE[0]}")/jar-utils.sh"
#
# B-8: real JAR validation. A 0-byte check is NOT enough — a failed download
# (HTTP 403/404/rate-limit) often returns a small HTML error page with a
# non-zero size. A Java/Minecraft jar is a ZIP archive, so its first 4 bytes
# MUST be the ZIP local-file-header magic "PK\x03\x04". We also enforce a sane
# minimum size so we never keep a truncated/partial jar that crashes the server
# on boot.

# is_valid_jar PATH
#   returns 0 if PATH is a plausible jar (ZIP magic + size > floor), else 1.
#   Does NOT delete the file — caller decides what to do on failure.
is_valid_jar() {
  local f="$1"
  local min_bytes="${2:-1000}"
  [ -f "$f" ] || return 1
  # size floor (handles 0-byte and tiny HTML error pages)
  local size
  size=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
  [ -n "$size" ] || return 1
  [ "$size" -gt "$min_bytes" ] || return 1
  # ZIP magic: bytes 0-3 must be 50 4b 03 04 (PK\x03\x04).
  # (Empty zips use PK\x05\x06, never valid for a real jar.)
  local magic
  magic=$(head -c 4 "$f" 2>/dev/null | od -An -tx1 | tr -d ' \n')
  [ "$magic" = "504b0304" ]
}

# validate_jar_or_fail PATH LABEL [MIN_BYTES]
#   Validates PATH; on failure deletes the file and echoes a loud error.
#   Returns non-zero on failure so callers can `|| exit 1` / continue as needed.
validate_jar_or_fail() {
  local f="$1"
  local label="$2"
  local min_bytes="${3:-1000}"
  if is_valid_jar "$f" "$min_bytes"; then
    return 0
  fi
  echo "[$(date)] ERROR: invalid jar for ${label} ($f) — not a ZIP/jar (download likely returned an HTML error page). Removing."
  rm -f "$f"
  return 1
}
