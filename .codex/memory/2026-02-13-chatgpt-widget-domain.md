# ChatGPT MCP widget domain requirement (2026-02-13)

## Symptom
ChatGPT App submission shows: “Widget domain is not set for this template. A unique domain is required for app submission.”

## Root cause
MCP UI templates (`ui://analoglabor/*`) were missing `_meta.ui.domain` in the resource metadata.

## Fix
Set `_meta.ui.domain` on each widget template (in `apps/web/src/lib/mcp/chatgpt-resources.ts`) using `MCP_WIDGET_DOMAIN` or a fallback to `NEXT_PUBLIC_SITE_URL`.

## Notes
OpenAI docs require a unique widget domain per app; ChatGPT renders widgets under `<domain>.web-sandbox.oaiusercontent.com`.
