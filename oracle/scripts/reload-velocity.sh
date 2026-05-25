#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date)] Reloading Velocity (restart)..."
bash "$SCRIPTS_DIR/restart-velocity.sh"
echo "[$(date)] Velocity reload complete."
