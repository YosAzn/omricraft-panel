#!/usr/bin/env bash
# Gate tests — run after every deploy to verify the system is healthy
# Exit 0 = all pass, Exit 1 = something failed

set -uo pipefail

BASE="/home/ubuntu/omricraft"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══════════════════════════════════"
echo "  OmriCraft Gate Tests — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════"

# Gate 1: Directory structure
echo ""
echo "[ Structure ]"
[ -d "$BASE/velocity" ]        && check "velocity dir"      "ok" || check "velocity dir"      "missing"
[ -d "$BASE/manager/scripts" ] && check "scripts dir"       "ok" || check "scripts dir"       "missing"
[ -d "$BASE/manager/manager-api" ] && check "manager-api dir" "ok" || check "manager-api dir" "missing"
[ -d "$BASE/templates/paper" ] && check "paper template dir" "ok" || check "paper template dir" "missing"
[ -f "$BASE/manager/.env" ]    && check ".env file"         "ok" || check ".env file"         "missing"

# Gate 2: Scripts
echo ""
echo "[ Scripts ]"
SCRIPTS=(create-server start-server stop-server delete-server register-server-in-velocity install-velocity start-velocity stop-velocity gate-tests)
for s in "${SCRIPTS[@]}"; do
  [ -x "$BASE/manager/scripts/${s}.sh" ] && check "${s}.sh" "ok" || check "${s}.sh" "missing or not executable"
done

# Gate 3: Velocity
echo ""
echo "[ Velocity ]"
[ -f "$BASE/velocity/velocity.jar" ]      && check "velocity.jar"      "ok" || check "velocity.jar"      "missing"
[ -f "$BASE/velocity/forwarding.secret" ] && check "forwarding.secret" "ok" || check "forwarding.secret" "missing"
[ -f "$BASE/velocity/velocity.toml" ]     && check "velocity.toml"     "ok" || check "velocity.toml"     "missing"

if [ -f "$BASE/velocity/velocity.pid" ]; then
  VEL_PID=$(cat "$BASE/velocity/velocity.pid")
  if kill -0 "$VEL_PID" 2>/dev/null; then
    check "velocity process" "ok"
  else
    check "velocity process" "pid file exists but process dead"
  fi
else
  check "velocity process" "not running (no pid file)"
fi

if ss -lntp 2>/dev/null | grep -q ':25565'; then
  check "port 25565 open" "ok"
else
  check "port 25565 open" "not listening"
fi

# Gate 4: Manager API
echo ""
echo "[ Manager API ]"
[ -f "$BASE/manager/manager-api/server.js" ]   && check "server.js"    "ok" || check "server.js"    "missing"
[ -d "$BASE/manager/manager-api/node_modules" ] && check "node_modules" "ok" || check "node_modules" "missing — run npm install"

if ss -lntp 2>/dev/null | grep -q ':3001'; then
  check "port 3001 listening" "ok"
  # Test API health (only if key available)
  if [ -f "$BASE/manager/.env" ]; then
    source "$BASE/manager/.env" 2>/dev/null || true
    if [ -n "${MANAGER_API_KEY:-}" ]; then
      HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $MANAGER_API_KEY" \
        http://127.0.0.1:3001/servers 2>/dev/null || echo "000")
      [ "$HTTP_STATUS" = "200" ] && check "API /servers responds" "ok" || check "API /servers responds" "HTTP $HTTP_STATUS"
    fi
  fi
else
  check "port 3001 listening" "not running"
fi

# Gate 5: servers.json
echo ""
echo "[ Servers JSON ]"
if [ -f "$BASE/manager/servers.json" ]; then
  check "servers.json exists" "ok"
  SERVER_COUNT=$(node -e "const a=JSON.parse(require('fs').readFileSync('$BASE/manager/servers.json','utf8')); console.log(a.length)" 2>/dev/null || echo "parse error")
  echo "  ℹ️  Active servers: $SERVER_COUNT"
else
  check "servers.json exists" "not found (will be created on first server)"
fi

# Gate 6: Endpoint presence in server.js (catches wholesale-rewrite drops — root cause #3)
# A full rewrite of server.js can silently drop a route with NO red diff line.
# This is what made /players vanish (commit 2929e91) and stuck servers on "starting".
# If any core route string is missing from the deployed server.js, FAIL the deploy.
echo ""
echo "[ Endpoint presence ]"
SRV="$BASE/manager/manager-api/server.js"
REQUIRED_ROUTES=(
  "/server-status/" "/create-server" "/delete-server" "/servers"
  "/start-server" "/stop-server" "/restart-server" "/send-command"
  "/players" "/set-whitelist" "/install-plugin" "/remove-plugin"
  "/change-difficulty" "/update-ops" "/update-server-properties"
  "/list-files" "/read-file" "/write-file" "/install-datapack" "/read-log"
)
if [ -f "$SRV" ]; then
  for route in "${REQUIRED_ROUTES[@]}"; do
    if grep -qF "'$route" "$SRV" || grep -qF "\"$route" "$SRV"; then
      check "route $route" "ok"
    else
      check "route $route" "MISSING from server.js — regression!"
    fi
  done
else
  check "server.js readable for route check" "file not found"
fi

# Summary
echo ""
echo "═══════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════"
echo ""

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
