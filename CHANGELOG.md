# Changelog

All notable changes to this project. Format: Keep a Changelog.

## [Unreleased]

### Added - M1 (2026-10-29, branch build/m1-m4)
- Manifest `package.json`: 26 commands, 9 keybindings, menus, 3 view containers and views, 24 `claudeLocal.*` settings, walkthrough stub.
- `extension.js` wiring with shared services (logger, registry, events emitter, hooks, webviewHandlers).
- `src/util/` (logger, settings, nonce, paths) and `src/cli/` (spawn, capabilities, args, process with control protocol, failures).
- `src/panels/`: chat panel, sidebar view, panel registry, commands, status bar, serializer, message router, event translator, webview HTML, conversation.
- `src/placeholders.js`: Hebrew stubs for the 11 commands that belong to M2-M4 and a placeholder sessions view.
- `webview/chat/` (Hebrew RTL UI: thread, composer, permission cards, markdown, onboarding) and `resources/` (logos, tab-dot icons, walkthrough step1-4.md).
- `dev/fake-claude.js` + `.cmd` fake stream-json CLI; `test/args.test.js`, `test/process.test.js`.

### Added - M2 (2026-10-29, branch build/m1-m4)
- `src/context/` (`index`, `editor-context`, `workspace-exclusions`, `exclusions`, `mention-format`, `mentions`, `autosave`): the open file and selection are prepended to messages in Hebrew ("הקובץ הפתוח: …", selected text in a fenced block; excluded files send path and range only). Context is pushed to the webview debounced 150 ms; the chip shows "N שורות נבחרו" or the file name, and a click skips context for the next message.
- `@` search in the composer: `findFiles` with `files.exclude`, `search.exclude` and the root `.gitignore`, fuzzy top 20 plus folders, then terminals. `@terminal:<name>` attaches the last 200 lines captured through shell integration (only commands run after activation; names with spaces use `_`).
- Alt+K `insertAtMention` inserts `@path#5` / `@path#5-10` into the last chat, opening one if none. Autosave runs before Read/Edit/MultiEdit/Write.
- `src/mcp/` (`index`, `sdk-server`, `tools`): SDK MCP server `claude-local` (`initialize` field `sdkMcpServers`, `mcp_message` answered with `{mcp_response}`) with tools `getDiagnostics` and `getOpenEditors`.
- `webview/chat/mention-menu.js`; `app.js` and `chat.css` extended (context chip, `mentionResults`); `test/exclusions.test.js`, `test/sdk-server.test.js`.
- Modified: `extension.js` (registers context and mcp after panels), `src/panels/commands.js` (`services.revealConversation`), `src/panels/conversation.js` (insertText/focus/focusLastMessage/toggleFocusView/context posts queue until the webview sends `ready`), `src/placeholders.js` (`insertAtMention` stub removed; `insertAtMentioned` stays a stub for M4).

### M2 deviations and known limits
- The `mcp_message` and `initialize` shapes are the spec's assumption (from the public Agent SDK), NOT verified against the real CLI: it cannot be captured on this machine. The spec's "capture before M2" step was skipped by design; spec.md's Not-verified bullets stay.
- Only the root `.gitignore` is read; `{when}` exclude entries are skipped; the file list is cached 30 s and not invalidated on `.gitignore` or settings change; exclude globs with braces may not combine in findFiles' `{a,b}` (unverified).
- spec.md again not updated (user constraint): "Editor context" and "IDE tools" (panel half) still say "planned".
- `src/diff/*`, `test/myers.test.js`, `test/proposed-content.test.js` in the tree are M3 work in progress, not part of M2.

### M2 verification status
- Checker: 48 files, 0 syntax errors; args/exclusions/sdk-server tests 21/21 pass in the headless-Edge V8 harness. `test/process.test.js` not run (no Node). Nothing run in VS Code or against a real CLI.
- Verify-stage fixes: a cleared context chip stays hidden until the next message is sent (editor-context push skips cleared conversations; `sendContext` re-schedules after use); terminal output capture joins a chunk's partial first line to the previous line and pushes in a loop.

### Deviations from the Stage 1 plan / spec tables
- Extra files: `conversation.js`, `failures.js`, `markdown.js`, `panels/index.js`.
- Extra postMessage types: host to webview `session`, `catalog`, `settings`, `permissionResolved`; webview to host `focusState`, `dismissOnboarding`, `clearContext`, `reopenDiff`. `permissionAnswer` may carry `updatedInput` (AskUserQuestion answers).
- Thinking switch uses control request `set_max_thinking_tokens` (unverified against the real CLI).
- `SECONDARY_SIDEBAR_VERSION = 1.106` is a guess and needs checking.
- `scripts/package.ps1` deferred to M4.
- spec.md was not updated (user constraint); its M1 sections still say "planned".

### Verification status
- 31 files syntax-checked with no errors (headless-Edge V8 checker); `test/args.test.js` 8/8 pass in that harness with stubbed builtins.
- `test/process.test.js` not run (no Node.js). Nothing run in VS Code or against a real CLI.
- Verify-stage fixes: `startProcess` aborts if the conversation was disposed during capability detection; deltas are no longer stored in the replay log.
