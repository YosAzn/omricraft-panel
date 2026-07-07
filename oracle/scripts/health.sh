#!/usr/bin/env bash
# ===========================================================================
# health.sh — lightweight external health probe (cron every 5 min).
#
# WHY: the second outage was a STUCK service — velocity/manager was "running" as
# far as anyone knew, but nothing was actually listening, so users saw a dead
# server and no one was told. A cheap TCP probe from cron closes that gap: it
# proves the two front-door ports actually accept a connection, and shouts to a
# webhook the moment one doesn't. Pairs with the systemd OnFailure drop-in
# (monitoring/omricraft-velocity.service.d/) which catches crash-loops; this
# catches the "up but not listening / wedged" case that systemd can't see.
#
# WHAT IT CHECKS (both must pass):
#   * TCP :25565  — Velocity proxy (the Minecraft front door).
#   * TCP :3001   — Manager API (the website's control plane).
# On ANY failure it POSTs a short plaintext alert to $WEBHOOK_URL. Works with an
# ntfy topic URL or a Discord webhook (both accept a simple JSON/plain body).
#
# SAFE: read-only. Probes ports and (optionally) notifies. Never touches servers,
# velocity.toml, or systemd. Designed to be run non-interactively from cron.
#
# SETUP (run once, on the VPS — NOT shipped automatically, see monitoring/README.md):
#   1. Put your webhook URL in /home/ubuntu/omricraft/manager/.env as:
#        HEALTH_WEBHOOK_URL=https://ntfy.sh/your-private-topic
#      (or a Discord webhook URL). NEVER commit the real URL to the repo.
#   2. crontab -e  ->  add:
#        */5 * * * * /home/ubuntu/omricraft/manager/scripts/health.sh >> /home/ubuntu/omricraft/logs/health.log 2>&1
#
# Exit: 0 = all probes healthy, 1 = at least one probe failed (and alert sent).
# ===========================================================================

set -uo pipefail

BASE="/home/ubuntu/omricraft"
ENV_FILE="$BASE/manager/.env"

# Ports to probe: "label:port". Front-door only — the two that being down = outage.
PROBES=("velocity-proxy:25565" "manager-api:3001")

HOST="127.0.0.1"
CONNECT_TIMEOUT="${HEALTH_CONNECT_TIMEOUT:-5}"   # seconds per TCP probe

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] health: $*"; }

# ---- resolve webhook (from env; placeholder if unset — NEVER a real URL here) --
# Load .env if present (may define HEALTH_WEBHOOK_URL). We do NOT hardcode a URL:
# a real webhook is a secret and lives only in .env on the box, never in the repo.
WEBHOOK_URL=""
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE" 2>/dev/null || true
fi
WEBHOOK_URL="${HEALTH_WEBHOOK_URL:-<NTFY_OR_DISCORD_WEBHOOK>}"

# ---- TCP probe (no netcat dependency — use bash /dev/tcp) ------------------
# Returns 0 if a TCP connection to HOST:PORT succeeds within CONNECT_TIMEOUT.
tcp_ok() { # tcp_ok <port>
  local port="$1"
  timeout "$CONNECT_TIMEOUT" bash -c "exec 3<>/dev/tcp/$HOST/$port" 2>/dev/null
}

# ---- notify (Rule 6: fail loud) -------------------------------------------
# POST a short plaintext message. ntfy accepts the raw body as the notification;
# Discord expects JSON {"content":"..."} — send whichever matches the URL shape.
notify() { # notify "<message>"
  local msg="$1"
  if [ -z "$WEBHOOK_URL" ] || [ "$WEBHOOK_URL" = "<NTFY_OR_DISCORD_WEBHOOK>" ]; then
    log "WEBHOOK NOT CONFIGURED — would have alerted: $msg"
    return 0
  fi
  case "$WEBHOOK_URL" in
    *discord.com/api/webhooks/*|*discordapp.com/api/webhooks/*)
      curl -s --max-time 10 -H "Content-Type: application/json" \
        -d "{\"content\": \"$msg\"}" "$WEBHOOK_URL" >/dev/null 2>&1 \
        || log "WARN: Discord webhook POST failed"
      ;;
    *)
      # ntfy (and most generic webhooks): plaintext body is fine.
      curl -s --max-time 10 \
        -H "Title: OmriCraft health alert" \
        -H "Priority: high" \
        -H "Tags: warning" \
        -d "$msg" "$WEBHOOK_URL" >/dev/null 2>&1 \
        || log "WARN: webhook POST failed"
      ;;
  esac
}

# ---- --notify mode --------------------------------------------------------
# `health.sh --notify "<message>"` just fires the webhook and exits. Used by the
# systemd OnFailure handler (omricraft-notify@.service) so crash-loop alerts reuse
# THIS file's single webhook code path (one place reads the secret, one URL shape
# switch). No probing in this mode.
if [ "${1:-}" = "--notify" ]; then
  MSG="${2:-OmriCraft: a monitored unit entered a failed state.}"
  log "NOTIFY-ONLY: $MSG"
  notify "$MSG"
  exit 0
fi

# ---------------------------------------------------------------------------
FAILED=()
for probe in "${PROBES[@]}"; do
  label="${probe%%:*}"
  port="${probe##*:}"
  if tcp_ok "$port"; then
    log "OK   $label (:$port)"
  else
    log "DOWN $label (:$port)"
    FAILED+=("$label(:$port)")
  fi
done

if [ "${#FAILED[@]}" -eq 0 ]; then
  exit 0
fi

ALERT="OmriCraft DOWN: ${FAILED[*]} not accepting TCP on $(hostname) at $(date '+%Y-%m-%d %H:%M:%S'). Check: systemctl status omricraft-velocity omricraft-manager"
log "ALERTING: $ALERT"
notify "$ALERT"
exit 1
