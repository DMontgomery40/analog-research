#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[ralph] pid: $(cat "$SCRIPT_DIR/ralph.pid" 2>/dev/null || echo 'none')"
echo "[ralph] tailing: $SCRIPT_DIR/run.log"
exec tail -n 120 -F "$SCRIPT_DIR/run.log"

