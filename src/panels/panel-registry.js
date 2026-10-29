/**
 * Every open conversation (tabs and sidebar views): the last active one, the closed-session stack, and the
 * context keys `claude-local.sideBarActive` and `claude-local.lastClosedWasSession`.
 */
const vscode = require('vscode');

const CLOSED_STACK_SIZE = 10;

/**
 * @typedef {{conversation:import('./conversation').Conversation, kind:'tab'|'sidebar',
 *   reveal:()=>Promise<void>|void, panel?:vscode.WebviewPanel}} Entry
 * @typedef {{sessionId:string, title:string, mode:string, model:string}} ClosedSession
 */

class PanelRegistry {
  constructor() {
    /** @type {Set<Entry>} */
    this.entries = new Set();
    /** @type {Entry|null} */
    this.last = null;
    /** @type {ClosedSession[]} */
    this.closed = [];
    this.changeEmitter = new vscode.EventEmitter();
    /** Fires when any conversation changes (status bar, sessions list). */
    this.onDidChange = this.changeEmitter.event;
    this.disposables = [this.changeEmitter];
  }

  /**
   * @param {Entry} entry
   * @returns {vscode.Disposable} removes the entry
   */
  add(entry) {
    this.entries.add(entry);
    this.last = entry;
    const listener = entry.conversation.onDidChange(() => this.changeEmitter.fire());
    this.changeEmitter.fire();
    return new vscode.Disposable(() => {
      listener.dispose();
      this.entries.delete(entry);
      if (this.last === entry) this.last = [...this.entries].pop() || null;
      this.changeEmitter.fire();
    });
  }

  /** @param {Entry} entry */
  setActive(entry) {
    if (this.entries.has(entry)) this.last = entry;
  }

  /** @returns {Entry|null} */
  lastActive() {
    return this.last && this.entries.has(this.last) ? this.last : null;
  }

  /** @returns {Entry|undefined} the entry whose conversation is the given CLI session */
  findBySession(sessionId) {
    return [...this.entries].find(entry => entry.conversation.sessionId === sessionId);
  }

  /** @returns {Entry|undefined} the editor tab that is active right now */
  activeTab() {
    return [...this.entries].find(entry => entry.panel && entry.panel.active);
  }

  /** @returns {Entry[]} */
  all() {
    return [...this.entries];
  }

  anyWaitingForPermission() {
    return [...this.entries].some(entry => entry.conversation.waitingForPermission);
  }

  /** @param {ClosedSession} session */
  pushClosed(session) {
    this.closed = [session, ...this.closed.filter(item => item.sessionId !== session.sessionId)].slice(0, CLOSED_STACK_SIZE);
    this.setLastClosedWasSession(true);
  }

  /** @returns {ClosedSession|undefined} */
  popClosed() {
    const session = this.closed.shift();
    if (!this.closed.length) this.setLastClosedWasSession(false);
    return session;
  }

  /** @param {boolean} value */
  setLastClosedWasSession(value) {
    vscode.commands.executeCommand('setContext', 'claude-local.lastClosedWasSession', value);
  }

  /** @param {boolean} value */
  setSideBarActive(value) {
    vscode.commands.executeCommand('setContext', 'claude-local.sideBarActive', value);
  }

  /** A closed tab that is not a Claude conversation makes Ctrl+Shift+T VS Code's own again. */
  watchClosedTabs() {
    this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(event => {
      const otherClosed = event.closed.some(tab => !(tab.input instanceof vscode.TabInputWebview
        && String(tab.input.viewType).endsWith('claudeLocalPanel')));
      if (otherClosed) this.setLastClosedWasSession(false);
    }));
  }

  dispose() {
    for (const entry of [...this.entries]) entry.conversation.dispose();
    this.disposables.forEach(disposable => disposable.dispose());
  }
}

module.exports = { PanelRegistry };
