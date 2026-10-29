/**
 * The right-side status bar item "✻ Claude" (opens Claude; shows when a conversation waits for a permission).
 */
const vscode = require('vscode');
const settings = require('../util/settings');

/**
 * @param {import('./panel-registry').PanelRegistry} registry
 * @returns {vscode.Disposable[]}
 */
function registerStatusBar(registry) {
  const item = vscode.window.createStatusBarItem('claude-local.status', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Claude Code Local';
  const update = () => {
    const waiting = registry.anyWaitingForPermission();
    item.text = waiting ? '✻ Claude · ממתין לאישור' : '✻ Claude';
    item.tooltip = waiting ? 'Claude ממתין לאישור שלך' : 'פתיחת Claude';
    item.command = settings.get('useTerminal') ? 'claude-local.terminal.open' : 'claude-local.editor.openLast';
  };
  update();
  item.show();
  return [item, registry.onDidChange(update), settings.onDidChange(update)];
}

module.exports = { registerStatusBar };
