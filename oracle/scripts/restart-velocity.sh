#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date)] Restarting Velocity..."
bash "$SCRIPTS_DIR/stop-velocity.sh"
sleep 3
bash "$SCRIPTS_DIR/start-velocity.sh"
echo "[$(date)] Velocity restarted."
