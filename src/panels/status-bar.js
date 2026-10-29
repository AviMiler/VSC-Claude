// Status bar: the "✻ Claude" item, showing when a conversation waits for a permission.
const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 * @param {import('./panel-registry').PanelRegistry} registry
 */
function registerStatusBar(context, registry) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'claude-local.editor.openLast';
  const update = () => {
    const pending = registry.pendingCount();
    item.text = pending ? '✻ Claude · ממתין לאישור' : '✻ Claude';
    item.tooltip = pending ? 'Claude ממתין לאישור שלך' : 'פתיחת Claude';
  };
  registry.onAttention = update;
  update();
  item.show();
  context.subscriptions.push(item);
}

module.exports = { registerStatusBar };
