// Chat panel: an editor tab (WebviewPanel `claudeLocalPanel`) showing one conversation, with its title and status dot.
const vscode = require('vscode');
const { Conversation } = require('./conversation');
const { webviewOptions, chatHtml } = require('./webview-html');

const VIEW_TYPE = 'claudeLocalPanel';

/** @typedef {import('./panel-registry').PanelRegistry} PanelRegistry */

class ChatPanel {
  /**
   * @param {PanelRegistry} registry
   * @param {vscode.WebviewPanel} panel
   * @param {import('./conversation').SavedState} [restore]
   */
  constructor(registry, panel, restore) {
    this.kind = 'panel';
    this.registry = registry;
    this.panel = panel;
    const uri = registry.extensionUri;
    panel.webview.options = webviewOptions(uri);
    this.conversation = new Conversation({
      log: registry.log,
      kind: 'panel',
      restore,
      onTitle: (title) => {
        this.panel.title = title;
      },
      onAttention: () => {
        this.updateIcon();
        registry.attentionChanged();
      },
      onFocusChange: () => {},
      openFileColumn: () => registry.openFileColumn(),
    });
    this.conversation.isVisible = () => this.panel.visible;
    this.conversation.attach(panel.webview);
    panel.title = this.conversation.title;
    panel.webview.html = chatHtml(panel.webview, uri);
    this.updateIcon();
    panel.onDidChangeViewState(() => {
      if (this.panel.visible) this.conversation.markSeen();
      if (this.panel.active) registry.setActive(this);
    });
    panel.onDidDispose(() => {
      this.disposed = true;
      registry.panelClosed(this);
      this.conversation.dispose();
    });
  }

  /**
   * @param {PanelRegistry} registry
   * @param {{column: vscode.ViewColumn, restore?: import('./conversation').SavedState, preserveFocus?: boolean}} opts
   * @returns {ChatPanel}
   */
  static create(registry, opts) {
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'Claude',
      { viewColumn: opts.column, preserveFocus: !!opts.preserveFocus },
      { ...webviewOptions(registry.extensionUri), retainContextWhenHidden: true },
    );
    return new ChatPanel(registry, panel, opts.restore);
  }

  updateIcon() {
    if (this.disposed) return;
    const attention = this.conversation.attention();
    const file = attention === 'pending' ? 'claude-logo-pending.svg' : attention === 'done' ? 'claude-logo-done.svg' : 'claude-logo.svg';
    this.panel.iconPath = vscode.Uri.joinPath(this.registry.extensionUri, 'resources', file);
  }

  /** @param {boolean} [preserveFocus] */
  reveal(preserveFocus = false) {
    this.panel.reveal(this.panel.viewColumn, preserveFocus);
  }

  focusInput() {
    this.reveal(false);
    this.conversation.post({ type: 'focus' });
  }

  /** @param {object} msg */
  post(msg) {
    this.conversation.post(msg);
  }
}

module.exports = { ChatPanel, VIEW_TYPE };
