# Agent Context — Claude Code Local
_Last updated: 2026-10-29 — M1 committed (994aee6), M2 built and verified (GO), M3 next (branch build/m1-m4)._

## What This Project Is
A VS Code extension that copies the structure of the official Claude Code extension (`Anthropic.claude-code`), for a closed Windows machine: Hebrew RTL UI, the CLI talking to a local model server, zero npm dependencies, plain CommonJS, no build step. A sibling of claude-gui (`..\claude-gui`), sharing no code with it.

## Current State
- M1 is committed (994aee6): manifest, `extension.js`, CLI process, chat webview, opening and placement, fake CLI, two test files.
- M2 is built, not yet committed; Stage 3 verdict GO. `src/context/*` (open file, selection, exclusions, `@` mentions, autosave), `src/mcp/*` (SDK MCP server `claude-local`, tools getDiagnostics/getOpenEditors), `webview/chat/mention-menu.js`, Alt+K `insertAtMention`. Verified statically only (see Gotchas).
- M3 is next. `src/diff/*`, `test/myers.test.js` and `test/proposed-content.test.js` already exist in the tree as M3 work in progress.
- spec.md is unchanged (user constraint), so the M1 and M2 sections still say "planned". Update them to "as built" when the user allows; keep the Not-verified bullets for `mcp_message` / `sdkMcpServers`.
- Remaining stubs in `src/placeholders.js`: the commands for M3-M4 (including `insertAtMentioned`, M4 terminal mode) and a placeholder sessions view. Replace them as each milestone lands.
- M2 known limits: root `.gitignore` only; `{when}` excludes skipped; file list cached 30 s; brace globs in excludes unverified in findFiles; `@terminal:` sees only commands run after activation.

## Entry Points
- `package.json` (manifest), `extension.js` (`activate` / `deactivate`).
- Services passed to each `register(context, services)`: logger, registry, events emitter, hooks `{beforePermission, controlHandlers, sendContext, initializePayload}`, `webviewHandlers`. M2 and M3 plug in through the hooks.

## Key Patterns
- One folder per feature under `src/` and `webview/`; `extension.js` only calls each feature's `register`.
- One CLI process per conversation (`src/panels/conversation.js` owns it), stream-json plus control protocol over stdio.
- Webviews: strict CSP with a nonce, theme variables, `postMessage` protocol (spec table plus extras listed in CHANGELOG.md).

## Last Changes
- M1 added (2026-10-29), with deviations: extra files (`conversation.js`, `failures.js`, `markdown.js`, `panels/index.js`); extra message types; `set_max_thinking_tokens` for the thinking switch (unverified); `SECONDARY_SIDEBAR_VERSION = 1.106` is a guess; `scripts/package.ps1` deferred to M4. Details in CHANGELOG.md.

- M2 added (2026-10-29): editor context, `@` mentions, autosave, Alt+K and the SDK MCP tools. Deviation: the `mcp_message` / `sdkMcpServers` shapes were not captured from the real CLI (impossible here) and use the spec's assumption; the spec's "capture before M2" step is deferred to the checklist below. Details in CHANGELOG.md.

## Next Steps
1. Commit M2.
2. M3 native diff review.
3. M4 sessions list, walkthrough, terminal mode (including `insertAtMentioned`), IDE WebSocket server, `scripts/package.ps1`.
4. Update spec.md sections to "as built" once permitted.
5. On a machine with the real CLI: capture `initialize` / `mcp_message` shapes from its debug log (before M4's IDE work).

## Gotchas / Watch Out
- No Node.js, VS Code or `claude` CLI on this machine. M1 was checked with a headless-Edge V8 syntax checker (`msedge --headless --dump-dom`). Run `node --test test/` on a machine with Node; `test/process.test.js` has never been run.
- Never reuse the official ids (`claude-vscode.*`, `claudeCode.*`): both extensions may be installed together.
- The `mcp_message` and `ide` WebSocket formats are not documented. M2 shipped on the spec's assumed `mcp_message` shape (unverified); capture both from the real CLI before M4.
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

### M2 (Extension Development Host, first against `dev/fake-claude.cmd`, then the real CLI)
- [ ] `node --test test/` passes on a Node machine (`exclusions`, `sdk-server`).
- [ ] Select code: the chip shows "N שורות נבחרו", the next message carries the selection; clicking the chip skips context for one message and it stays hidden until then.
- [ ] Alt+K inserts `@path#5` / `@path#5-10` into the last chat and focuses it; with no chat open, one opens.
- [ ] `@` in the composer lists files and folders (top 20, excludes and `.gitignore` respected); `@terminal:<name>` attaches the last 200 lines.
- [ ] Editing a dirty file: autosave runs before Claude's Read/Edit/Write.
- [ ] Claude calls `mcp__claude-local__getDiagnostics` (use the `mcp` keyword in the fake CLI) and gets a result; same for `getOpenEditors`.
- [ ] Real CLI: capture the `initialize` and `mcp_message` shapes from its debug log; confirm `sdkMcpServers` and `{mcp_response}`, then resolve the spec's Not-verified bullets.
