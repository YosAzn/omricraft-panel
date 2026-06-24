#!/usr/bin/env bash
set -euo pipefail

# reap-orphans.sh — kill orphaned Minecraft server java processes.
#
# An "orphan" is a java process whose cmdline references server.jar AND whose
# working directory is under SERVERS_DIR, but EITHER:
#   (a) its cwd is flagged "(deleted)" by the kernel (server dir was removed), OR
#   (b) the serverId (basename of cwd) is NOT present in servers.json.
#
# MAXIMUM CAUTION: a process is only ever a kill candidate if its resolved cwd is
# strictly under SERVERS_DIR/. Velocity (cwd = .../velocity), the manager API, and
# any process outside SERVERS_DIR are structurally excluded — they can never match.
# Pass --dry-run to report candidates without killing.

BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVERS_JSON="$BASE/manager/servers.json"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { echo "[$(date)] [reap] $*"; }

# server_id_known ID -> 0 if present in servers.json, 1 otherwise.
server_id_known() {
  local id="$1"
  [ -f "$SERVERS_JSON" ] || return 1
  node -e '
    const fs = require("fs");
    try {
      const arr = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.exit(arr.some(s => s && s.id === process.argv[2]) ? 0 : 1);
    } catch (e) { console.error("[reap] servers.json parse error: " + e.message); process.exit(2); }
  ' "$SERVERS_JSON" "$id"
}

graceful_kill() {
  local pid="$1"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  log "Force killing PID $pid..."
  kill -9 "$pid" 2>/dev/null || true
  for _ in $(seq 1 5); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  return 1
}

reaped=0
checked=0

# is_server_jar_cmdline FILE -> 0 if the NUL-delimited /proc cmdline is a real
# minecraft launch: it has a standalone "-jar" arg AND a jar arg whose basename
# is exactly "server.jar". Anchored to arg boundaries (NUL = [:cntrl:], "/", or
# start/end) so substrings like "otherserver.jar", "server.jar.txt", or a bare
# "echo server.jar" (no -jar flag) are NOT matched.
is_server_jar_cmdline() {
  local f="$1"
  grep -qaE '(^|[[:cntrl:]])-jar([[:cntrl:]]|$)' "$f" 2>/dev/null || return 1
  grep -qaE '(^|[/[:cntrl:]])server\.jar([[:cntrl:]]|$)' "$f" 2>/dev/null || return 1
  return 0
}

for pid in $(pgrep -f '[j]ava' || true); do
  [ -n "$pid" ] || continue
  # Must be a minecraft server.jar java process (anchored, not substring).
  is_server_jar_cmdline "/proc/$pid/cmdline" || continue
  checked=$((checked + 1))

  raw_cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  [ -n "$raw_cwd" ] || continue

  deleted=0
  cwd="$raw_cwd"
  case "$raw_cwd" in
    *" (deleted)") deleted=1; cwd="${raw_cwd% (deleted)}" ;;
  esac

  # HARD GUARD: cwd must be strictly under SERVERS_DIR/. Anything else
  # (velocity, manager, /home/ubuntu, etc.) is never a candidate.
  case "$cwd" in
    "$SERVERS_DIR"/*) : ;;
    *) continue ;;
  esac

  server_id="$(basename "$cwd")"

  reason=""
  if [ "$deleted" -eq 1 ]; then
    reason="cwd deleted ($raw_cwd)"
  elif ! server_id_known "$server_id"; then
    reason="serverId '$server_id' not in servers.json"
  else
    # Known server with a live directory — legitimate, leave it alone.
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY-RUN candidate: PID $pid cwd='$cwd' reason: $reason"
    reaped=$((reaped + 1))
    continue
  fi

  log "Reaping orphan PID $pid (cwd='$cwd', reason: $reason)..."
  if graceful_kill "$pid"; then
    log "PID $pid reaped."
    reaped=$((reaped + 1))
  else
    log "ERROR: failed to kill orphan PID $pid." >&2
  fi
done

log "Done. server.jar procs checked=$checked, orphans handled=$reaped (dry-run=$DRY_RUN)."
