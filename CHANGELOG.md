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
