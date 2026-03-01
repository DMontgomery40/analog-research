#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---changed}"
if [[ "$MODE" != "--changed" && "$MODE" != "--full" ]]; then
  echo "Usage: $0 [--changed|--full]" >&2
  exit 2
fi

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT_DIR" ]]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

log() {
  printf '\n[%s] %s\n' "verify" "$1"
}
log_err() {
  printf '\n[%s] %s\n' "verify" "$1" >&2
}

run_step() {
  local label="$1"
  local command="$2"

  log "${label}: ${command}"
  if ! bash -lc "$command"; then
    log_err "FAILED: ${label}"
    exit 2
  fi
}

collect_changed_files() {
  local -a files=()

  while IFS= read -r file; do
    [[ -n "$file" ]] && files+=("$file")
  done < <(git diff --name-only --relative)

  while IFS= read -r file; do
    [[ -n "$file" ]] && files+=("$file")
  done < <(git diff --cached --name-only --relative)

  while IFS= read -r file; do
    [[ -n "$file" ]] && files+=("$file")
  done < <(git ls-files --others --exclude-standard)

  if [[ "${#files[@]}" -eq 0 ]]; then
    return 0
  fi

  printf '%s\n' "${files[@]}" | awk 'NF' | sort -u
}

should_run_build=false
if [[ "$MODE" == "--full" ]]; then
  should_run_build=true
else
  changed_files=()
  while IFS= read -r path; do
    [[ -n "$path" ]] && changed_files+=("$path")
  done < <(collect_changed_files)

  if [[ "${#changed_files[@]}" -eq 0 ]]; then
    log "No changed files detected; skipping build in --changed mode."
  else
    log "Changed files: ${#changed_files[@]}"
    for path in "${changed_files[@]}"; do
      case "$path" in
        apps/web/src/*|apps/web/package.json|apps/web/next.config.ts|apps/web/tsconfig.json|apps/web/postcss.config.mjs|apps/web/tailwind.config.ts|packages/*/src/*|packages/*/package.json|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|turbo.json|tsconfig.base.json)
          should_run_build=true
          break
          ;;
      esac
    done
  fi
fi

run_step "real-tests" "$SCRIPT_DIR/check-real-tests.sh"
run_step "no-mock-tests" "pnpm check:no-mock-tests"
run_step "lint" "pnpm lint"
run_step "typecheck" "pnpm typecheck"
run_step "hardcoded" "pnpm check:hardcoded $MODE"
run_step "duplicates" "pnpm check:duplicates $MODE"
run_step "ai-slop" "pnpm check:ai-slop $MODE"
run_step "risk-tests" "pnpm check:risk-tests $MODE"
run_step "migration-prefix" "pnpm check:migration-prefix"
run_step "realness-triad" "pnpm check:realness"
# Note: `pnpm --filter @analoglabor/web` executes inside `apps/web`, so a relative
# `VITEST_INTEGRATION_ENV_FILE=apps/web/.env.local` would not resolve correctly.
run_step "integration-tests-live" "RUN_INTEGRATION_TESTS=true VITEST_INTEGRATION_ENV_FILE=\"$ROOT_DIR/apps/web/.env.local\" pnpm --filter @analoglabor/web test"
run_step "tests" "pnpm test"

if [[ "$should_run_build" == true ]]; then
  run_step "build" "pnpm build"
else
  log "Skipping build (no build-impacting file changes detected)."
fi

log "PASS: all quality gates succeeded"
