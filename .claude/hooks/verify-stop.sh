#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD="${1-}"

# If a JSON payload is passed (Codex notify hooks), only run on terminal turn events.
if [[ -n "$PAYLOAD" ]]; then
  EVENT_TYPE="$({
    python3 - "$PAYLOAD" <<'PY'
import json
import sys

raw = sys.argv[1] if len(sys.argv) > 1 else ""
if not raw:
    print("")
    raise SystemExit(0)

try:
    payload = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)

value = payload.get("type", "")
print(value if isinstance(value, str) else "")
PY
  } || true)"

  case "$EVENT_TYPE" in
    ""|"agent-turn-complete"|"stop")
      ;;
    *)
      exit 0
      ;;
  esac
fi

# Skip if no code changes have been made
if git -C "$CLAUDE_PROJECT_DIR" diff --quiet HEAD && \
   git -C "$CLAUDE_PROJECT_DIR" diff --cached --quiet HEAD && \
   [ -z "$(git -C "$CLAUDE_PROJECT_DIR" ls-files --others --exclude-standard)" ]; then
  exit 0
fi

# Context7 gate: blocks stop until spec-compliance checks are documented.
# Agents cannot stop until Context7 checks are resolved. Exit 2 = blocking (stderr shown to agent).
"$SCRIPT_DIR/context7-gate.sh" || exit 2

# Quality gates (lint, typecheck, tests, build)
exec "$SCRIPT_DIR/run-quality-gates.sh" --changed
