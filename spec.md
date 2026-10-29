# Spec — Claude Code Local (VS Code extension)
_Created 2026-10-29, before any code, from the official extension's manifest (`Anthropic.claude-code` 2.1.312, read from Open VSX) and its docs (code.claude.com/docs/en/vs-code). Background: DECISIONS.md, AGENT_CONTEXT.md, PROJECT_MAP.md._

Requirements the user confirmed as permanent. Each new permanent feature gets a section here. The extension copies the official Claude Code extension's structure (view containers, views, commands, menus, keybindings, settings, walkthrough), renamed so the two can be installed side by side, and runs on the same closed machine as claude-gui. Every section is "planned" until code ships; when it ships the section is updated to "as built" with its real file list.

## Platform constraints
- A separate VS Code extension in its own repo. It shares no code with claude-gui (user decision by AskUserQuestion, 2026-10-29: "Separate extension", "New repo"). claude-gui's verified CLI behaviour (`lib/cli-args.js`, `lib/cli-process.js`, `lib/runtime-permissions.js` there) is a design reference only.
- Same constraints as claude-gui (user decision, 2026-10-29: "Same constraints"):
  - Runs on a closed (offline) Windows machine, single user. No external files, fonts, CDNs or network calls from the webviews.
  - Hebrew, right-to-left UI. Command titles in the palette keep the English "Claude Code Local:" prefix plus a Hebrew title (VS Code's palette is LTR); every webview string is Hebrew.
  - Zero npm dependencies at runtime and no build step: plain JavaScript, CommonJS (`require`), `require('vscode')` from the host. No TypeScript, no bundler. `node --test` for unit tests (built into Node ≥ 18).
  - The model server is reached through the CLI's own environment (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_DEFAULT_*_MODEL`), set with `claudeLocal.environmentVariables` or the user's `~/.claude/settings.json` `env`. The extension never talks to a model itself.
- `engines.vscode`: `^1.94.0` (the same as the official extension). Secondary-sidebar placement needs a newer VS Code; older versions fall back to the activity bar (see "Opening & placement").
- The CLI is not bundled (the official extension bundles a private one). It comes from `claudeLocal.claudePath` (default `claude`, resolved on PATH; a `.cmd`/`.bat` is run through `cmd.exe /d /s /c`). Target CLI: 2.1.246 or newer.
- `capabilities.untrustedWorkspaces.supported: false` (as in the official manifest): the extension does not run in Restricted Mode.
- Install by copying the folder (user decision, 2026-10-29: "a folder I copy to the extensions folder and that's it"): the repo folder is the extension as is. It is copied to `%USERPROFILE%\.vscode\extensions\local.claude-local-<version>` and VS Code is restarted. No VSIX, no packaging script. If VS Code does not pick the folder up, "Developer: Install Extension from Location…" on the same folder installs it.
- Code is separated by feature: a folder per topic under `src/` and `webview/`, no cross-feature spaghetti (code-standards rule 1).
- Known limits: VS Code is not installed on the machine the spec was written on; everything that needs the Extension Host is verified on a machine that has it.
- As built (M1): `package.json`, `extension.js`.

## Manifest & package layout (mirrors the official extension)
- `package.json`: `name: claude-local`, `publisher: local`, `displayName: "Claude Code Local"`, `main: ./extension.js`, `categories: ["AI", "Chat"]`, `icon: resources/claude-logo.png`.
- `activationEvents`: `onStartupFinished`, `onWebviewPanel:claudeLocalPanel` (the official uses `onStartupFinished` and `onWebviewPanel:claudeVSCodePanel`).
- Naming: the official `claude-vscode.*` / `claude-code.*` command ids become `claude-local.*`; `claudeCode.*` settings become `claudeLocal.*`; `claudeVSCode*` view ids become `claudeLocal*`; context keys `claude-vscode.*` become `claude-local.*`. Nothing collides with the official extension when both are installed.
- Declared `contributes` keys, as in the official manifest: `configuration`, `commands`, `keybindings`, `viewsContainers`, `views`, `walkthroughs`, `menus`. The official `jsonValidation` is left out (see "Out of scope").
- A command, view or menu entry is declared in `package.json` only in the milestone that implements it, so the palette never shows a command without a handler. M1 declares all 24 settings, the 13 M1 commands, the two chat view containers and their views; the sessions container, the walkthrough and the M2–M4 commands come with their milestones.
- `extension.js` only wires features: `activate(context)` calls each feature's `register(context, services)` and `deactivate()` disposes them. Shared services: the logger (OutputChannel), settings reader, session registry.
- Planned tree:
  - `extension.js`
  - `src/cli/` — process spawn, args, capabilities, control protocol
  - `src/panels/` — chat webview panels and views, the panel registry, serializer
  - `src/context/` — open file, selection, @-mentions, autosave
  - `src/diff/` — proposed-diff providers, hunk comments, Myers diff
  - `src/mcp/` — in-process SDK MCP server, IDE WebSocket server, lock file
  - `src/sessions/` — transcript reader, sessions list view, archive and groups
  - `src/terminal/` — terminal mode
  - `src/util/` — logger, settings, nonce, paths
  - `webview/chat/`, `webview/sessions/`, `webview/shared/` — HTML, JS (ES modules in the webview) and CSS
  - `resources/` — `claude-logo.svg`, `claude-logo-pending.svg`, `claude-logo-done.svg`, `claude-logo.png`, `walkthrough/step1.md`–`step4.md`
  - `dev/fake-claude.js` + `dev/fake-claude.cmd` — a fake stream-json CLI
  - `test/` — `node --test` units for the pure modules, plus host tests against `test/vscode-stub.js`
- As built (M1): `package.json`, `extension.js`.

## Opening & placement
The official extension opens in five places: a view in the secondary sidebar (or the activity bar on older VS Code), an editor tab, a new window, the integrated terminal, and a sessions list in the activity bar. This copies all five (user decision, 2026-10-29: scope "Opening & placement").
- View containers, as in the official manifest:
  - `activitybar` → `claude-local-sidebar` (title "Claude Code Local", icon `resources/claude-logo.svg`), shown when `claude-local:doesNotSupportSecondarySidebar`.
  - `activitybar` → `claude-local-sessions-sidebar` (sessions list), shown when `claude-local.sessionsListEnabled`.
  - `secondarySidebar` → `claude-local-sidebar-secondary`, shown when `!claude-local:doesNotSupportSecondarySidebar`.
  - At activation the extension sets `claude-local:doesNotSupportSecondarySidebar` from `vscode.version` (true below the first version that supports the `secondarySidebar` container). `claude-local.sessionsListEnabled` is true by default.
- Views (all `type: webview`): `claudeLocalSidebar` in `claude-local-sidebar`, `claudeLocalSidebarSecondary` in `claude-local-sidebar-secondary`, `claudeLocalSessionsList` in `claude-local-sessions-sidebar` (empty name, as the official).
- Editor tab: a `WebviewPanel` with viewType `claudeLocalPanel`, icon the Spark logo, title the session title (first 40 characters of the first message; "Claude" before one). Each tab and the sidebar view are independent conversations with their own CLI process.
- Commands (palette title "Claude Code Local: …"), mapped from the official set:

  | Official | Ours | Title | Key (Win) | Notes |
  |---|---|---|---|---|
  | `claude-vscode.editor.open` | `claude-local.editor.open` | Open in New Tab | Ctrl+Shift+Esc (`!config.claudeLocal.useTerminal`) | new conversation in an editor tab |
  | `claude-vscode.editor.openLast` | `claude-local.editor.openLast` | Open | — | editor/title button (`navigation`, `!config.claudeLocal.useTerminal`); focuses the last tab or opens one; hidden from the palette |
  | `claude-vscode.primaryEditor.open` | `claude-local.primaryEditor.open` | Open in Primary Editor | — | opens in the main editor group even when `lockEditorGroups` keeps a side group |
  | `claude-vscode.window.open` | `claude-local.window.open` | Open in New Window | — | opens a new tab, then moves it to an auxiliary window (`workbench.action.moveEditorToNewWindow`) |
  | `claude-vscode.sidebar.open` | `claude-local.sidebar.open` | Open in Side Bar | — | reveals the sidebar view |
  | `claude-vscode.terminal.open` | `claude-local.terminal.open` | Open in Terminal | Ctrl+Esc when `config.claudeLocal.useTerminal` (`claude-local.terminal.open.keyboard`) | see "Terminal mode"; editor/title button when `useTerminal` |
  | `claude-vscode.newConversation` | `claude-local.newConversation` | New Conversation | Ctrl+N when `config.claudeLocal.enableNewConversationShortcut && (activeWebviewPanelId == 'claudeLocalPanel' \|\| (claude-local.sideBarActive && !editorFocus && !panelFocus))` | hidden from the palette |
  | `claude-vscode.reopenClosedSession` | `claude-local.reopenClosedSession` | Reopen Closed Session | Ctrl+Shift+T when `config.claudeLocal.enableReopenClosedSessionShortcut && claude-local.lastClosedWasSession` | reopens the last closed tab with `--resume` |
  | `claude-vscode.focus` | `claude-local.focus` | Focus input | Ctrl+Esc when `!config.claudeLocal.useTerminal && editorTextFocus` | focuses the last active Claude input, opening one if none |
  | `claude-vscode.blur` | `claude-local.blur` | Blur input | Ctrl+Esc when `!config.claudeLocal.useTerminal && !editorTextFocus` | returns focus to the last editor; hidden from the palette |
  | `claude-vscode.focusLastMessage` | `claude-local.focusLastMessage` | Focus last message | — | newest message or the waiting permission card; palette when `!useTerminal` |
  | `claude-vscode.toggleFocusView` | `claude-local.toggleFocusView` | Toggle Focus view | Ctrl+Alt+F when `activeWebviewPanelId == 'claudeLocalPanel' \|\| claude-local.sideBarActive` | hides tool rows |
  | `claude-vscode.insertAtMention` | `claude-local.insertAtMention` | Insert @-Mention Reference | Alt+K when `editorTextFocus` | see "Editor context"; palette when `!useTerminal` |
  | `claude-code.insertAtMentioned` | `claude-local.insertAtMentioned` | Insert At-Mentioned | Ctrl+Alt+K when `editorTextFocus` | terminal-mode twin: types the reference into the Claude terminal; palette when `useTerminal` |
  | `claude-vscode.renameSessionTab` | `claude-local.renameSessionTab` | Rename Session Tab | — | `webview/context` and palette when `activeWebviewPanelId == 'claudeLocalPanel'` |
  | `claude-vscode.markSessionUnread` | `claude-local.markSessionUnread` | Mark Session as Unread | — | same menus |
  | `claude-vscode.addSessionTabToGroup` | `claude-local.addSessionTabToGroup` | Add Session Tab to Group | — | same menus; QuickPick of groups + "קבוצה חדשה…" |
  | `claude-vscode.showLogs` | `claude-local.showLogs` | Show Logs | — | shows the OutputChannel "Claude Code Local" |
  | `claude-vscode.openWalkthrough` | `claude-local.openWalkthrough` | Open Walkthrough | — | `workbench.action.openWalkthrough` with ours |
  | diff commands | see "Native diff review" | | | |

- The `when` clauses copy the official ones with the renamed keys. Context keys the host maintains: `claude-local.sideBarActive` (sidebar view visible and focused), `claude-local.lastClosedWasSession`, `claude-local.viewingProposedDiff`, `claude-local.sessionsListEnabled`, `claude-local:doesNotSupportSecondarySidebar`.
- Status bar: a right-side item "✻ Claude" (`claude-local.editor.openLast`, or `terminal.open` when `useTerminal`); works without an open file. While any conversation waits for a permission its text is "✻ Claude · ממתין לאישור".
- Tab status: the panel's `iconPath` switches to a variant with a dot: blue while a permission is pending, orange when a turn ended while the panel was not visible; cleared when the panel becomes visible.
- `preferredLocation` (`sidebar` | `panel`, default `panel`): where `focus` opens a conversation when none is open — the sidebar view or an editor tab.
- `lockEditorGroups` (default true): a group Claude opens tabs in is locked (`workbench.action.lockEditorGroup`) so files Claude opens land in another group.
- Closing a tab kills its process and remembers its session id for `reopenClosedSession` (a stack of the last 10).
- A new tab opens in the group of the last Claude tab, else beside the active editor, else in the active group. Files Claude opens (`openFile`) go to the last text editor's group when it has no Claude tab, else group 1 (group 2 when group 1 holds Claude).
- `blur` returns to the last text editor (`showTextDocument` on its column), else `workbench.action.focusActiveEditorGroup`.
- The sidebar conversation survives the view being closed and reopened (the host replays the thread). Its `{sessionId, mode, model, running, title}` is kept in `workspaceState` key `claudeLocal.sidebarSession` and resumed after a reload.
- M1 status: built. `markSessionUnread` and `addSessionTabToGroup` move to M4 (they act on the sessions list); `terminal.open`, `insertAtMentioned` and `openWalkthrough` come with their sections (M4, M4, M2). The status bar opens `editor.openLast` until terminal mode exists.
- Known limits: the official "Open in New Window" opens a real auxiliary window; ours moves the panel with VS Code's own command, which needs VS Code ≥ 1.85 aux windows.
- Not verified: the first VS Code version that shows `viewsContainers.secondarySidebar` is assumed to be 1.106 (`src/panels/sidebar-view.js`). Below it, the activity-bar view is used. Nothing has run in a real Extension Host yet; the host code is exercised against `test/vscode-stub.js`.
- As built (M1): `src/panels/` (`panel-registry.js`, `chat-panel.js`, `sidebar-view.js`, `commands.js`, `status-bar.js`), `package.json` `contributes`.

## Claude Code process & protocol
One long-lived CLI process per conversation, spoken to over stdin/stdout with stream-json and the control protocol, as claude-gui does (and as the official extension does internally).
- Spawn: `claude -p --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio --permission-mode <mode>`, plus `--include-partial-messages` when `claude --help` lists it, `--model <m>` when chosen, `--resume <sessionId>` to resume. Capabilities (`--version`, flags, permission modes) are read once per `claudePath` and cached.
- `cwd`: the first workspace folder (the folder of the active file's workspace when there are several). No folder open: the user's home folder, and the composer shows "לא נפתחה תיקייה – Claude עובד בתיקיית הבית".
- Environment: `process.env` + the `claudeLocal.environmentVariables` array (`[{name, value}]`, as the official) + `CLAUDE_CODE_ENTRYPOINT=claude-local-vscode`.
- `claudeProcessWrapper`: when set, the wrapper executable is spawned with the CLI path and its arguments as its own arguments.
- Control requests sent: `initialize` (60 s timeout; declares the in-process MCP server from M2, see "IDE tools"), `interrupt`, `set_permission_mode`, `set_model`, `set_max_thinking_tokens` (the thinking switch: `null` on, `0` off). Received: `can_use_tool` (permission cards and the native diff), `mcp_message` (the in-process MCP server, M2), `control_cancel_request` (removes the card). An unknown incoming request is answered with an error response; an outgoing one the CLI rejects is logged and the UI keeps its previous state.
- Permission modes: the extension's names are `default`, `acceptEdits`, `plan`, `bypassPermissions`. CLI 2.1.312 lists `manual` (not `default`) in `--permission-mode` choices, so `default` is passed as `manual` when the help lists only `manual`; `initialize` still reports `current_permission_mode: "default"`, and `set_permission_mode` takes the extension's names. With `allowDangerouslySkipPermissions` on, `--allow-dangerously-skip-permissions` is added (when the help lists it) so a live switch to `bypassPermissions` works.
- A process start that finishes after its conversation was reset or closed is dropped (no orphan process).
- Stop: pending permissions are denied with "Interrupted by the user", `interrupt` is sent, a process still alive after 6 s is killed (`taskkill /T /F` on Windows).
- Failures add a Hebrew error to the conversation: spawn failure ("לא ניתן להפעיל את Claude (…). בדוק את ההגדרה claudeLocal.claudePath."), unknown option ("גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח."), else exit code + the last 3000 characters of stderr.
- Every line in and out is logged at debug level to the OutputChannel (`showLogs`), with message contents cut to 500 characters.
- Process lifetime: killed when its panel or view is disposed or the extension deactivates.
- Verified against the real CLI 2.1.312 (2026-10-29, probe in a scratch folder): the spawn line above, `initialize` (response has `commands[{name, description, argumentHint}]`, `models[{value, displayName, description}]`, `claude_code_version`), a `can_use_tool` for `Write` (`{tool_name, display_name, input, description, permission_suggestions, tool_use_id}`) answered with `{behavior: allow, updatedInput}`, `set_permission_mode` (→ `{mode}`), `set_model` (→ `{model}`), `set_max_thinking_tokens` (→ success), an unknown subtype (→ `error: "Unsupported control request subtype: …"`). Not verified: Windows `.cmd` spawning and `taskkill` (no Windows here), `control_cancel_request`.
- As built (M1): `src/cli/` (`spawn.js`, `args.js`, `capabilities.js`, `process.js` with `send`/`request`/`respond`/`respondError`/`sendUser`/`stop`/`kill`), `src/util/` (`logger.js`, `settings.js`, `nonce.js`, `paths.js`).

## Chat webview
The conversation UI in every tab and in the sidebar view (user decision, 2026-10-29: same constraints → Hebrew RTL).
- One HTML shell for all chat surfaces (`webview/chat/index.html`), `dir="rtl" lang="he"`, colors from VS Code's theme variables (`--vscode-editor-background`, `--vscode-foreground`, `--vscode-button-*`, …) so it follows light, dark and high-contrast themes. Code, paths and commands are LTR islands.
- Security: CSP `default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource}; script-src 'nonce-<random>' ${webview.cspSource}; font-src ${webview.cspSource}` (`cspSource` in `script-src` lets the entry module import the other local modules); `localResourceRoots` = `webview/` and `resources/` only; `enableScripts: true`, `retainContextWhenHidden: true` (a hidden tab keeps streaming).
- Host ↔ webview messages (`postMessage`, every message `{type, ...}`):

  | Direction | type | Payload |
  |---|---|---|
  | webview → host | `ready` | — (host replies with `init`) |
  | host → webview | `init` | `{settings, session, items, capabilities, modes, models, commands, running, status, permissions}` — `items` are the thread ops so far, `permissions` the waiting cards |
  | host → webview | `update` | any of `{settings, modes, models, commands, capabilities}` (after `initialize`, on a settings change) |
  | host → webview | `session` | `{sessionId, mode, model, title}` (the webview saves it with `setState` for the serializer) |
  | host → webview | `state` | `{running, status}` |
  | host → webview | `permissionResolved` | `{requestId}` (answered, interrupted or cancelled) |
  | webview → host | `newConversation` / `showLogs` | — (header buttons) |
  | webview → host | `focusChanged` | `{focused}` (drives `claude-local.sideBarActive`) |
  | webview → host | `send` | `{text, attachments[], mentions[]}` |
  | webview → host | `interrupt` | — |
  | webview → host | `setMode` / `setModel` / `setThinking` | `{value}` |
  | webview → host | `permissionAnswer` | `{requestId, behavior: allow\|deny, scope?, message?}` |
  | webview → host | `mentionQuery` | `{query}` → host replies `mentionResults {items[]}` |
  | webview → host | `openFile` | `{path, line?}` |
  | host → webview | `event` | `{ops[]}` thread ops from `src/panels/event-translator.js`: `user`, `text`/`thinking` (`append` or `set`), `tool` (input arrives with the complete assistant message), `toolResult`, `result`, `notice` |
  | host → webview | `permission` | `{requestId, tool, displayName, description, input, canAlways, kind: card\|diff}` |
  | host → webview | `context` | `{file, selection: {start, end, lines}}` |
  | host → webview | `insertText` | `{text}` (Alt+K) |
  | host → webview | `focus` / `focusLastMessage` / `toggleFocusView` | — |

- Thread: user messages, Claude's streamed text (Markdown, code blocks with a copy button), thinking (collapsed), tool rows (name + one-line summary, expandable input/output), result line (duration, tokens). File paths in tool rows open the file (`openFile`).
- Permission cards for every `can_use_tool` that is not a diff (see "Native diff review"): the tool, its input, buttons "אישור", "אישור תמיד בפרויקט הזה" (when the CLI sent `permission_suggestions`), "דחייה" with an optional reason. `AskUserQuestion` shows its options; `ExitPlanMode` shows the plan (Markdown) with "אישור התוכנית" / "המשך תכנון".
- Composer: Enter sends, Shift+Enter is a new line; with `useCtrlEnterToSend` Ctrl+Enter sends and Enter is a new line. Pasted images become attachments (base64 image blocks). The footer shows the mode selector, the model picker, the thinking switch, the context line ("N שורות נבחרו" / the open file name) and the stop button while running.
- Mode selector: "ידני" (`default`), "עריכה אוטומטית" (`acceptEdits`), "תכנון" (`plan`), and "ללא הרשאות" (`bypassPermissions`) only when `allowDangerouslySkipPermissions` is on. The start mode is `initialPermissionMode` (read from user settings only, as the official; `manual` is an alias of `default`); a live change sends `set_permission_mode`.
- Model picker: the models from the `initialize` response, else free text; a change sends `set_model`. (The planned fallback to the env's `ANTHROPIC_DEFAULT_*_MODEL` values is not built: the real CLI always returns `models`.)
- `/` menu: the slash commands the CLI listed in `initialize`, filtered as you type; picking one inserts it.
- `scrollToBottomOnSend`, `showMessageTimestamps` (time under each message), `spinnerVerbs` (`{mode: append|replace, verbs[]}`; default Hebrew verbs "חושב", "בודק", "כותב"…), `focusView` (start with tool rows hidden).
- Reload: panels are restored with a `WebviewPanelSerializer` for `claudeLocalPanel` from their saved `{sessionId, mode, model}`; the process restarts with `--resume`. With `continueAfterReload` a turn that was running when the window closed is continued by sending "המשך מהנקודה שבה עצרת." once.
- Markdown is rendered by a small escaping renderer (`webview/chat/markdown.js`): paragraphs, headings, lists, quotes, tables, code blocks with a copy button, inline code, bold, italic, strike; links show their text and URL (no navigation). User text and the input box are `dir="auto"`.
- M1 status: built. The context line ("N שורות נבחרו") comes with "Editor context" (M2), the onboarding checklist with M4. A restored tab resumes the session in the CLI but shows only "השיחה נפתחה מחדש…": the old messages are shown once transcripts are read (M4).
- Known limits: no `/btw`, bookmarks, agent map, prompt-cache clock, LaTeX or voice (official features left out of V1).
- Verified: the webview rendered in Chromium with stub messages (RTL thread, tool rows, cards, `/` menu, sending); the host side against `test/vscode-stub.js` and `dev/fake-claude.js`. Not verified: inside a real VS Code webview.
- As built (M1): `src/panels/` (`conversation.js`, `webview-html.js`, `event-translator.js`, `permissions.js`, `serializer.js`), `webview/chat/` (`app.js`, `thread.js`, `composer.js`, `cards.js`, `markdown.js`, `chat.css`). The HTML shell is generated by `webview-html.js` (there is no `index.html`), and message routing lives in `conversation.js` (no separate `message-router.js`).

## Editor context
What the user is looking at reaches Claude without copying (user decision, 2026-10-29: scope "Editor context").
- `attachOpenFile` (default true): each message carries the active text editor's workspace-relative path as context ("הקובץ הפתוח: <path>") when the editor is a file in the workspace.
- `attachSelection` (default true): a non-empty selection is attached as the path, line range and text. The composer footer shows "N שורות נבחרו" (or "<file>" with no selection); clicking the chip removes it for the next message. The host pushes `context` on `onDidChangeTextEditorSelection` and `onDidChangeActiveTextEditor` (debounced 150 ms).
- Exclusions (as the official): text from files matching `files.exclude`, `search.exclude`, or git-ignored when `respectGitIgnore` is on, is never attached — only the path.
- `insertAtMention` (Alt+K, `editorTextFocus`): inserts `@<relative/path>` plus `#<start>-<end>` when there is a selection (`#5` for one line) into the last active chat's composer and focuses it; opens a chat when none is open.
- `@` in the composer: fuzzy file and folder search with `workspace.findFiles` (excludes from `files.exclude`/`search.exclude`, and `.gitignore` when `respectGitIgnore`), top 20, folders end with `/`. `@terminal:<name>` attaches the last 200 lines of that integrated terminal's output (shell integration), listed among the results.
- `autosave` (default true): before a `can_use_tool` for Read/Edit/MultiEdit/Write on a file that has a dirty document, the document is saved first.
- Not verified: everything.
- Code (planned): `src/context/` (`editor-context.js`, `mentions.js`, `exclusions.js`, `autosave.js`), `webview/chat/mention-menu.js`.

## IDE tools (MCP)
The official extension gives Claude VS Code tools in two ways: an in-process server for its own panel (`mcp__claude-vscode__*`) and a WebSocket `ide` server for a `claude` started in a terminal (user decision, 2026-10-29: scope "Editor context").
- Panel process: `initialize` declares an SDK MCP server named `claude-local`; the CLI routes its MCP JSON-RPC to the extension as `mcp_message` control requests and the extension answers in the `control_response`. Tools:
  - `getDiagnostics({uri?})` — `vscode.languages.getDiagnostics`, as `{uri, diagnostics: [{severity, message, range, source}]}`; read-only.
  - `getOpenEditors()` — the visible text editors with path, language, dirty flag and selection.
  - Claude sees them as `mcp__claude-local__getDiagnostics` and `mcp__claude-local__getOpenEditors`; they go through the normal permission flow.
- Terminal `claude` (`/ide`): a WebSocket server on `127.0.0.1`, random port 10000–65535, hand-written RFC 6455 (handshake, masked text frames, ping/pong, close; no extensions, no deps). Clients must send the header `x-claude-code-ide-authorization: <authToken>`; others get 401.
  - Lock file `~/.claude/ide/<port>.lock` (`CLAUDE_CONFIG_DIR` respected): `{pid, workspaceFolders, ideName: "VS Code (Claude Code Local)", transport: "ws", authToken}`; written at activation, deleted at deactivation and on a clean exit; stale lock files with a dead `pid` from this extension are removed at activation.
  - Tools: `getDiagnostics`, `openFile({filePath, startLine?, endLine?})`, `openDiff({old_file_path, new_file_path, new_file_contents, tab_name})` (uses "Native diff review" and returns `FILE_SAVED` / `DIFF_REJECTED`), `getOpenEditors`; notifications `selection_changed` on selection changes.
  - Lowest priority inside V1 (milestone M4).
- Known limits: the exact JSON shapes of `mcp_message` and of the `ide` WebSocket protocol are not documented; they are checked against the real CLI before M2/M4 (see "Testing").
- Not verified: everything; the `initialize` field name for SDK MCP servers is assumed to be `sdkMcpServers`.
- Code (planned): `src/mcp/` (`sdk-server.js`, `tools.js`, `ws-server.js`, `ws-frames.js`, `lock-file.js`).

## Native diff review
In Manual mode, Claude's file edits open in VS Code's own diff editor, and the user accepts or rejects the whole file or each change (user decision, 2026-10-29: scope "Native diff review").
- Trigger: a `can_use_tool` for `Edit`, `MultiEdit` or `Write` while the mode is `default`. In `acceptEdits`, `plan` and `bypassPermissions` no diff opens (the CLI does not ask). A file outside the workspace still gets a diff.
- Proposed content: computed from the tool input against the file on disk — `Write` is `content`; `Edit` replaces `old_string` with `new_string` (all occurrences with `replace_all`); `MultiEdit` applies `edits` in order. When `old_string` is not found the diff is skipped and a normal permission card is shown (the CLI will fail the edit itself).
- Diff editor: `vscode.diff(left, right, "<file> (הצעת Claude) ↔")` with left `claude-local-left:<path>?req=<id>` (read-only `TextDocumentContentProvider`, the current content; an empty document for a new file) and right `claude-local-right:<path>?req=<id>` (a writable `FileSystemProvider` holding the proposed content). It opens in a non-Claude editor group, `preview: false`.
- Context key `claude-local.viewingProposedDiff` is true while the active editor is such a diff. Commands:

  | Official | Ours | Title | Where |
  |---|---|---|---|
  | `claude-vscode.acceptProposedDiff` / `claude-code.acceptProposedDiff` | `claude-local.acceptProposedDiff` | Accept Proposed Changes `$(check)` | editor/title `navigation`; enablement `claude-local.viewingProposedDiff` |
  | `claude-vscode.rejectProposedDiff` / `claude-code.rejectProposedDiff` | `claude-local.rejectProposedDiff` | Reject Proposed Changes `$(discard)` | same |
  | `claude-vscode.acceptProposedHunk` | `claude-local.acceptProposedHunk` | Accept Change at Cursor | editor/context `claudelocal@1` when `resourceScheme == claude-local-right` |
  | `claude-vscode.rejectProposedHunk` | `claude-local.rejectProposedHunk` | Reject Change at Cursor | editor/context `claudelocal@2`, same `when` |
  | `claude-vscode.acceptProposedHunkFromBar` | `claude-local.acceptProposedHunkFromBar` | "קבל שינוי זה" `$(check)` | comments/commentThread/title `inline@1` when `commentController == claude-local-hunks`; hidden from the palette |
  | `claude-vscode.rejectProposedHunkFromBar` | `claude-local.rejectProposedHunkFromBar` | "דחה שינוי זה" `$(discard)` | `inline@2`, same |

- Hunks: a line diff (Myers, plain JS, `src/diff/myers.js`) between left and right; each hunk gets a comment thread from the CommentController `claude-local-hunks` on the right document with the two inline buttons. Accepting a hunk keeps it and removes its thread; rejecting one writes the original lines back into the right document. More than 100 hunks: no hunk threads, whole-file only (as the official).
- The user may type in the right side; the result is always the right document's final text.
- Outcome:
  - Accept (whole file, or the last hunk resolved with at least one kept): `allow` with `updatedInput`.
    - When the right side equals the proposal, `updatedInput` is the original input.
    - Otherwise the tool name cannot change, so a `Write` gets `content` = the final text, and an `Edit`/`MultiEdit` is rewritten as a single `Edit` whose `old_string` is the whole current file and `new_string` the final text. The response `message` says "המשתמש שינה את ההצעה לפני האישור".
  - Reject (whole file, or every hunk rejected): `deny` with the message "המשתמש דחה את השינוי".
  - Closing the diff tab without a decision counts as reject.
  - The chat shows a compact card "ממתין לסקירה ב-<file>" with "פתח שוב" while the diff is pending.
- Several pending diffs (parallel tool calls) open as separate diff tabs.
- Known limits: rewriting a changed `Edit` as a whole-file `Edit` makes Claude's own transcript show a large edit.
- Not verified: everything; whether the CLI accepts a changed `updatedInput` for `Edit` without re-reading.
- Code (planned): `src/diff/` (`proposed-content.js`, `providers.js`, `diff-session.js`, `hunk-comments.js`, `myers.js`, `commands.js`), `test/myers.test.js`, `test/proposed-content.test.js`.

## Sessions list & history
The activity-bar list of past conversations, as in the official extension (user decision, 2026-10-29: scope "Settings & sessions list").
- Source: the CLI's transcripts in `~/.claude/projects/<encoded cwd>/*.jsonl` (`CLAUDE_CONFIG_DIR` respected; the cwd is encoded by replacing every character that is not a letter or digit with `-`) for each workspace folder. Per file: id (file name), title (the first user message, 60 characters; a `summary` line wins when present), last activity (file mtime), message count. Read lazily, newest first, the first 64 KB of each file only.
- Extension-side metadata in `globalState` key `claudeLocal.sessions`: `{[id]: {title?, archived?, archivedAt?, unread?, group?}}`; groups are per workspace folder in `workspaceState`.
- The view (`claudeLocalSessionsList`, Hebrew RTL): a search box (title and first-message text), sections by time ("היום", "אתמול", "השבוע", "קודם"), groups, and a collapsed "בארכיון" section. Each row: a status dot (blue: waiting for permission, spinning: working, orange: unread, none: idle), the title, relative time. Hover actions: "שינוי שם", "העברה לארכיון" / "שחזור". Header: filter menu ("ממתין לקלט", "בעבודה", "הושלם", "פתוח", "סגור"), "פעיל בלבד" toggle, "שחזור הכול" for the archive.
- Click: focuses the tab that has it open, else opens a tab with `--resume <id>`. A session open in another VS Code window (a heartbeat in `globalState`, `{windowId, at}` every 60 s) shows "הסשן פתוח בחלון אחר" with "פתח כאן בכל זאת"; after 10 minutes without a heartbeat it opens directly.
- `archiveInactiveSessions` (1, 2, 7, 14 or 0 days; default 14): checked at activation and every 6 hours; never archives an open session.
- `markSessionUnread`, `renameSessionTab`, `addSessionTabToGroup` act on the active tab's session and update this list.
- Not verified: everything; the transcript line format for titles and summaries.
- Code (planned): `src/sessions/` (`transcripts.js`, `session-store.js`, `sessions-view.js`, `archive.js`, `presence.js`), `webview/sessions/`, `test/transcripts.test.js`.

## Settings
All 23 official settings, renamed to `claudeLocal.*`, plus `claudePath` (user decision, 2026-10-29: scope "Settings & sessions list"). Configuration title "Claude Code Local". Descriptions are Hebrew (`markdownDescription`).

| Setting | Type, default | V1 | Meaning |
|---|---|---|---|
| `claudeLocal.claudePath` | string, `claude` | yes | ours: the CLI executable |
| `claudeLocal.environmentVariables` | array of `{name, value}`, `[]` | yes | env for the Claude process |
| `claudeLocal.useTerminal` | boolean, false | yes | terminal mode |
| `claudeLocal.allowDangerouslySkipPermissions` | boolean, false | yes | shows "ללא הרשאות" in the mode selector |
| `claudeLocal.claudeProcessWrapper` | string, unset | yes | wrapper executable |
| `claudeLocal.respectGitIgnore` | boolean, true | yes | git-ignored files left out of search and context |
| `claudeLocal.initialPermissionMode` | enum `default`/`manual`/`acceptEdits`/`plan`/`bypassPermissions`, unset (= `default`) | yes | read from user settings only |
| `claudeLocal.disableLoginPrompt` | boolean, false | N/A | there is no sign-in screen; kept so copied settings do not warn |
| `claudeLocal.autosave` | boolean, true | yes | save before Claude reads/writes |
| `claudeLocal.focusView` | boolean, false | yes | start with tool rows hidden |
| `claudeLocal.useCtrlEnterToSend` | boolean, false | yes | |
| `claudeLocal.preferredLocation` | enum `sidebar`/`panel`, `panel` | yes | |
| `claudeLocal.lockEditorGroups` | boolean, true | yes | |
| `claudeLocal.enableNewConversationShortcut` | boolean, false | yes | Ctrl+N |
| `claudeLocal.enableReopenClosedSessionShortcut` | boolean, true | yes | Ctrl+Shift+T |
| `claudeLocal.hideOnboarding` | boolean, false | yes | |
| `claudeLocal.attachOpenFile` | boolean, true | yes | |
| `claudeLocal.attachSelection` | boolean, true | yes | |
| `claudeLocal.continueAfterReload` | boolean, true | yes | |
| `claudeLocal.scrollToBottomOnSend` | boolean, true | yes | |
| `claudeLocal.showMessageTimestamps` | boolean, true | yes | |
| `claudeLocal.spinnerVerbs` | object, `{"mode":"append","verbs":[]}` | yes | |
| `claudeLocal.archiveInactiveSessions` | enum 0/1/2/7/14, 14 | yes | |
| `claudeLocal.usePythonEnvironment` | boolean, true | deferred | activating the workspace Python env needs the Python extension's API |

- Changes apply live (`onDidChangeConfiguration`): webview settings are pushed with `init`-style updates; process settings (`claudePath`, `environmentVariables`, `claudeProcessWrapper`) apply to the next process start, and the chat says "ההגדרה תחול בשיחה הבאה".
- M1 status: all 24 settings are declared and read; the ones whose feature comes later (`useTerminal`, `respectGitIgnore`, `autosave`, `attachOpenFile`, `attachSelection`, `hideOnboarding`, `archiveInactiveSessions`, `usePythonEnvironment`) have no effect yet.
- As built (M1): `package.json` `contributes.configuration`, `src/util/settings.js`.

## Walkthrough & onboarding
- `contributes.walkthroughs`: id `claude-local-walkthrough`, title "תחילת עבודה עם Claude Code Local", four steps mirroring the official: `welcome` ("שותף הקוד שלך", `resources/walkthrough/step1.md`), `open-claude` ("פתיחת Claude", `step2.md`, completionEvents `onCommand:claude-local.sidebar.open`, `onCommand:claude-local.editor.open`), `chat` ("שיחה עם Claude", `step3.md`), `sessions` ("שיחות קודמות", `step4.md`). Media files are local Markdown with local images.
- Onboarding checklist in an empty chat: "פתחו קובץ ושאלו עליו", "סמנו קוד ולחצו Alt+K", "נסו מצב תכנון", "פתחו שיחה קודמת"; dismissed with ✕ (stored in `globalState`) or hidden by `hideOnboarding`.
- Code (planned): `package.json` `contributes.walkthroughs`, `resources/walkthrough/`, `webview/chat/onboarding.js`.

## Terminal mode
- With `useTerminal`, or by `claude-local.terminal.open`, Claude runs as the CLI in an integrated terminal ("Claude Code") instead of the webview: `claudePath` (through `claudeProcessWrapper` when set), cwd as in "Claude Code process", env with `environmentVariables`, `CLAUDE_CODE_SSE_PORT=<ide ws port>` so it connects to the IDE server automatically.
- Keybindings swap as in the official: Ctrl+Esc runs `claude-local.terminal.open.keyboard` (focuses the existing Claude terminal or opens one); the editor/title button becomes `terminal.open`; Ctrl+Alt+K (`insertAtMentioned`) sends the `@path#L-L` text to the Claude terminal.
- Code (planned): `src/terminal/terminal-mode.js`.

## Out of scope (official features not copied)
- Sign-in, `logout`, `update`, `installPlugin` and the plugins UI, the Web tab (cloud sessions), Remote Control, Claude in Chrome (`@browser`), usage bars (`/usage`), voice, `createWorktree`, URI handler, `/btw`, bookmarks, agent map, prompt-cache clock, LaTeX.
- `jsonValidation` for `.claude/settings.json`: the official bundles `claude-code-settings.schema.json`; there is no offline copy. May be added later with a hand-written subset.
- Each official command, view, setting and menu entry is either mapped in a section above or listed here.

## Build order
- M1 (built 2026-10-29): manifest, `extension.js`, CLI process, chat webview, opening & placement (tab, sidebar, status bar, focus/blur), logs, settings read.
- M2: editor context (open file, selection, Alt+K, @-mentions, autosave) and the in-process MCP tools.
- M3: native diff review.
- M4: sessions list, archive and groups, walkthrough, terminal mode, then the IDE WebSocket server.
- Each milestone goes through the enforcing-coding-workflow stages and updates its sections here from "planned" to "as built".

## Testing
- `dev/fake-claude.js` (+ `.cmd`): a fake stream-json CLI that answers `--version`, `--help` and `initialize`, streams a reply, asks `can_use_tool` for a `Write` ("write"/"כתוב" in the message) or an `AskUserQuestion` ("ask"/"שאל"), and honours `interrupt`, `set_permission_mode`, `set_model`; selected with `claudeLocal.claudePath`. `mcp_message` is added in M2.
- `npm test` (= `node --test`) runs every file in `test/`. Pure modules have units: args building, help parsing, command building, event translation, permission responses (later: Myers diff, proposed content, transcript reading, WebSocket frames). `test/extension.test.js` activates the extension against `test/vscode-stub.js` and runs tab and sidebar conversations with the fake CLI.
- Extension behaviour is checked by hand in the Extension Development Host (`code --extensionDevelopmentPath=<repo>`), against the fake CLI and then the real CLI with the Ollama model server. A checklist per milestone lives in AGENT_CONTEXT.md.
- Before M2 and M4 the real CLI's `mcp_message` and `ide` WebSocket messages are captured (debug log of the CLI) and the "Not verified" bullets above are resolved.
