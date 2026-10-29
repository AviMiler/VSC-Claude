# Decisions

## [2026-10-29] Copy the official Claude Code extension's structure (user decision)
**Decision:** The extension mirrors `Anthropic.claude-code` 2.1.312: the same view containers (activity bar, secondary sidebar, sessions list), the same view and panel types, the same commands, menus, keybindings and `when` clauses, the same 23 settings and a 4-step walkthrough. Ids are renamed (`claude-vscode.*` → `claude-local.*`, `claudeCode.*` → `claudeLocal.*`) so it installs next to the official one.
**Alternatives considered:** A smaller custom UI with its own ids — rejected, the user asked to copy the official structure.

## [2026-10-29] A separate extension, sharing no code with claude-gui (user decision)
**Decision:** The extension talks to the CLI over stream-json itself, from the extension host, with its own webview UI. claude-gui is a design reference only.
**Alternatives considered:** Reusing claude-gui's server and showing its UI in a webview; reusing claude-gui's `lib/` as a module with a new UI.

## [2026-10-29] Its own repo (user decision)
**Decision:** The project lives in its own folder and git repo, `…\Software\Ai\claude-vscode`, next to claude-gui, with its own spec.md and docs.
**Alternatives considered:** A `vscode-extension/` folder inside the claude-gui repo.

## [2026-10-29] Same platform constraints as claude-gui (user decision)
**Decision:** Offline Windows machine, Hebrew RTL UI, the model server reached through the CLI's `ANTHROPIC_BASE_URL`, zero npm dependencies at runtime, no build step (plain CommonJS), installed from a self-built VSIX instead of a marketplace.
**Alternatives considered:** A standard extension (TypeScript, npm build, English UI, marketplace).

## [2026-10-29] V1 covers all four parts of the official extension (user decision)
**Decision:** V1 includes opening & placement, editor context (including the IDE MCP tools), native diff review, and settings with the sessions list. Built in milestones M1–M4 (spec.md "Build order").
**Alternatives considered:** A smaller first version with only some of these parts.
