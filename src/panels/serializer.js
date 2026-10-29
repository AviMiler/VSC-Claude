/**
 * Restores Claude tabs after a window reload from the state each webview saved ({sessionId, mode, model, title,
 * running}); the process restarts with `--resume`, and `continueAfterReload` continues a turn that was running.
 */
const vscode = require('vscode');
const { openChatPanel, VIEW_TYPE } = require('./chat-panel');

/**
 * @param {object} services
 * @returns {vscode.Disposable}
 */
function registerSerializer(services) {
  return vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
    async deserializeWebviewPanel(panel, state) {
      const saved = state && typeof state === 'object' ? state : {};
      openChatPanel(services, { panel, saved });
    },
  });
}

module.exports = { registerSerializer };
