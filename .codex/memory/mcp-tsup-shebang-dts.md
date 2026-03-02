## MCP package: tsup + shebang breaks `*.d.ts`

If the MCP server entrypoint TypeScript file starts with a Node shebang (`#!/usr/bin/env node`), `tsup --dts` can emit a `dist/index.d.ts` that contains the shebang (and nothing else), which is invalid TypeScript syntax and breaks consumers.

Fix: remove the shebang from `src/index.ts` and add it back to `dist/index.js` in a post-build step (also `chmod +x`), e.g. `packages/analogresearch-mcp/scripts/add-shebang.mjs`.

