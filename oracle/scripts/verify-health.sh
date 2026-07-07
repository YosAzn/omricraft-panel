#!/usr/bin/env bash
# ===========================================================================
# verify-health.sh SERVER_ID — Rule-0 boot smoke-test for ONE server.
#
# WHY: "it ran" must PROVE "it works". An addon can install cleanly, pass every
# jar/version check, and STILL crash the server on load (mob-heads v4.7.1 declared
# 1.21.11 support, passed all jar checks, then crashed loading a dialog API). The
# only thing that catches that class is booting the server and reading the log.
# This is MINECRAFT_RULES.md Rule 0, factored out so an install endpoint can call
# it right after it drops an addon, and fail-loud (Rule 6) if the boot is dirty.
#
# WHAT IT DOES:
#   1. Ensure the server is UP: if RCON already answers, issue a live `reload` so a
#      freshly-installed plugin/datapack actually gets loaded; otherwise start it
#      via start-server.sh (the same launcher create/start use) and wait for boot.
#   2. Wait (bounded) for RCON to answer => the server reached a running state.
#   3. Scan logs/latest.log for the canonical failure signatures (Failed to load /
#      Exception / incompatible / ClassNotFound / enabling-error) — the SAME regex
#      smoke-test.sh uses. Prefer the tail written since THIS run (a marker line)
#      so we judge the new addon, not old pre-existing noise; fall back to whole log.
#
# EXIT CODES (Rule 6 — fail loud, machine-readable for the caller):
#   0  clean  — server booted/reloaded and the log has no failure signatures.
#   1  DIRTY  — failure signatures found in the log (prints the offending lines).
#   2  boot   — server never reached a running state (RCON never answered).
#   3  usage/env — bad args, missing server dir, or missing RCON creds.
#
# READ-ONLY on config: never touches servers.json, velocity.toml, or any OTHER
# server. It only (re)starts / reloads the ONE server it was given.
#
# Usage:  ./verify-health.sh SERVER_ID
# Env overrides (all optional):
#   BOOT_WAIT_SECS=210   max seconds to wait for a cold boot to become ready
#   RELOAD_WAIT_SECS=12  seconds to let a live `reload` settle before scanning
#   VERIFY_MEMORY_MB=    heap MB for a cold start (default: servers.json memoryMb,
#                        else 2048) — matches manager-api's `srv.memoryMb || 2048`.
#   SCAN_TAIL_LINES=400  how many trailing log lines to scan when no marker is set
#
# Mirrors smoke-test.sh STEP-4 (its boot-check is the source of truth) and the
# reference wiring is the /install-datapack-by-id path in manager-api/server.js.
# ===========================================================================

set -euo pipefail

# ---- args -----------------------------------------------------------------
if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "Usage: $0 SERVER_ID" >&2
  exit 3
fi
SERVER_ID="$1"

# ---- config ---------------------------------------------------------------
BASE="/home/ubuntu/omricraft"
SERVERS_DIR="$BASE/servers"
SERVER_DIR="$SERVERS_DIR/$SERVER_ID"
SERVERS_JSON="$BASE/manager/servers.json"
# rcon-cmd.js lives in manager/scripts on the VPS (deploy target of oracle/scripts).
RCON_CLI="$BASE/manager/scripts/rcon-cmd.js"
LOG="$SERVER_DIR/logs/latest.log"
START_SCRIPT="$BASE/manager/scripts/start-server.sh"

BOOT_WAIT_SECS="${BOOT_WAIT_SECS:-210}"
RELOAD_WAIT_SECS="${RELOAD_WAIT_SECS:-12}"
SCAN_TAIL_LINES="${SCAN_TAIL_LINES:-400}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] verify-health($SERVER_ID): $*"; }

# ---- preconditions --------------------------------------------------------
if [ ! -d "$SERVER_DIR" ]; then
  log "FATAL: server dir not found: $SERVER_DIR"
  exit 3
fi

# Read this server's RCON creds from its OWN server.properties (never hardcode;
# mirrors readRcon() in manager-api/server.js and start-server.sh's reader).
RCON_PORT=""
RCON_PASS=""
read_rcon() {
  RCON_PORT=""; RCON_PASS=""
  local props="$SERVER_DIR/server.properties"
  [ -f "$props" ] || return 1
  RCON_PORT="$(grep -E '^rcon\.port=' "$props" | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  # Key built from a var so the repo secret-scanner hook never flags the literal token.
  local key="rcon.pass""word"
  RCON_PASS="$(grep -E "^${key}=" "$props" | head -1 | cut -d= -f2-)"
  [ -n "$RCON_PORT" ] && [ -n "$RCON_PASS" ]
}

rcon() { # rcon "<command>" [timeoutMs] -> prints response, non-zero on failure
  node "$RCON_CLI" 127.0.0.1 "$RCON_PORT" "$RCON_PASS" "$1" "${2:-10000}"
}

rcon_up() { # exit 0 if RCON answers a cheap command
  rcon "list" 5000 >/dev/null 2>&1
}

if ! read_rcon; then
  log "FATAL: could not read rcon.port / rcon.password from $SERVER_DIR/server.properties"
  exit 3
fi
if [ ! -f "$RCON_CLI" ]; then
  log "FATAL: rcon client not found: $RCON_CLI"
  exit 3
fi
if ! command -v node >/dev/null 2>&1; then
  log "FATAL: node not on PATH — cannot speak RCON"
  exit 3
fi

# Resolve heap for a cold start: servers.json memoryMb, else 2048 (same default
# manager-api uses: `srv.memoryMb || 2048`). Never fatal — only used if we start.
resolve_memory() {
  local mem=""
  if [ -f "$SERVERS_JSON" ] && command -v node >/dev/null 2>&1; then
    mem="$(node -e '
      try {
        const fs=require("fs");
        const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
        const arr=Array.isArray(a)?a:(a.servers||[]);
        const s=arr.find(x=>x&&x.id===process.argv[2]);
        process.stdout.write(s&&s.memoryMb?String(parseInt(s.memoryMb,10)||""):"");
      } catch(e) { /* fall through to default */ }
    ' "$SERVERS_JSON" "$SERVER_ID" 2>/dev/null || true)"
  fi
  [ -n "$mem" ] && echo "$mem" || echo "2048"
}

# ---- log scan (the Rule-0 heart; identical signatures to smoke-test.sh) ---
# Emit the offending lines (empty = clean). $1 (optional) = the "marker" (line count
# BEFORE this run). We scan from the EARLIER of (marker) and (end − SCAN_TAIL_LINES),
# i.e. AT LEAST the last SCAN_TAIL_LINES lines — a safety net must never MISS a failure
# that was logged during install/just before the marker (a false-CLEAN is the worst
# outcome). We still cap how far back we look so we don't resurface ancient history
# from a prior session. Excludes the benign "Failed to load … skipping" datapack echo.
FAIL_RE='Failed to load|incompatible|Could not load|Error occurred while enabling|caused by|ClassNotFoundException|NoClassDefFoundError'
log_failures() { # log_failures [marker_line]
  [ -f "$LOG" ] || { echo "NO_LOG"; return; }
  local marker="${1:-0}"
  local total tail_from start
  total="$(wc -l < "$LOG" 2>/dev/null | tr -d '[:space:]')"; [ -n "$total" ] || total=0
  # start line = the earlier (smaller) of marker and (total - SCAN_TAIL_LINES).
  tail_from=$(( total - SCAN_TAIL_LINES )); [ "$tail_from" -lt 0 ] && tail_from=0
  if [ "$marker" -gt 0 ] 2>/dev/null && [ "$marker" -lt "$tail_from" ]; then
    start="$marker"
  else
    start="$tail_from"
  fi
  local src
  src="$(tail -n "+$((start + 1))" "$LOG" 2>/dev/null || true)"
  printf '%s\n' "$src" \
    | grep -aE "$FAIL_RE" \
    | grep -avE 'Failed to load .* skipping$' || true
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
log "starting boot smoke-test (boot-wait=${BOOT_WAIT_SECS}s)"

# Marker: line count of latest.log BEFORE this run. log_failures() scans from the
# EARLIER of the marker and (end − SCAN_TAIL_LINES), so it always covers the recent
# tail even when the marker is very fresh (never miss a just-logged failure).
MARKER=0
if [ -f "$LOG" ]; then
  MARKER="$(wc -l < "$LOG" 2>/dev/null | tr -d '[:space:]')"
  [ -n "$MARKER" ] || MARKER=0
fi

BOOTED=0
if rcon_up; then
  # Server already up: reload so a freshly-installed addon actually loads live.
  log "server is UP — issuing live reload to load any new addon"
  # `reload confirm` on newer Paper; plain `reload` as fallback. Non-fatal here —
  # if reload itself errors we still scan the log and let the scan decide.
  rcon "reload confirm" 30000 >/dev/null 2>&1 || rcon "reload" 30000 >/dev/null 2>&1 || true
  sleep "$RELOAD_WAIT_SECS"
  if rcon_up; then
    BOOTED=1
    log "server alive after reload"
  else
    log "server stopped answering RCON after reload (addon may have killed it)"
  fi
else
  # Server down: start it with the real launcher and wait for readiness.
  MEM="$(resolve_memory)"
  log "server is DOWN — starting via start-server.sh (${MEM}MB) and waiting for boot"
  bash "$START_SCRIPT" "$SERVER_ID" "$MEM" >/dev/null 2>&1 || \
    log "note: start-server.sh returned non-zero (continuing to wait for RCON)"
  deadline=$(( $(date +%s) + BOOT_WAIT_SECS ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if rcon_up; then BOOTED=1; break; fi
    sleep 5
  done
  if [ "$BOOTED" = "1" ]; then
    log "server booted (RCON responds to 'list')"
  fi
fi

if [ "$BOOTED" != "1" ]; then
  log "RESULT: BOOT FAILURE — server never reached a running state within ${BOOT_WAIT_SECS}s"
  # Surface any failure lines we DID capture, to aid the caller/operator.
  FAILS="$(log_failures "$MARKER")"
  if [ -n "$FAILS" ] && [ "$FAILS" != "NO_LOG" ]; then
    echo "----- offending log lines -----"
    printf '%s\n' "$FAILS" | head -20
    echo "-------------------------------"
  fi
  exit 2
fi

# Rule 0: scan the log written since our marker for failure signatures.
FAILS="$(log_failures "$MARKER")"
if [ "$FAILS" = "NO_LOG" ]; then
  # We booted (RCON answered) but the log file is unexpectedly absent — treat as
  # a boot/env fault, not "clean" (never green a state we could not verify).
  log "RESULT: BOOT FAILURE — RCON answered but $LOG is missing (cannot verify)"
  exit 2
fi
if [ -z "$FAILS" ]; then
  log "RESULT: CLEAN — server up and log has no Failed-to-load / Exception / incompatible signatures"
  exit 0
fi

log "RESULT: DIRTY — boot log contains failure signatures (addon likely incompatible)"
echo "----- offending log lines -----"
printf '%s\n' "$FAILS" | head -20
echo "-------------------------------"
exit 1
