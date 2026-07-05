#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

UNIT="omricraft-velocity.service"

echo "[$(date)] Reloading Velocity..."
# Prefer systemd (the proxy's real owner). The old manual stop+start raced
# systemd's Restart=always and could deadlock on :25565 (2026-07-05 incident).
# Restarting through the unit lets ONE supervisor serialize stop+start.
if command -v systemctl >/dev/null 2>&1 && systemctl cat "$UNIT" >/dev/null 2>&1; then
  echo "[$(date)] Restarting via systemd ($UNIT)..."
  sudo -n systemctl restart "$UNIT" || systemctl restart "$UNIT"
else
  echo "[$(date)] systemd unit not found — manual restart fallback."
  bash "$SCRIPTS_DIR/restart-velocity.sh"
fi
echo "[$(date)] Velocity reload complete."
