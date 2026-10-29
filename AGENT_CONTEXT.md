# Agent Context — Claude Code Local
_Last updated: 2026-10-29 — M1 built (branch build/m1-m4); M2 in progress._

## What This Project Is
A VS Code extension that copies the structure of the official Claude Code extension (`Anthropic.claude-code`), for a closed Windows machine: Hebrew RTL UI, the CLI talking to a local model server, zero npm dependencies, plain CommonJS, no build step. A sibling of claude-gui (`..\claude-gui`), sharing no code with it.

## Current State
- M1 is built: manifest, `extension.js`, CLI process, chat webview, opening and placement, fake CLI, two test files. Verified statically only (see Gotchas).
- M2 is in progress: `src/context/*` and `src/mcp/*` already exist in the tree and are not part of M1.
- spec.md is unchanged (user constraint), so its M1 sections still say "planned". Update them to "as built" when the user allows.
- The 11 commands for M2-M4 are Hebrew stubs in `src/placeholders.js`, along with a placeholder sessions view. Replace the stubs as each milestone lands.

## Entry Points
- `package.json` (manifest), `extension.js` (`activate` / `deactivate`).
- Services passed to each `register(context, services)`: logger, registry, events emitter, hooks `{beforePermission, controlHandlers, sendContext, initializePayload}`, `webviewHandlers`. M2 and M3 plug in through the hooks.

## Key Patterns
- One folder per feature under `src/` and `webview/`; `extension.js` only calls each feature's `register`.
- One CLI process per conversation (`src/panels/conversation.js` owns it), stream-json plus control protocol over stdio.
- Webviews: strict CSP with a nonce, theme variables, `postMessage` protocol (spec table plus extras listed in CHANGELOG.md).

## Last Changes
- M1 added (2026-10-29), with deviations: extra files (`conversation.js`, `failures.js`, `markdown.js`, `panels/index.js`); extra message types; `set_max_thinking_tokens` for the thinking switch (unverified); `SECONDARY_SIDEBAR_VERSION = 1.106` is a guess; `scripts/package.ps1` deferred to M4. Details in CHANGELOG.md.

## Next Steps
1. Finish M2 (editor context, in-process MCP tools); capture real `mcp_message` first.
2. M3 native diff review.
3. M4 sessions list, walkthrough, terminal mode, IDE WebSocket server, `scripts/package.ps1`.
4. Update spec.md sections to "as built" once permitted.

## Gotchas / Watch Out
- No Node.js, VS Code or `claude` CLI on this machine. M1 was checked with a headless-Edge V8 syntax checker (`msedge --headless --dump-dom`). Run `node --test test/` on a machine with Node; `test/process.test.js` has never been run.
- Never reuse the official ids (`claude-vscode.*`, `claudeCode.*`): both extensions may be installed together.
- The `mcp_message` and `ide` WebSocket formats are not documented; capture them from the real CLI before M2/M4.
- Unverified guesses: the secondary-sidebar version threshold, `set_max_thinking_tokens`, and the `initialize` field name for SDK MCP servers.

## Manual check-list per milestone
### M1 (run in the Extension Development Host, first against `dev/fake-claude.cmd`, then the real CLI)
- [ ] `node --test test/` passes on a Node machine.
- [ ] Open a tab, the sidebar view and the status bar item.
- [ ] Ctrl+Esc and Ctrl+Shift+Esc behave per the `when` clauses (focus, blur, open).
- [ ] A reply streams; the stop button interrupts it.
- [ ] A permission card appears and Allow/Deny work; the tab dot changes.
- [ ] Reload the window: the tab is restored with `--resume`.
- [ ] The module-script nonce is inherited under the CSP (webview JS loads).
- [ ] The secondary-sidebar version threshold is correct on old and new VS Code.
