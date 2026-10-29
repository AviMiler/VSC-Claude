/**
 * A conversation in an editor tab: the WebviewPanel `claudeLocalPanel`, its title, its status icon and its lifetime.
 */
const vscode = require('vscode');
const settings = require('../util/settings');
const { Conversation } = require('./conversation');
const { routeMessage } = require('./message-router');
const { webviewOptions, renderHtml } = require('./webview-html');

const VIEW_TYPE = 'claudeLocalPanel';
const DEFAULT_TITLE = 'Claude';

/**
 * @param {vscode.Uri} extensionUri
 * @param {'idle'|'pending'|'unread'} status
 * @returns {vscode.Uri}
 */
function iconFor(extensionUri, status) {
  const file = { idle: 'claude-logo.svg', pending: 'claude-logo-pending.svg', unread: 'claude-logo-unread.svg' }[status];
  return vscode.Uri.joinPath(extensionUri, 'resources', file);
}

/**
 * @param {object} services shared services (extension.js)
 * @param {{viewColumn?:vscode.ViewColumn, preserveFocus?:boolean, saved?:object, panel?:vscode.WebviewPanel}} options
 *   panel: an existing panel to fill (restored after a reload by the serializer)
 * @returns {import('./panel-registry').Entry}
 */
function openChatPanel(services, { viewColumn = vscode.ViewColumn.Active, preserveFocus = false, saved, panel: restored } = {}) {
  const { context, registry } = services;
  const panel = restored || vscode.window.createWebviewPanel(VIEW_TYPE, DEFAULT_TITLE, { viewColumn, preserveFocus }, {
    ...webviewOptions(context.extensionUri), retainContextWhenHidden: true,
  });
  panel.webview.options = webviewOptions(context.extensionUri);
  const conversation = new Conversation({ services, kind: 'tab', saved });
  conversation.attach(panel.webview);

  /** @type {import('./panel-registry').Entry} */
  const entry = {
    conversation, kind: 'tab', panel,
    reveal: () => panel.reveal(panel.viewColumn, false),
  };
  const removeEntry = registry.add(entry);

  const refresh = () => {
    panel.title = conversation.title || DEFAULT_TITLE;
    const status = conversation.waitingForPermission ? 'pending' : (conversation.unread ? 'unread' : 'idle');
    panel.iconPath = iconFor(context.extensionUri, status);
  };
  refresh();

  const disposables = [
    conversation.onDidChange(refresh),
    panel.webview.onDidReceiveMessage(message => routeMessage(conversation, message, services.webviewHost(entry))),
    panel.onDidChangeViewState(({ webviewPanel }) => {
      conversation.setVisible(webviewPanel.visible);
      if (webviewPanel.active) registry.setActive(entry);
    }),
  ];
  panel.onDidDispose(() => {
    if (conversation.sessionId) {
      registry.pushClosed({ sessionId: conversation.sessionId, title: conversation.title, mode: conversation.mode, model: conversation.model });
    }
    disposables.forEach(disposable => disposable.dispose());
    removeEntry.dispose();
    conversation.dispose();
  });

  panel.webview.html = renderHtml(panel.webview, context.extensionUri, 'chat');
  if (!restored && settings.get('lockEditorGroups') && viewColumn !== vscode.ViewColumn.One) {
    vscode.commands.executeCommand('workbench.action.lockEditorGroup');
  }
  return entry;
}

module.exports = { openChatPanel, VIEW_TYPE };
