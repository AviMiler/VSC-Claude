// Panel registry: the open chat tabs and the sidebar, the last active one, closed sessions, group locking and the editor to return to.
const vscode = require('vscode');
const { ChatPanel } = require('./chat-panel');
const settings = require('../util/settings');

const CLOSED_STACK_SIZE = 10;

/**
 * A surface that shows a conversation: a ChatPanel or the SidebarView.
 * @typedef {{kind: 'panel'|'sidebar', conversation: import('./conversation').Conversation, reveal(preserveFocus?: boolean): any, focusInput(): any, post(msg: object): void}} Surface
 */

class PanelRegistry {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('../util/logger').Logger} log
   */
  constructor(context, log) {
    this.extensionUri = context.extensionUri;
    this.log = log;
    /** @type {Set<ChatPanel>} */
    this.panels = new Set();
    /** @type {import('./sidebar-view').SidebarView|undefined} */
    this.sidebar = undefined;
    /** @type {Surface|undefined} */
    this.active = undefined;
    /** @type {ChatPanel|undefined} */
    this.lastPanel = undefined;
    /** @type {string[]} */
    this.closedSessions = [];
    /** @type {vscode.TextEditor|undefined} */
    this.lastTextEditor = vscode.window.activeTextEditor;
    /** @type {() => void} */
    this.onAttention = () => {};
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.uri.scheme !== 'output') this.lastTextEditor = editor;
      }),
    );
  }

  /** @returns {Surface[]} */
  surfaces() {
    const all = /** @type {Surface[]} */ (Array.from(this.panels));
    if (this.sidebar) all.push(this.sidebar);
    return all;
  }

  /** @param {Surface} surface */
  setActive(surface) {
    this.active = surface;
    if (surface.kind === 'panel') this.lastPanel = /** @type {ChatPanel} */ (surface);
  }

  /**
   * The active Claude surface: the focused tab, the focused sidebar, else the last one used.
   * @returns {Surface|undefined}
   */
  activeSurface() {
    for (const p of this.panels) if (p.panel.active) return p;
    if (this.sidebar && this.sidebar.focused) return this.sidebar;
    if (this.active && (this.active.kind === 'sidebar' || this.panels.has(/** @type {ChatPanel} */ (this.active)))) return this.active;
    return undefined;
  }

  /** @returns {ChatPanel|undefined} the panel that is the active editor */
  activePanel() {
    for (const p of this.panels) if (p.panel.active) return p;
    return undefined;
  }

  /**
   * Opens a conversation in a new editor tab.
   * @param {{column?: vscode.ViewColumn, restore?: import('./conversation').SavedState, lock?: boolean}} [opts]
   * @returns {ChatPanel}
   */
  openPanel(opts = {}) {
    const column = opts.column || this.newPanelColumn();
    const panel = ChatPanel.create(this, { column, restore: opts.restore });
    this.track(panel);
    if (opts.lock !== false && settings.get('lockEditorGroups') !== false) {
      vscode.commands.executeCommand('workbench.action.lockEditorGroup').then(undefined, () => {});
    }
    return panel;
  }

  /**
   * Restores a tab after a reload (WebviewPanelSerializer).
   * @param {vscode.WebviewPanel} webviewPanel
   * @param {import('./conversation').SavedState|undefined} state
   */
  restorePanel(webviewPanel, state) {
    const panel = new ChatPanel(this, webviewPanel, state && state.sessionId ? state : undefined);
    this.track(panel);
    return panel;
  }

  /** @param {ChatPanel} panel */
  track(panel) {
    this.panels.add(panel);
    this.setActive(panel);
    this.attentionChanged();
  }

  /** @returns {vscode.ViewColumn} — next to an existing Claude tab, beside the editor, or the active group */
  newPanelColumn() {
    const existing = this.lastPanel && this.panels.has(this.lastPanel) ? this.lastPanel : this.panels.values().next().value;
    if (existing && existing.panel.viewColumn) return existing.panel.viewColumn;
    return vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  }

  /** @returns {vscode.ViewColumn} — where files Claude opens go: a group without a Claude tab */
  openFileColumn() {
    const claudeColumns = new Set(Array.from(this.panels).map((p) => p.panel.viewColumn));
    const last = this.lastTextEditor && this.lastTextEditor.viewColumn;
    if (last && !claudeColumns.has(last)) return last;
    return claudeColumns.has(vscode.ViewColumn.One) ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
  }

  /** @param {ChatPanel} panel */
  panelClosed(panel) {
    this.panels.delete(panel);
    if (this.lastPanel === panel) this.lastPanel = undefined;
    if (this.active === panel) this.active = undefined;
    const sessionId = panel.conversation.sessionId;
    if (sessionId) {
      this.closedSessions = this.closedSessions.filter((s) => s !== sessionId);
      this.closedSessions.push(sessionId);
      if (this.closedSessions.length > CLOSED_STACK_SIZE) this.closedSessions.shift();
    }
    vscode.commands.executeCommand('setContext', 'claude-local.lastClosedWasSession', this.closedSessions.length > 0);
    this.attentionChanged();
  }

  /** @returns {ChatPanel|undefined} */
  reopenClosed() {
    const sessionId = this.closedSessions.pop();
    vscode.commands.executeCommand('setContext', 'claude-local.lastClosedWasSession', this.closedSessions.length > 0);
    if (!sessionId) return undefined;
    return this.openPanel({ restore: { sessionId } });
  }

  /** Returns focus to the last text editor. */
  async focusLastEditor() {
    const editor = this.lastTextEditor;
    if (editor && !editor.document.isClosed) {
      await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
    } else {
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    }
  }

  /** @returns {number} conversations waiting for a permission answer */
  pendingCount() {
    return this.surfaces().filter((s) => s.conversation.attention() === 'pending').length;
  }

  attentionChanged() {
    this.onAttention();
  }

  /** @param {boolean} processSettingChanged */
  settingsChanged(processSettingChanged) {
    for (const s of this.surfaces()) s.conversation.onSettingsChanged(processSettingChanged);
  }

  dispose() {
    for (const p of Array.from(this.panels)) p.conversation.dispose();
    this.panels.clear();
  }
}

module.exports = { PanelRegistry };
