# Project Map — Claude Code Local
_Last updated: 2026-10-29 — only docs exist; the tree below is planned (spec.md "Manifest & package layout")._

## File Tree
```
claude-vscode/
├── spec.md, DECISIONS.md, AGENT_CONTEXT.md, PROJECT_MAP.md, DEPENDENCIES.md   (exist)
├── package.json            manifest (planned)
├── extension.js            activate/deactivate, wires features (planned)
├── src/
│   ├── cli/                spawn, args, capabilities, control protocol
│   ├── panels/             chat panels, sidebar views, registry, serializer, commands, status bar
│   ├── context/            open file, selection, @-mentions, exclusions, autosave
│   ├── diff/               proposed content, diff providers, hunk comments, Myers diff
│   ├── mcp/                in-process SDK MCP server, IDE WebSocket server, lock file
│   ├── sessions/           transcripts, session metadata, sessions view, archive, presence
│   ├── terminal/           terminal mode
│   └── util/               logger, settings, nonce, paths
├── webview/
│   ├── chat/               chat UI (HTML, ES modules, CSS)
│   ├── sessions/           sessions list UI
│   └── shared/             shared webview helpers and styles
├── resources/              logos, walkthrough/step1-4.md
├── dev/                    fake-claude.js, fake-claude.cmd
├── test/                   node --test units
└── scripts/package.ps1     builds the .vsix
```

## File Descriptions
- `spec.md` — the requirements, one section per feature.
- `DECISIONS.md` — dated user decisions.
- `AGENT_CONTEXT.md` — current state and next steps.
- `DEPENDENCIES.md` — runtime requirements.
