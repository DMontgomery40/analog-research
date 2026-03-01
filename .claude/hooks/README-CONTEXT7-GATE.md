# Context7 Gate

The **Context7 gate** blocks agents (Claude, Codex) from stopping until they have run spec-compliance checks via Context7 MCP and documented findings.

## When it runs

- **Claude (Cursor)**: On Stop hook (before agent can reply/complete)
- **Codex**: On `agent-turn-complete` or `stop` notify events
- **Manually**: `pnpm verify:stop` or `bash .claude/hooks/verify-stop.sh`

## What it checks

If you have **any changes anywhere in the codebase** (staged, unstaged, or untracked), the gate requires:

1. **Context7 MCP** to be installed and available
2. **Evidence file** `.codex/ralph-audit/audit/SPEC-COMPLIANCE-FINDINGS.md` to exist
3. The file must contain "Context7" (audit method)
4. The file must be newer than your changes (or updated in last 24h for new files)

## How to pass

1. Use Context7 MCP tools (`resolve-library-id`, `query-docs`) for libraries your changes use (Next.js, Supabase, MCP SDK, etc.)
2. Document findings in `SPEC-COMPLIANCE-FINDINGS.md`
3. Include "Context7" in the document
4. Re-run the stop hook

The gate uses **exit 2** (blocking) and writes all messages to **stderr** so the agent receives clear feedback and cannot stop until the checks pass.

## Installing Context7 MCP

### Cursor

1. **Settings** → **Cursor Settings** → **MCP** → **Add new global MCP server**
2. Or add to `~/.cursor/mcp.json` or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

Optional: add `"--api-key", "YOUR_CONTEXT7_API_KEY"` to `args` for higher rate limits.

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
startup_timeout_ms = 20_000
```

Optional: add `"--api-key", "YOUR_CONTEXT7_API_KEY"` to `args`.

### Claude Code

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

## Bypass (not recommended)

If you have no changes (clean working tree), the gate exits 0 and does not block.
