# Dependencies — Claude Code Local
_Last updated: 2026-10-29._

- **VS Code ≥ 1.94** (`engines.vscode ^1.94.0`). The secondary-sidebar placement needs a newer version; older ones fall back to the activity bar.
- **Claude Code CLI ≥ 2.1.246**, on PATH or at `claudeLocal.claudePath`. Not bundled.
- **Node ≥ 18** only for development (`node --test`, `dev/fake-claude.js`). The extension itself runs on VS Code's built-in Node.
- **npm packages:** none, at runtime or for development.
- **PowerShell 5.1** for `scripts/package.ps1`.
- **A model server** reached by the CLI (for example Ollama through `ANTHROPIC_BASE_URL`), configured in the CLI's environment.
