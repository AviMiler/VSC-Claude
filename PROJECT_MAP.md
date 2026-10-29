# Project Map — Claude Code Local
_Last updated: 2026-10-29 — M1 built. Folders marked (planned) come with later milestones (spec.md "Build order")._

## File Tree
```
claude-vscode/
├── spec.md, DECISIONS.md, AGENT_CONTEXT.md, PROJECT_MAP.md, DEPENDENCIES.md
├── package.json            manifest
├── extension.js            activate/deactivate, wires features
├── src/
│   ├── cli/                spawn.js, args.js, capabilities.js, process.js
│   ├── panels/             conversation.js, chat-panel.js, sidebar-view.js, panel-registry.js, commands.js,
│   │                       status-bar.js, serializer.js, webview-html.js, event-translator.js, permissions.js
│   ├── util/               logger.js, settings.js, nonce.js, paths.js
│   ├── context/            (planned, M2) open file, selection, @-mentions, exclusions, autosave
│   ├── mcp/                (planned, M2/M4) in-process SDK MCP server, IDE WebSocket server, lock file
│   ├── diff/               (planned, M3) proposed content, diff providers, hunk comments, Myers diff
│   ├── sessions/           (planned, M4) transcripts, session metadata, sessions view, archive, presence
│   └── terminal/           (planned, M4) terminal mode
├── webview/
│   └── chat/               app.js, thread.js, composer.js, cards.js, markdown.js, chat.css
├── resources/              claude-logo.svg, claude-logo-pending.svg, claude-logo-done.svg, claude-logo.png
├── dev/                    fake-claude.js, fake-claude.cmd
└── test/                   cli.test.js, panels.test.js, extension.test.js, vscode-stub.js
```

## File Descriptions
- `package.json` — the manifest: settings, M1 commands, keybindings, view containers, views, menus.
- `extension.js` — Extension entry: activate() wires each feature's register(); deactivate() disposes them.
- `src/cli/spawn.js` — Spawn: resolves the CLI executable and builds the command line (cmd.exe for .cmd/.bat, the optional wrapper).
- `src/cli/args.js` — Args: builds the CLI arguments and environment for one conversation process.
- `src/cli/capabilities.js` — Capabilities: reads the CLI's version, flags and permission modes from `--version` and `--help`, cached per path.
- `src/cli/process.js` — Process: one long-lived CLI process speaking stream-json and the control protocol over stdin/stdout.
- `src/panels/conversation.js` — Conversation: one chat — its CLI process, thread ops, permissions and the webview messages of the panel or view showing it.
- `src/panels/chat-panel.js` — Chat panel: an editor tab (WebviewPanel `claudeLocalPanel`) showing one conversation, with its title and status dot.
- `src/panels/sidebar-view.js` — Sidebar view: the chat in the secondary sidebar or the activity bar (WebviewView), and the placement context key.
- `src/panels/panel-registry.js` — Panel registry: the open chat tabs and the sidebar, the last active one, closed sessions, group locking and the editor to return to.
- `src/panels/commands.js` — Commands: the claude-local.* commands for opening, focusing and managing chat tabs and the sidebar.
- `src/panels/status-bar.js` — Status bar: the "✻ Claude" item, showing when a conversation waits for a permission.
- `src/panels/serializer.js` — Serializer: restores Claude tabs after a window reload from the state each webview saved.
- `src/panels/webview-html.js` — Webview HTML: the chat shell with its CSP nonce, local resource roots and asset URIs.
- `src/panels/event-translator.js` — Event translator: turns CLI stream-json messages into the thread ops the chat webview renders.
- `src/panels/permissions.js` — Permissions: turns a permission-card answer from the webview into the `can_use_tool` control response.
- `src/util/logger.js` — Logger: the "Claude Code Local" output channel, with message contents cut to 500 characters.
- `src/util/settings.js` — Settings: reads the claudeLocal.* configuration for the process and for the webview.
- `src/util/nonce.js` — Nonce: random tokens for webview CSP nonces and control request ids.
- `src/util/paths.js` — Paths: the working folder for a new Claude process.
- `webview/chat/app.js` — Chat app: the webview entry — host messages, saved state, spinner and focus handling.
- `webview/chat/thread.js` — Thread: renders the conversation ops (user messages, Claude's text, thinking, tool rows, results, notices).
- `webview/chat/composer.js` — Composer: the input box, pasted images, the `/` menu and the footer (mode, model, thinking, send/stop).
- `webview/chat/cards.js` — Cards: permission cards for `can_use_tool` (generic tools, AskUserQuestion, ExitPlanMode).
- `webview/chat/markdown.js` — Markdown: a small, escaping Markdown-to-HTML renderer for Claude's replies (code blocks get a copy button).
- `webview/chat/chat.css` — Chat styles: RTL layout coloured only with VS Code theme variables.
- `dev/fake-claude.js` — Fake CLI: a stand-in for `claude` that speaks stream-json and the control protocol, for trying the extension without a model.
- `dev/fake-claude.cmd` — Fake CLI launcher for Windows: runs dev\fake-claude.js with Node.
- `test/cli.test.js` — Tests for src/cli: args, capabilities parsing, command building and the process against dev/fake-claude.js.
- `test/panels.test.js` — Tests for the pure parts of src/panels: the event translator and permission responses.
- `test/extension.test.js` — Host smoke test: activates the extension against the VS Code stub and runs a conversation with dev/fake-claude.js.
- `test/vscode-stub.js` — VS Code stub: a minimal fake of the `vscode` API so the host code can be exercised under `node --test`.
- `spec.md` — the requirements, one section per feature.
- `DECISIONS.md` — dated user decisions.
- `AGENT_CONTEXT.md` — current state and next steps.
- `DEPENDENCIES.md` — runtime requirements.
