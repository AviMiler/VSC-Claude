# Agent Context — Claude Code Local
_Last updated: 2026-10-29 — M1 built (manifest, CLI process, chat webview, tab/sidebar/status bar)._

## What This Project Is
A VS Code extension that copies the structure of the official Claude Code extension (`Anthropic.claude-code`), for a closed Windows machine: Hebrew RTL UI, the CLI talking to a local model server, zero npm dependencies, plain CommonJS, no build step. Installed by copying the repo folder into VS Code's extensions folder (no VSIX). A sibling of claude-gui (`..\claude-gui`), sharing no code with it.

## Current State
- M1 is built: `package.json`, `extension.js`, `src/cli/`, `src/panels/`, `src/util/`, `webview/chat/`, `resources/`, `dev/fake-claude.*`, `test/`.
- `npm test` (`node --test`): 18 tests pass, including host tests against `test/vscode-stub.js` + `dev/fake-claude.js`.
- Not yet run in a real VS Code. The protocol was checked against the real CLI 2.1.312 (spec.md "Claude Code process & protocol").

## Entry Points
- `package.json` (the manifest), `extension.js` (`activate` / `deactivate`).
- `src/panels/conversation.js` is the core: one conversation = one CLI process + thread ops + permission cards + webview messages.

## Key Patterns
- One folder per feature under `src/` and `webview/`; `extension.js` only calls each feature's `register…`.
- `src/cli/` never requires `vscode` (testable under plain Node).
- The host translates CLI output into thread ops (`event-translator.js`) and keeps them, so a recreated webview (sidebar) is rebuilt from `init.items`.
- A command is declared in `package.json` only in the milestone that implements it.
- Webviews: strict CSP with a nonce (+ `cspSource` for module imports), theme variables, `postMessage` protocol from spec.md.

## Next Steps
1. Check M1 by hand in VS Code (checklist below).
2. M2 — editor context and in-process MCP tools (capture the real `mcp_message` shape first).
3. M3 — native diff review.
4. M4 — sessions list (and showing old messages in restored tabs), walkthrough, onboarding, terminal mode, IDE WebSocket server.

## Gotchas / Watch Out
- VS Code is not installed where the code was written; Extension Host checks must run where it is.
- `node` is not on the Git Bash PATH on the user's machine; run Node from PowerShell. `dev/fake-claude.cmd` needs `node` on the PATH VS Code sees.
- CLI 2.1.312 lists `manual` instead of `default` in `--permission-mode` choices (`src/cli/args.js` maps it).
- The secondary-sidebar threshold (VS Code 1.106) is an assumption (`src/panels/sidebar-view.js`).
- The `mcp_message` and `ide` WebSocket formats are not documented — capture them from the real CLI before M2/M4.
- Never reuse the official ids (`claude-vscode.*`, `claudeCode.*`): both extensions may be installed together.

## Manual check-list per milestone
- M1 (in VS Code, with `claudeLocal.claudePath` = `<repo>\dev\fake-claude.cmd`, then the real CLI):
  - The ✻ icon shows in the secondary sidebar (or activity bar on older VS Code); the view opens and shows the Hebrew RTL chat.
  - Ctrl+Shift+Esc opens a tab; the status bar "✻ Claude" opens/focuses it; Ctrl+Esc moves focus between editor and Claude.
  - Send a message: the reply streams; "כתוב" shows a permission card, the tab and status bar show the waiting state, אישור continues.
  - Mode/model pickers, the stop button, `/` menu, pasted image.
  - Close a tab, Ctrl+Shift+T reopens it with the same session; reload the window: tabs come back.
  - "Show Logs" shows the stream-json lines.
