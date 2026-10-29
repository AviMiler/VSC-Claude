/**
 * A conversation in a sidebar view: `claudeLocalSidebar` (activity bar) and `claudeLocalSidebarSecondary`
 * (secondary sidebar). Each view is its own conversation with its own process.
 */
const vscode = require('vscode');
const { Conversation } = require('./conversation');
const { routeMessage } = require('./message-router');
const { webviewOptions, renderHtml } = require('./webview-html');

const SIDEBAR_VIEW_IDS = ['claudeLocalSidebar', 'claudeLocalSidebarSecondary'];

/** @implements {vscode.WebviewViewProvider} */
class SidebarViewProvider {
  /**
   * @param {object} services shared services (extension.js)
   * @param {string} viewId
   */
  constructor(services, viewId) {
    this.services = services;
    this.viewId = viewId;
    /** @type {import('./panel-registry').Entry|null} */
    this.entry = null;
    this.view = null;
  }

  /** @param {vscode.WebviewView} view */
  resolveWebviewView(view) {
    const { context, registry } = this.services;
    this.view = view;
    view.webview.options = webviewOptions(context.extensionUri);
    const viewDisposables = [
      view.webview.onDidReceiveMessage(message => {
        if (this.entry) routeMessage(this.entry.conversation, message, this.services.webviewHost(this.entry));
      }),
      view.onDidChangeVisibility(() => {
        if (!this.entry) return;
        this.entry.conversation.setVisible(view.visible);
        if (view.visible) registry.setActive(this.entry);
        else registry.setSideBarActive(false);
      }),
    ];
    view.onDidDispose(() => {
      viewDisposables.forEach(disposable => disposable.dispose());
      this.endConversation();
      this.view = null;
      registry.setSideBarActive(false);
    });
    this.startConversation();
  }

  /** A fresh conversation in this view (a new webview document, a new process on first use). */
  startConversation() {
    const { context, registry } = this.services;
    const view = this.view;
    const conversation = new Conversation({ services: this.services, kind: 'sidebar' });
    conversation.attach(view.webview);
    const entry = { conversation, kind: 'sidebar', reveal: () => view.show(false) };
    this.entry = entry;
    this.removeEntry = registry.add(entry);
    view.webview.html = renderHtml(view.webview, context.extensionUri, 'chat');
  }

  endConversation() {
    if (!this.entry) return;
    this.removeEntry.dispose();
    this.entry.conversation.dispose();
    this.entry = null;
  }

  /** `claude-local.newConversation` while the sidebar is active: replaces its conversation. */
  async newConversation() {
    if (!this.view) return this.reveal();
    this.endConversation();
    this.startConversation();
    return this.entry;
  }

  /** Shows the view (its container is opened by VS Code's `<viewId>.focus` command). */
  async reveal() {
    await vscode.commands.executeCommand(`${this.viewId}.focus`);
    return this.entry;
  }
}

/**
 * @param {object} services
 * @returns {{providers:SidebarViewProvider[], disposables:vscode.Disposable[]}}
 */
function registerSidebarViews(services) {
  const providers = SIDEBAR_VIEW_IDS.map(viewId => new SidebarViewProvider(services, viewId));
  const disposables = providers.map(provider => vscode.window.registerWebviewViewProvider(provider.viewId, provider, {
    webviewOptions: { retainContextWhenHidden: true },
  }));
  return { providers, disposables };
}

module.exports = { registerSidebarViews, SidebarViewProvider };
