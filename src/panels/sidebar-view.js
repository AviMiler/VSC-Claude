// Sidebar view: the chat in the secondary sidebar or the activity bar (WebviewView), and the placement context key.
const vscode = require('vscode');
const { Conversation } = require('./conversation');
const { webviewOptions, chatHtml } = require('./webview-html');

const ACTIVITY_BAR_VIEW = 'claudeLocalSidebar';
const SECONDARY_VIEW = 'claudeLocalSidebarSecondary';
/** Not verified: the first VS Code version assumed to show `viewsContainers.secondarySidebar`. */
const SECONDARY_SIDEBAR_MIN = [1, 106];
const STATE_KEY = 'claudeLocal.sidebarSession';

/** @returns {boolean} */
function supportsSecondarySidebar() {
  const [major, minor] = vscode.version.split('.').map((n) => parseInt(n, 10));
  return major > SECONDARY_SIDEBAR_MIN[0] || (major === SECONDARY_SIDEBAR_MIN[0] && minor >= SECONDARY_SIDEBAR_MIN[1]);
}

/** @returns {string} the sidebar view id for this VS Code */
function sidebarViewId() {
  return supportsSecondarySidebar() ? SECONDARY_VIEW : ACTIVITY_BAR_VIEW;
}

/** @implements {vscode.WebviewViewProvider} */
class SidebarView {
  /**
   * @param {import('./panel-registry').PanelRegistry} registry
   * @param {vscode.ExtensionContext} context
   */
  constructor(registry, context) {
    this.kind = 'sidebar';
    this.registry = registry;
    this.context = context;
    /** @type {vscode.WebviewView|undefined} */
    this.view = undefined;
    this.focused = false;
    this.conversation = new Conversation({
      log: registry.log,
      kind: 'sidebar',
      restore: context.workspaceState.get(STATE_KEY),
      onAttention: () => registry.attentionChanged(),
      onState: () => this.saveState(),
      onFocusChange: (focused) => {
        this.focused = focused;
        if (focused) registry.setActive(this);
        this.updateContext();
      },
      openFileColumn: () => registry.openFileColumn(),
    });
    this.conversation.isVisible = () => !!(this.view && this.view.visible);
  }

  /** @param {vscode.WebviewView} view */
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = webviewOptions(this.registry.extensionUri);
    this.conversation.attach(view.webview);
    view.webview.html = chatHtml(view.webview, this.registry.extensionUri);
    view.onDidChangeVisibility(() => {
      if (view.visible) this.conversation.markSeen();
      else this.focused = false;
      this.updateContext();
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
      this.focused = false;
      this.updateContext();
    });
  }

  updateContext() {
    const active = !!(this.view && this.view.visible && this.focused);
    vscode.commands.executeCommand('setContext', 'claude-local.sideBarActive', active);
  }

  saveState() {
    this.context.workspaceState.update(STATE_KEY, this.conversation.sessionId ? this.conversation.savedState() : undefined);
  }

  /** @param {boolean} [preserveFocus] */
  async reveal(preserveFocus = false) {
    if (this.view) this.view.show(preserveFocus);
    else await vscode.commands.executeCommand(`${sidebarViewId()}.focus`);
  }

  async focusInput() {
    await this.reveal(false);
    this.conversation.post({ type: 'focus' });
  }

  /** @param {object} msg */
  post(msg) {
    this.conversation.post(msg);
  }

  dispose() {
    this.saveState();
    this.conversation.dispose();
  }
}

/**
 * Registers the provider for both view ids and sets the placement context key.
 * @param {import('./panel-registry').PanelRegistry} registry
 * @param {vscode.ExtensionContext} context
 * @returns {SidebarView}
 */
function registerSidebar(registry, context) {
  vscode.commands.executeCommand('setContext', 'claude-local:doesNotSupportSecondarySidebar', !supportsSecondarySidebar());
  const sidebar = new SidebarView(registry, context);
  const options = { webviewOptions: { retainContextWhenHidden: true } };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ACTIVITY_BAR_VIEW, sidebar, options),
    vscode.window.registerWebviewViewProvider(SECONDARY_VIEW, sidebar, options),
    sidebar,
  );
  return sidebar;
}

module.exports = { registerSidebar, sidebarViewId, supportsSecondarySidebar };
