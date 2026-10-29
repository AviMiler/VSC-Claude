// Serializer: restores Claude tabs after a window reload from the state each webview saved.
const vscode = require('vscode');
const { VIEW_TYPE } = require('./chat-panel');

/**
 * @param {vscode.ExtensionContext} context
 * @param {import('./panel-registry').PanelRegistry} registry
 */
function registerSerializer(context, registry) {
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      /**
       * @param {vscode.WebviewPanel} webviewPanel
       * @param {any} state — `{sessionId, mode, model, running, title}` from the webview's setState
       */
      async deserializeWebviewPanel(webviewPanel, state) {
        registry.restorePanel(webviewPanel, state || undefined);
      },
    }),
  );
}

module.exports = { registerSerializer };
