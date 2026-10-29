# Agent Context — Claude Code Local
_Last updated: 2026-10-29 — repo created, spec written, no code yet._

## What This Project Is
A VS Code extension that copies the structure of the official Claude Code extension (`Anthropic.claude-code`), for a closed Windows machine: Hebrew RTL UI, the CLI talking to a local model server, zero npm dependencies, plain CommonJS, no build step. A sibling of claude-gui (`..\claude-gui`), sharing no code with it.

## Current State
- spec.md is the full plan (sections are "planned").
- No code exists yet. Next: milestone M1.

## Entry Points (planned)
- `package.json` (the manifest), `extension.js` (`activate` / `deactivate`).

## Key Patterns (planned)
- One folder per feature under `src/` and `webview/`; `extension.js` only calls each feature's `register(context, services)`.
- One CLI process per conversation, stream-json + control protocol over stdio.
- Webviews: strict CSP with a nonce, theme variables, `postMessage` protocol from spec.md.

## Next Steps
1. M1 — manifest, CLI process, chat webview, opening & placement.
2. M2 — editor context and in-process MCP tools.
3. M3 — native diff review.
4. M4 — sessions list, walkthrough, terminal mode, IDE WebSocket server.

## Gotchas / Watch Out
- VS Code is not installed on the machine the spec was written on; Extension Host checks must run where it is.
- `node` is not on the Git Bash PATH here; run Node from PowerShell.
- The `mcp_message` and `ide` WebSocket formats are not documented — capture them from the real CLI before M2/M4.
- Never reuse the official ids (`claude-vscode.*`, `claudeCode.*`): both extensions may be installed together.

## Manual check-list per milestone
- (filled in when each milestone is built)
