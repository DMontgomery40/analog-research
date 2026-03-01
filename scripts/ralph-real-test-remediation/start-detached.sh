#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/ralph.pid" ]]; then
  pid="$(cat "$SCRIPT_DIR/ralph.pid" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[ralph] already running pid=$pid"
    exit 0
  fi
fi

export CODEX_INTERNAL_ORIGINATOR_OVERRIDE="${CODEX_INTERNAL_ORIGINATOR_OVERRIDE:-Codex Desktop}"
export CODEX_MODEL="${CODEX_MODEL:-gpt-5.3-codex}"
export CODEX_REASONING_EFFORT="${CODEX_REASONING_EFFORT:-high}"
export CODEX_FALLBACK_MODEL="${CODEX_FALLBACK_MODEL:-gpt-5.2-codex}"

# Detach so the loop survives chat/tool interruptions.
nohup "$SCRIPT_DIR/ralph.sh" "$@" > "$SCRIPT_DIR/runner.log" 2>&1 &
echo $! > "$SCRIPT_DIR/ralph.pid"

echo "[ralph] started pid=$(cat "$SCRIPT_DIR/ralph.pid")"
echo "[ralph] runner log: $SCRIPT_DIR/runner.log"
echo "[ralph] agent log:  $SCRIPT_DIR/run.log"

