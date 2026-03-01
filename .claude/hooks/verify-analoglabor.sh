#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HOOKS_DIR/verify-stop.sh" "${1-}"
