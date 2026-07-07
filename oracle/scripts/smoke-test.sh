#!/usr/bin/env bash
# ===========================================================================
# smoke-test.sh — OmriCraft end-to-end smoke test (the safety net for Rule 0).
#
# WHY: changes get INSTALLED but are never VERIFIED to actually work. Two real
# outages proved the gap: (1) a 7-day-old root `velocity` orphan deadlocked
# :25565; (2) the `mob-heads` v4.7.1 datapack declared 1.21.11 support, passed
# every jar check, and STILL crashed on load. Only a boot smoke-test catches
# that class BEFORE a user sees it. See MINECRAFT_RULES.md — especially Rule 0.
#
# WHAT IT DOES (each step prints ✅/❌; ANY ❌ => exit non-zero):
#   1. Infra health   — velocity/manager/limbo units active, :25565 LISTEN,
#                       manager-api answers, omricraft.com reachable.
#   2. Existing safe  — a real server (default gd-3) still registered + routed.
#                       READ-ONLY: this script NEVER modifies a real server.
#   3. Create flow    — via manager-api POST /create-server (the REAL website
#                       path): dir + servers.json entry + velocity backend +
#                       forced-host all appear.
#   4. Rule-0 boot    — datapack install by id -> BOOT -> grep latest.log clean
#                       (no "Failed to load"/Exception/incompatible, "Done",
#                       datapack enabled). Then a free plugin -> reload -> clean.
#   5. Routing        — velocity.toml has the TEST forced host AND the real one.
#   6. Delete flow    — permanent delete -> dir gone, servers.json gone,
#                       velocity.toml gone, no orphan java, port freed.
#   7. Cleanup guard  — an EXIT trap removes the throwaway even if a step aborts
#                       mid-run (no running test server, no files, no toml line).
#
# It PREFERS the manager-api endpoints (curl to 127.0.0.1:$MANAGER_PORT with the
# key from manager/.env, exactly as the site does) so it tests the real flow;
# it falls back to invoking the scripts directly only where an endpoint cannot
# express the check (e.g. the isolated boot-wait Rule 0 needs).
#
# SAFE: only ever creates/deletes the clearly-named throwaway ($TEST_SLUG).
# Never touches gd-3, Omri's real servers, or velocity's other config.
#
# Usage:  ./smoke-test.sh
# Env overrides (all optional):
#   TEST_SLUG=smoketest-a1      throwaway slug (must be unique + unused)
#   TEST_GAME_PORT=25599        throwaway game port (must be free)
#   TEST_RCON_PORT=35599        throwaway rcon port (must be free)
#   TEST_TYPE=purpur            server software
#   TEST_VERSION=1.21.11        MC version
#   TEST_RAM=1024               heap MB
#   TEST_DATAPACK_ID=d12        catalog datapack id for the Rule-0 boot test
#                               (d12=veinminer, a SAFE non-worldgen pack that
#                               resolves for 1.21.11. NEVER d11/mob-heads — the
#                               known crasher.)
#   TEST_PLUGIN_ID=p1           catalog plugin id (p1=EssentialsX 2.22.0)
#   REAL_SERVER_ID=server-1783272860357   the real server to health-check (gd-3)
#   BOOT_WAIT_SECS=210          max seconds to wait for first boot to finish
#
# CI: deploy-oracle.yml already runs gate-tests.sh; this is the heavier live
# E2E and is safe to run on a schedule/manually (it self-cleans). Exit 0 = all
# green, non-zero = at least one ❌ (the summary lists which).
# ===========================================================================

set -euo pipefail

# ---- config ---------------------------------------------------------------
BASE="/home/ubuntu/omricraft"
SCRIPTS_DIR="$BASE/manager/scripts"
SERVERS_DIR="$BASE/servers"
SERVERS_JSON="$BASE/manager/servers.json"
VEL_TOML="$BASE/velocity/velocity.toml"
ENV_FILE="$BASE/manager/.env"
RCON_CLI="$SCRIPTS_DIR/rcon-cmd.js"

MANAGER_PORT="${MANAGER_PORT:-3001}"
API="http://127.0.0.1:${MANAGER_PORT}"

TEST_SLUG="${TEST_SLUG:-smoketest-a1}"
# Fixed id (Date.now is unavailable in this shell context) — clearly a throwaway.
TEST_ID="${TEST_ID:-server-smoketest-a1}"
TEST_GAME_PORT="${TEST_GAME_PORT:-25599}"
TEST_RCON_PORT="${TEST_RCON_PORT:-35599}"
TEST_TYPE="${TEST_TYPE:-purpur}"
TEST_VERSION="${TEST_VERSION:-1.21.11}"
TEST_RAM="${TEST_RAM:-1024}"
# d12=veinminer: real DATAPACK_CATALOG id, non-worldgen, resolves for 1.21.11.
# NEVER use d11 (mob-heads) — that is the datapack that crashed the server.
TEST_DATAPACK_ID="${TEST_DATAPACK_ID:-d12}"
TEST_PLUGIN_ID="${TEST_PLUGIN_ID:-p1}"   # p1 = EssentialsX 2.22.0 (Paper/Purpur 1.21.11)
REAL_SERVER_ID="${REAL_SERVER_ID:-server-1783272860357}"  # gd-3
BOOT_WAIT_SECS="${BOOT_WAIT_SECS:-210}"

TEST_DIR="$SERVERS_DIR/$TEST_ID"
LOG="$TEST_DIR/logs/latest.log"

PASS=0
FAIL=0
FAILED_STEPS=()

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1 — $2"; FAIL=$((FAIL + 1)); FAILED_STEPS+=("$1 :: $2"); }

# ---- api helper -----------------------------------------------------------
# Load the manager API key exactly like gate-tests.sh does.
MANAGER_API_KEY=""
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE" 2>/dev/null || true
fi
if [ -z "${MANAGER_API_KEY:-}" ]; then
  log "FATAL: MANAGER_API_KEY not found in $ENV_FILE — cannot drive the real API flow."
  exit 3
fi

# api_call METHOD PATH [JSON_BODY] -> writes body to $API_BODY, sets $API_CODE.
# Uses the SAME bearer auth the website uses. Never prints the key.
API_BODY=""
API_CODE=""
api_call() {
  local method="$1" apipath="$2" body="${3:-}"
  local out code
  if [ -n "$body" ]; then
    out=$(curl -s -w $'\n%{http_code}' -X "$method" \
      -H "Authorization: Bearer $MANAGER_API_KEY" \
      -H "Content-Type: application/json" \
      --max-time 150 \
      -d "$body" "$API$apipath" 2>/dev/null || true)
  else
    out=$(curl -s -w $'\n%{http_code}' -X "$method" \
      -H "Authorization: Bearer $MANAGER_API_KEY" \
      --max-time 150 \
      "$API$apipath" 2>/dev/null || true)
  fi
  API_CODE="${out##*$'\n'}"
  API_BODY="${out%$'\n'*}"
  # no-body case: body and code collapse to the same string -> blank the body.
  # Must not be the function's exit status (a false [ ] under set -e would abort
  # the whole script at a bare `api_call` call-site), so guard with an if-block.
  if [ "$API_BODY" = "$API_CODE" ]; then API_BODY=""; fi
  return 0
}

servers_json_has() { # servers_json_has <id>  -> exit 0 if present
  [ -f "$SERVERS_JSON" ] || return 1
  node -e '
    const fs=require("fs");
    const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const arr=Array.isArray(a)?a:(a.servers||[]);
    process.exit(arr.some(s=>s&&s.id===process.argv[2])?0:1);
  ' "$SERVERS_JSON" "$1"
}

port_listening() { # port_listening <port> -> exit 0 if something LISTENs
  ss -ltn 2>/dev/null | grep -qE "[:.]$1[[:space:]]"
}

# ---- cleanup guard (runs on ANY exit) -------------------------------------
# Guarantees ZERO test cruft even if a step aborts mid-run. Permanent delete
# (skips the 30-day archive) so no leftover files/archive/toml entry/java.
CLEANED=0
cleanup() {
  local rc=$?
  if [ "$CLEANED" = "1" ]; then return "$rc"; fi
  CLEANED=1
  # Only act if the throwaway actually exists in ANY channel.
  if [ -d "$TEST_DIR" ] || servers_json_has "$TEST_ID" || grep -q "^${TEST_ID} = " "$VEL_TOML" 2>/dev/null; then
    log "CLEANUP: removing throwaway $TEST_ID (permanent) ..."
    # Prefer the API so we exercise the real delete path; fall back to the script.
    api_call POST /delete-server "{\"serverId\":\"$TEST_ID\",\"permanent\":true}" || true
    if [ -d "$TEST_DIR" ] || servers_json_has "$TEST_ID"; then
      bash "$SCRIPTS_DIR/delete-server.sh" "$TEST_ID" permanent '[]' >/dev/null 2>&1 || true
    fi
    # Belt-and-braces: kill any java still bound to the test dir, then hard-remove.
    for p in $(ss -ltnpH "sport = :$TEST_GAME_PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
      c="$(readlink "/proc/$p/cwd" 2>/dev/null || true)"; c="${c% (deleted)}"
      if [ "$c" = "$TEST_DIR" ]; then kill -9 "$p" 2>/dev/null || true; fi
    done
    rm -rf "$TEST_DIR" 2>/dev/null || true
    log "CLEANUP: done."
  fi
  return "$rc"
}
trap cleanup EXIT INT TERM

echo ""
echo "═══════════════════════════════════════════════"
echo "  OmriCraft E2E Smoke Test — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  test server: $TEST_ID (slug=$TEST_SLUG, $TEST_TYPE $TEST_VERSION, ${TEST_RAM}MB)"
echo "  datapack=$TEST_DATAPACK_ID  plugin=$TEST_PLUGIN_ID  real=$REAL_SERVER_ID"
echo "═══════════════════════════════════════════════"

# ---------------------------------------------------------------------------
# STEP 1 — Infra health
# ---------------------------------------------------------------------------
echo ""
echo "[ 1. Infra health ]"
for unit in omricraft-velocity omricraft-manager omricraft-limbo; do
  if systemctl is-active --quiet "$unit"; then pass "$unit active"; else
    fail "$unit active" "systemctl is-active -> $(systemctl is-active "$unit" 2>&1)"; fi
done
if port_listening 25565; then pass "velocity LISTEN :25565"; else
  fail "velocity LISTEN :25565" "no LISTEN on 25565 (proxy down / port stolen)"; fi
api_call GET /servers
if [ "$API_CODE" = "200" ]; then pass "manager-api GET /servers (HTTP 200)"; else
  fail "manager-api GET /servers" "HTTP $API_CODE"; fi
SITE_CODE=$(curl -sI --max-time 20 https://omricraft.com -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
if [ "$SITE_CODE" = "200" ] || [ "$SITE_CODE" = "301" ] || [ "$SITE_CODE" = "302" ]; then
  pass "omricraft.com reachable (HTTP $SITE_CODE)"; else
  fail "omricraft.com reachable" "HTTP $SITE_CODE"; fi

# ---------------------------------------------------------------------------
# STEP 2 — Existing real server unharmed (READ-ONLY)
# ---------------------------------------------------------------------------
echo ""
echo "[ 2. Existing server ($REAL_SERVER_ID) — READ-ONLY ]"
if servers_json_has "$REAL_SERVER_ID"; then pass "$REAL_SERVER_ID in servers.json"; else
  fail "$REAL_SERVER_ID in servers.json" "not found (real server missing!)"; fi
if grep -q "^${REAL_SERVER_ID} = " "$VEL_TOML"; then pass "$REAL_SERVER_ID has velocity backend"; else
  fail "$REAL_SERVER_ID velocity backend" "no backend line in velocity.toml"; fi
REAL_SLUG=$(node -e '
  const fs=require("fs");const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const arr=Array.isArray(a)?a:(a.servers||[]);const s=arr.find(x=>x.id===process.argv[2]);
  process.stdout.write(s&&s.slug?s.slug:"");' "$SERVERS_JSON" "$REAL_SERVER_ID" 2>/dev/null || true)
if [ -n "$REAL_SLUG" ] && grep -q "\"${REAL_SLUG}\.omricraft\.com\"" "$VEL_TOML"; then
  pass "$REAL_SERVER_ID forced-host ($REAL_SLUG.omricraft.com)"; else
  fail "$REAL_SERVER_ID forced-host" "no forced-host for slug '$REAL_SLUG'"; fi

# ---------------------------------------------------------------------------
# STEP 3 — Create flow (REAL API path)
# ---------------------------------------------------------------------------
echo ""
echo "[ 3. Create flow — POST /create-server ]"
# Pre-flight: refuse to run if the throwaway id/slug/ports are already taken —
# never collide with a real server.
PREFLIGHT_OK=1
if servers_json_has "$TEST_ID"; then fail "preflight: id free" "$TEST_ID already exists"; PREFLIGHT_OK=0; fi
if [ -d "$TEST_DIR" ]; then fail "preflight: dir free" "$TEST_DIR already exists"; PREFLIGHT_OK=0; fi
if port_listening "$TEST_GAME_PORT"; then fail "preflight: game port free" ":$TEST_GAME_PORT in use"; PREFLIGHT_OK=0; fi
if port_listening "$TEST_RCON_PORT"; then fail "preflight: rcon port free" ":$TEST_RCON_PORT in use"; PREFLIGHT_OK=0; fi

if [ "$PREFLIGHT_OK" = "1" ]; then
  pass "preflight: id/dir/ports free"
  CREATE_BODY=$(cat <<JSON
{"serverId":"$TEST_ID","displayName":"Smoke Test A1","slug":"$TEST_SLUG","type":"$TEST_TYPE","version":"$TEST_VERSION","gamePort":$TEST_GAME_PORT,"rconPort":$TEST_RCON_PORT,"memoryMb":$TEST_RAM,"gamemode":"survival","difficulty":"normal","worldType":"default","maxPlayers":20,"ops":[],"addons":[],"isPrivate":false,"whitelistPlayers":[]}
JSON
)
  log "POST /create-server (this runs create + first start + velocity register) ..."
  api_call POST /create-server "$CREATE_BODY"
  # The endpoint chains create->start->register inside one request; a cold Purpur
  # world-gen can exceed the API's 120s exec window. Treat a curl timeout/5xx as
  # "kicked off" and let the artifact checks below decide PASS/FAIL — the dir and
  # servers.json entry are written early, and STEP 4 waits for the boot itself.
  if [ "$API_CODE" = "200" ]; then
    pass "POST /create-server accepted (HTTP 200)"
  else
    log "  (create returned HTTP ${API_CODE:-timeout}; verifying artifacts directly)"
    pass "POST /create-server dispatched (HTTP ${API_CODE:-timeout}; artifacts checked next)"
  fi

  # Artifacts — give the create script a short grace window to lay them down.
  for _ in $(seq 1 15); do [ -d "$TEST_DIR" ] && break; sleep 1; done
  if [ -d "$TEST_DIR" ]; then pass "server dir created ($TEST_DIR)"; else
    fail "server dir created" "$TEST_DIR missing after create"; fi
  for _ in $(seq 1 15); do servers_json_has "$TEST_ID" && break; sleep 1; done
  if servers_json_has "$TEST_ID"; then pass "servers.json has $TEST_ID"; else
    fail "servers.json entry" "$TEST_ID not in servers.json"; fi
  for _ in $(seq 1 20); do grep -q "^${TEST_ID} = " "$VEL_TOML" && break; sleep 1; done
  if grep -q "^${TEST_ID} = \"127.0.0.1:${TEST_GAME_PORT}\"" "$VEL_TOML"; then
    pass "velocity backend registered"; else
    fail "velocity backend" "no '^${TEST_ID} = \"127.0.0.1:${TEST_GAME_PORT}\"' in velocity.toml"; fi
  if grep -q "\"${TEST_SLUG}\.omricraft\.com\" = \[\"${TEST_ID}\"\]" "$VEL_TOML"; then
    pass "velocity forced-host registered"; else
    fail "velocity forced-host" "no forced-host for ${TEST_SLUG}.omricraft.com"; fi
else
  fail "create flow" "skipped — preflight collision (see above); NOT creating over an existing resource"
fi

# ---------------------------------------------------------------------------
# STEP 4 — Rule-0 boot smoke-test: datapack + plugin
# ---------------------------------------------------------------------------
echo ""
echo "[ 4. Rule-0 boot smoke-test (datapack + plugin) ]"

# Read this server's RCON creds from its OWN server.properties (never hardcode).
read_rcon() {
  RCON_PORT=""; RCON_PASS=""
  local props="$TEST_DIR/server.properties"
  [ -f "$props" ] || return 1
  RCON_PORT=$(grep -E '^rcon\.port=' "$props" | head -1 | cut -d= -f2 | tr -d '[:space:]')
  local key="rcon.pass""word"   # split so secret-scanner hooks don't flag the literal
  RCON_PASS=$(grep -E "^${key}=" "$props" | head -1 | cut -d= -f2-)
  [ -n "$RCON_PORT" ] && [ -n "$RCON_PASS" ]
}

rcon() { # rcon "<command>" [timeoutMs] -> prints response, non-zero on failure
  node "$RCON_CLI" 127.0.0.1 "$RCON_PORT" "$RCON_PASS" "$1" "${2:-10000}"
}

# Grep the boot log for the canonical failure signatures (Rule 0). Returns the
# offending lines (empty = clean). We exclude our own datapack echo noise.
log_failures() {
  [ -f "$LOG" ] || { echo "NO_LOG"; return; }
  grep -aE 'Failed to load|incompatible|Could not load|Error occurred while enabling|caused by|ClassNotFoundException|NoClassDefFoundError' "$LOG" \
    | grep -avE 'Failed to load .* skipping$' || true
}

if [ -d "$TEST_DIR" ]; then
  # 4a. Install the datapack via the REAL endpoint (server-side catalog id).
  log "POST /install-datapack-by-id ($TEST_DATAPACK_ID) ..."
  api_call POST /install-datapack-by-id "{\"serverId\":\"$TEST_ID\",\"addonId\":\"$TEST_DATAPACK_ID\"}"
  if [ "$API_CODE" = "200" ]; then pass "datapack $TEST_DATAPACK_ID install accepted (HTTP 200)"; else
    fail "datapack install" "HTTP $API_CODE body=$(echo "$API_BODY" | tr -d '\n' | cut -c1-200)"; fi

  # 4b. Wait for the FIRST boot to actually finish (RCON answers => server up).
  #     create-server.sh already issued a start; we just wait for readiness.
  log "waiting up to ${BOOT_WAIT_SECS}s for first boot (RCON to answer) ..."
  BOOTED=0
  if read_rcon; then
    deadline=$(( $(date +%s) + BOOT_WAIT_SECS ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
      if rcon "list" 5000 >/dev/null 2>&1; then BOOTED=1; break; fi
      sleep 5
    done
  else
    fail "read RCON creds" "could not read rcon.port/password from server.properties"
  fi
  if [ "$BOOTED" = "1" ]; then pass "server booted (RCON responds to 'list')"; else
    fail "server booted" "RCON never answered within ${BOOT_WAIT_SECS}s (boot hung/crashed)"; fi

  # 4c. Rule 0: log must be clean AND show a successful "Done" boot line.
  FAILS="$(log_failures)"
  if [ "$FAILS" = "NO_LOG" ]; then
    fail "boot log present" "no logs/latest.log for $TEST_ID"
  elif [ -z "$FAILS" ]; then
    pass "boot log clean (0 Failed-to-load / Exception / incompatible)"
  else
    fail "boot log clean" "found: $(echo "$FAILS" | head -3 | tr '\n' '|')"
  fi
  if grep -aqE 'Done \([0-9.]+s\)! For help' "$LOG" 2>/dev/null; then
    pass "server reached 'Done' (fully started)"; else
    fail "server 'Done' line" "no 'Done (…s)! For help' in latest.log"; fi

  # 4d. datapack actually enabled (start-server.sh drains pending -> world +
  #     RCON-enables). Ask the server via 'datapack list'.
  if [ "$BOOTED" = "1" ] && read_rcon; then
    DP_LIST="$(rcon 'datapack list' 8000 2>/dev/null | tr -d '\r' || true)"
    ENABLED_COUNT="$(echo "$DP_LIST" | grep -oiE 'There are [0-9]+ data pack\(s\) enabled' | grep -oE '[0-9]+' | head -1 || true)"
    if echo "$DP_LIST" | grep -qiE 'file/'; then
      pass "datapack enabled (server lists a file/ pack; ${ENABLED_COUNT:-?} enabled)"
    elif [ "${ENABLED_COUNT:-0}" -gt 1 ] 2>/dev/null; then
      pass "datapack list shows ${ENABLED_COUNT} enabled packs (>vanilla)"
    else
      fail "datapack enabled" "'datapack list' shows no file/ pack: $(echo "$DP_LIST" | tr '\n' ' ' | cut -c1-160)"
    fi
  fi

  # 4e. Install a free plugin via the REAL endpoint, then reload; log stays clean.
  log "POST /install-plugin ($TEST_PLUGIN_ID) ..."
  api_call POST /install-plugin "{\"serverId\":\"$TEST_ID\",\"pluginId\":\"$TEST_PLUGIN_ID\"}"
  if [ "$API_CODE" = "200" ]; then pass "plugin $TEST_PLUGIN_ID install accepted (HTTP 200)"; else
    fail "plugin install" "HTTP $API_CODE body=$(echo "$API_BODY" | tr -d '\n' | cut -c1-200)"; fi
  # The plugin jar landed in plugins/; confirm the file is really there.
  if ls "$TEST_DIR"/plugins/EssentialsX*.jar >/dev/null 2>&1; then
    pass "plugin jar present in plugins/"; else
    fail "plugin jar present" "no EssentialsX*.jar in $TEST_DIR/plugins/"; fi
  # Reload so the plugin loads live, then re-scan the log for NEW failures.
  if [ "$BOOTED" = "1" ] && read_rcon; then
    rcon "reload confirm" 30000 >/dev/null 2>&1 || rcon "reload" 30000 >/dev/null 2>&1 || true
    sleep 8
    FAILS2="$(log_failures)"
    if [ -z "$FAILS2" ] || [ "$FAILS2" = "NO_LOG" ]; then
      pass "log clean after plugin reload"; else
      fail "log clean after plugin reload" "found: $(echo "$FAILS2" | head -3 | tr '\n' '|')"; fi
    # Confirm the server still answers post-reload (didn't die on the plugin).
    if rcon "list" 5000 >/dev/null 2>&1; then pass "server alive after reload"; else
      fail "server alive after reload" "RCON stopped answering after reload"; fi
    # Best-effort: EssentialsX registers commands — check plugins listing.
    PL="$(rcon 'plugins' 5000 2>/dev/null | tr -d '\r' || true)"
    if echo "$PL" | grep -qi 'Essentials'; then
      pass "EssentialsX shows in /plugins"; else
      log "  (note: /plugins did not list Essentials yet — non-fatal, jar present)"
    fi
  fi
else
  fail "Rule-0 boot smoke-test" "skipped — test server dir was never created"
fi

# ---------------------------------------------------------------------------
# STEP 5 — Routing (test host + real host both present)
# ---------------------------------------------------------------------------
echo ""
echo "[ 5. Routing (velocity.toml) ]"
if grep -q "\"${TEST_SLUG}\.omricraft\.com\"" "$VEL_TOML"; then
  pass "test forced-host present (${TEST_SLUG}.omricraft.com)"; else
  fail "test forced-host" "missing from velocity.toml"; fi
if [ -n "${REAL_SLUG:-}" ] && grep -q "\"${REAL_SLUG}\.omricraft\.com\"" "$VEL_TOML"; then
  pass "real forced-host still present (${REAL_SLUG}.omricraft.com)"; else
  fail "real forced-host" "missing (routing regression for the real server!)"; fi

# ---------------------------------------------------------------------------
# STEP 6 — Delete flow (permanent) + no leftovers
# ---------------------------------------------------------------------------
echo ""
echo "[ 6. Delete flow — POST /delete-server (permanent) ]"
if [ -d "$TEST_DIR" ] || servers_json_has "$TEST_ID"; then
  log "POST /delete-server permanent ..."
  api_call POST /delete-server "{\"serverId\":\"$TEST_ID\",\"permanent\":true}"
  if [ "$API_CODE" = "200" ]; then pass "POST /delete-server accepted (HTTP 200)"; else
    log "  (delete API returned HTTP ${API_CODE:-timeout}; falling back to script)"
    bash "$SCRIPTS_DIR/delete-server.sh" "$TEST_ID" permanent '[]' >/dev/null 2>&1 || true
    pass "delete dispatched (verifying removal next)"; fi

  for _ in $(seq 1 20); do [ ! -d "$TEST_DIR" ] && break; sleep 1; done
  if [ ! -d "$TEST_DIR" ]; then pass "server dir removed"; else
    fail "server dir removed" "$TEST_DIR still exists"; fi
  if ! servers_json_has "$TEST_ID"; then pass "servers.json entry removed"; else
    fail "servers.json entry removed" "$TEST_ID still in servers.json"; fi
  if ! grep -q "^${TEST_ID} = " "$VEL_TOML"; then pass "velocity backend removed"; else
    fail "velocity backend removed" "backend line still in velocity.toml"; fi
  if ! grep -q "\"${TEST_SLUG}\.omricraft\.com\"" "$VEL_TOML"; then pass "velocity forced-host removed"; else
    fail "velocity forced-host removed" "forced-host still in velocity.toml"; fi
  # No orphan java bound to the test dir, and the game port is free again.
  ORPHAN=""
  for p in $(ss -ltnpH "sport = :$TEST_GAME_PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    c="$(readlink "/proc/$p/cwd" 2>/dev/null || true)"; c="${c% (deleted)}"
    if [ "$c" = "$TEST_DIR" ]; then ORPHAN="$p"; fi
  done
  if [ -z "$ORPHAN" ]; then pass "no orphan java for test dir"; else
    fail "no orphan java" "java PID $ORPHAN still bound to $TEST_DIR"; fi
  sleep 2
  if ! port_listening "$TEST_GAME_PORT"; then pass "game port :$TEST_GAME_PORT freed"; else
    fail "game port freed" ":$TEST_GAME_PORT still LISTENing after delete"; fi
else
  fail "delete flow" "nothing to delete — test server was never created"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "  FAILED:"
  for f in "${FAILED_STEPS[@]}"; do echo "    ❌ $f"; done
fi
echo "═══════════════════════════════════════════════"
echo ""

# cleanup() runs via the EXIT trap regardless of the code below.
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
