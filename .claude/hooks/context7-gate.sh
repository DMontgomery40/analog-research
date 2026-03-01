#!/usr/bin/env bash
#
# Context7 gate: blocks agent stop until Context7 spec-compliance checks are done.
# Run when agents (Claude, Codex) attempt to stop/reply. Exit 2 blocks stop (stderr = feedback).
#
# Requires: Context7 MCP (resolve-library-id, query-docs) for libraries used in changes.
# Evidence: .codex/ralph-audit/audit/SPEC-COMPLIANCE-FINDINGS.md with Context7 audit.
#
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT_DIR" ]]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

cd "$ROOT_DIR"

EVIDENCE_FILE=".codex/ralph-audit/audit/SPEC-COMPLIANCE-FINDINGS.md"

collect_changed_files() {
  git diff --name-only --relative 2>/dev/null || true
  git diff --cached --name-only --relative 2>/dev/null || true
  git ls-files --others --exclude-standard 2>/dev/null || true
}

has_changes() {
  collect_changed_files | sort -u | grep -q .
}

evidence_is_valid() {
  [[ ! -f "$ROOT_DIR/$EVIDENCE_FILE" ]] && return 1
  # Must contain Context7 audit evidence
  grep -qi 'context7\|Context7' "$ROOT_DIR/$EVIDENCE_FILE" || return 1
  # Evidence must be newer than the newest change (re-audit after edits)
  local evidence_mtime
  evidence_mtime=$(stat -f %m "$ROOT_DIR/$EVIDENCE_FILE" 2>/dev/null || stat -c %Y "$ROOT_DIR/$EVIDENCE_FILE" 2>/dev/null || echo 0)
  local newest_change=0
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    [[ ! -e "$ROOT_DIR/$path" ]] && continue
    local fmtime
    fmtime=$(stat -f %m "$ROOT_DIR/$path" 2>/dev/null || stat -c %Y "$ROOT_DIR/$path" 2>/dev/null || echo 0)
    [[ $fmtime -gt $newest_change ]] && newest_change=$fmtime
  done < <(collect_changed_files | sort -u)
  # If no files on disk (e.g. new unstaged), require evidence from last 24h
  if [[ $newest_change -eq 0 ]]; then
    local now
    now=$(date +%s)
    [[ $((now - evidence_mtime)) -lt 86400 ]] # 24h
    return
  fi
  [[ $evidence_mtime -ge $newest_change ]]
}

log() {
  printf '\n[%s] %s\n' "context7-gate" "$1" >&2
}

if ! has_changes; then
  exit 0
fi

if evidence_is_valid; then
  log "PASS: Context7 spec-compliance check documented"
  exit 0
fi

log "BLOCKED: Context7 spec-compliance check required before stop"
log ""
log "You have changes anywhere in the codebase."
log "Before replying or stopping, you MUST:"
log ""
log "  1. Use Context7 MCP tools (resolve-library-id, query-docs) to verify"
log "     your changes against current specs for:"
log "     - Next.js, Supabase, MCP SDK, and any other libraries your changes use"
log ""
log "  2. Document findings in:"
log "     $EVIDENCE_FILE"
log ""
log "  3. Include 'Context7' in the document (audit method)."
log ""
log "If Context7 MCP is not available, add it:"
log "  - Cursor: Settings -> MCP -> Add context7"
log "  - Codex:  Add to ~/.codex/config.toml:"
log "    [mcp_servers.context7]"
log "    command = \"npx\""
log "    args = [\"-y\", \"@upstash/context7-mcp\"]"
log ""
log "See: .claude/hooks/README-CONTEXT7-GATE.md"
log ""
exit 2
