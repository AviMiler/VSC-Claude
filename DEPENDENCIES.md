# Dependencies — Claude Code Local
_Last updated: 2026-10-29 — M1; no packaging step (the folder is copied as is)._

- **VS Code ≥ 1.94** (`engines.vscode ^1.94.0`). The secondary-sidebar placement needs a newer version; older ones fall back to the activity bar.
- **Claude Code CLI ≥ 2.1.246**, on PATH or at `claudeLocal.claudePath`. Not bundled.
- **Node ≥ 18** only for development (`npm test` = `node --test`, `dev/fake-claude.js`). The extension itself runs on VS Code's built-in Node.
- **npm packages:** none, at runtime or for development.
- **A model server** reached by the CLI (for example Ollama through `ANTHROPIC_BASE_URL`), configured in the CLI's environment.
