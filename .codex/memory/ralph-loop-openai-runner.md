# Ralph loops: OpenAI Codex runner pattern

If you want a “Ralph loop” driven by **OpenAI Codex** (instead of Claude), create a new loop directory and have its runner call `codex exec`.

Example pattern (used in this repo):

- `scripts/ralph-agentic-parity-openai/ralph.sh` calls:
  - `codex exec -C <repo> -m gpt-5.2 -c 'model_reasoning_effort="high"' -s workspace-write < CODEX.md`

Key points:

- Keep each loop in its own `scripts/ralph-*/` directory with its own `prd.json`, prompt file (`CODEX.md`), and `progress.txt`.
- Avoid `--dangerously-bypass-approvals-and-sandbox` by default; prefer `-s workspace-write` and tighten further when possible.
- Enable `--search` only when a story requires real-time web research.
