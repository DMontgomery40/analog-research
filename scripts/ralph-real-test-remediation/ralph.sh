#!/bin/bash
# Ralph loop (OpenAI Codex) for real-test remediation.
# Usage: ./ralph.sh [max_iterations] [--regen-prd] [--search]

set -euo pipefail

MAX_ITERATIONS=30
MAX_ATTEMPTS_PER_STORY="${MAX_ATTEMPTS_PER_STORY:-8}"
REGEN_PRD="false"
ENABLE_SEARCH="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --regen-prd)
      REGEN_PRD="true"
      shift
      ;;
    --search)
      ENABLE_SEARCH="true"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
RUN_LOG="$SCRIPT_DIR/run.log"
ATTEMPTS_FILE="$SCRIPT_DIR/.story-attempts"
LAST_STORY_FILE="$SCRIPT_DIR/.last-story"

if [[ "$REGEN_PRD" == "true" || ! -f "$PRD_FILE" ]]; then
  echo "Generating PRD from current no-mock violations..."
  node "$SCRIPT_DIR/generate-prd.mjs" --batch-size "${REAL_TEST_BATCH_SIZE:-8}"
fi

if [[ ! -f "$ATTEMPTS_FILE" ]]; then
  echo "{}" > "$ATTEMPTS_FILE"
fi

if [[ ! -f "$PROGRESS_FILE" ]]; then
  {
    echo "# Ralph Real Test Remediation Progress"
    echo "Started: $(date)"
    echo "---"
  } > "$PROGRESS_FILE"
fi

TARGET_BRANCH="$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || true)"
if [[ -n "$TARGET_BRANCH" ]]; then
  cd "$REPO_ROOT"
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]]; then
    if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
      git checkout "$TARGET_BRANCH"
    else
      git checkout -b "$TARGET_BRANCH"
    fi
  fi
fi

get_current_story() {
  jq -r '.userStories[] | select(.passes==false) | .id' "$PRD_FILE" | head -1
}

get_story_attempts() {
  local story_id="$1"
  jq -r --arg id "$story_id" '.[$id] // 0' "$ATTEMPTS_FILE"
}

increment_story_attempts() {
  local story_id="$1"
  local current
  current="$(get_story_attempts "$story_id")"
  local next=$((current + 1))
  jq --arg id "$story_id" --argjson count "$next" '.[$id] = $count' "$ATTEMPTS_FILE" > "$ATTEMPTS_FILE.tmp"
  mv "$ATTEMPTS_FILE.tmp" "$ATTEMPTS_FILE"
  echo "$next"
}

echo "Starting Ralph real-test remediation loop (iterations: $MAX_ITERATIONS, attempts/story: $MAX_ATTEMPTS_PER_STORY)"

REQUESTED_MODEL="${CODEX_MODEL:-gpt-5.2}"
FALLBACK_MODEL="${CODEX_FALLBACK_MODEL:-gpt-5.2-codex}"
REASONING_EFFORT="${CODEX_REASONING_EFFORT:-high}"

MODEL_CHECK_LOG="$SCRIPT_DIR/.model-check.log"
if ! codex exec -C "$REPO_ROOT" -m "$REQUESTED_MODEL" -c "model_reasoning_effort=\"$REASONING_EFFORT\"" -s read-only "Respond with exactly: OK" > "$MODEL_CHECK_LOG" 2>&1; then
  if grep -q "model is not supported when using Codex with a ChatGPT account" "$MODEL_CHECK_LOG"; then
    REQUESTED_MODEL="$FALLBACK_MODEL"
  else
    echo "Model preflight failed. See $MODEL_CHECK_LOG"
    exit 1
  fi
fi

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "==============================================================="
  echo "" >> "$RUN_LOG"
  echo "===============================================================" >> "$RUN_LOG"
  echo "Ralph Iteration $i of $MAX_ITERATIONS - $(date)" >> "$RUN_LOG"
  echo "===============================================================" >> "$RUN_LOG"

  CURRENT_STORY="$(get_current_story)"

  if [[ -z "$CURRENT_STORY" ]]; then
    echo "No remaining stories in PRD. Running final real-system gates..."
    if bash -lc "pnpm check:no-mock-tests && pnpm check:realness"; then
      echo "<promise>COMPLETE</promise>"
      exit 0
    else
      echo "Final gates failed. Keep iterating after fixing blocking issues."
      exit 1
    fi
  fi

  LAST_STORY=""
  if [[ -f "$LAST_STORY_FILE" ]]; then
    LAST_STORY="$(cat "$LAST_STORY_FILE" 2>/dev/null || true)"
  fi

  if [[ "$CURRENT_STORY" == "$LAST_STORY" ]]; then
    ATTEMPTS="$(increment_story_attempts "$CURRENT_STORY")"
  else
    ATTEMPTS="$(increment_story_attempts "$CURRENT_STORY")"
  fi

  echo "$CURRENT_STORY" > "$LAST_STORY_FILE"

  if [[ "$ATTEMPTS" -gt "$MAX_ATTEMPTS_PER_STORY" ]]; then
    echo "Story $CURRENT_STORY exceeded max attempts ($ATTEMPTS)."
    jq --arg id "$CURRENT_STORY" '.userStories = [.userStories[] | if .id == $id then (.notes = "Blocked: exceeded max attempts") else . end]' "$PRD_FILE" > "$PRD_FILE.tmp"
    mv "$PRD_FILE.tmp" "$PRD_FILE"
    continue
  fi

  STORY_TITLE="$(jq -r --arg id "$CURRENT_STORY" '.userStories[] | select(.id==$id) | .title' "$PRD_FILE")"
  STORY_FILES_CSV="$(jq -r --arg id "$CURRENT_STORY" '.userStories[] | select(.id==$id) | (.files // []) | join(",")' "$PRD_FILE")"
  STORY_FILES_BULLETS="$(jq -r --arg id "$CURRENT_STORY" '.userStories[] | select(.id==$id) | (.files // [])[]' "$PRD_FILE" | sed 's/^/- /')"

  echo "Current story: $CURRENT_STORY - $STORY_TITLE (attempt $ATTEMPTS/$MAX_ATTEMPTS_PER_STORY)"

  PROMPT_FILE="$(mktemp)"
  {
    cat "$SCRIPT_DIR/CODEX.md"
    echo ""
    echo "Current story for this iteration:"
    echo "- ID: $CURRENT_STORY"
    echo "- Title: $STORY_TITLE"
    echo "- Batch files (CSV): $STORY_FILES_CSV"
    echo "- Batch files:"
    echo "$STORY_FILES_BULLETS"
    echo ""
    echo "Do only this story in this iteration."
  } > "$PROMPT_FILE"

  CODEX_ARGS=(
    exec
    -C "$REPO_ROOT"
    -m "$REQUESTED_MODEL"
    -c "model_reasoning_effort=\"$REASONING_EFFORT\""
    -s workspace-write
  )
  if [[ "$ENABLE_SEARCH" == "true" ]]; then
    CODEX_ARGS+=(--search)
  fi

  OUTPUT="$(codex "${CODEX_ARGS[@]}" "$(cat "$PROMPT_FILE")" 2>&1 | tee -a "$RUN_LOG")" || true
  rm -f "$PROMPT_FILE"

  STORY_PASSES="$(jq -r --arg id "$CURRENT_STORY" '.userStories[] | select(.id==$id) | .passes' "$PRD_FILE")"
  if [[ "$STORY_PASSES" == "true" ]]; then
    echo "Story $CURRENT_STORY marked complete."
  else
    echo "Story $CURRENT_STORY not yet complete."
  fi

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Agent signaled complete. Verifying PRD and global checks..."
    if [[ -z "$(get_current_story)" ]] && bash -lc "pnpm check:no-mock-tests && pnpm check:realness"; then
      echo "<promise>COMPLETE</promise>"
      exit 0
    fi
  fi

  sleep 2
done

echo "Reached max iterations without completion."
exit 1
