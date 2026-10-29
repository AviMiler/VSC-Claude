/**
 * Declared commands whose feature is not built yet: each shows a Hebrew notice instead of "command not found".
 * Entries are removed as their milestone ships.
 */
const vscode = require('vscode');

const NOT_YET = 'התכונה הזאת עוד לא נבנתה בגרסה הזאת של Claude Code Local.';

const PENDING_COMMANDS = [
  'claude-local.terminal.open', 'claude-local.terminal.open.keyboard',
  'claude-local.insertAtMention', 'claude-local.insertAtMentioned',
  'claude-local.addSessionTabToGroup',
  'claude-local.acceptProposedDiff', 'claude-local.rejectProposedDiff',
  'claude-local.acceptProposedHunk', 'claude-local.rejectProposedHunk',
  'claude-local.acceptProposedHunkFromBar', 'claude-local.rejectProposedHunkFromBar',
];

/** The sessions list view until its feature is built: a short notice, no scripts. */
const sessionsPlaceholder = {
  /** @param {vscode.WebviewView} view */
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: false };
    view.webview.html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';"></head>
<body><p>רשימת השיחות הקודמות תגיע בגרסה הבאה.</p></body></html>`;
  },
};

/**
 * @param {vscode.ExtensionContext} context
 */
function register(context) {
  context.subscriptions.push(
    ...PENDING_COMMANDS.map(id => vscode.commands.registerCommand(id, () => vscode.window.showInformationMessage(NOT_YET))),
    vscode.window.registerWebviewViewProvider('claudeLocalSessionsList', sessionsPlaceholder),
  );
}

module.exports = { register };
