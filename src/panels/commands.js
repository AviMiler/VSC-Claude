/**
 * Commands that open, focus and manage Claude conversations (tabs, sidebar, window), plus showLogs and the walkthrough.
 */
const vscode = require('vscode');
const settings = require('../util/settings');
const { openChatPanel } = require('./chat-panel');

const WALKTHROUGH_ID = 'local.claude-local#claude-local-walkthrough';

/**
 * @param {object} services shared services; `services.sidebar()` returns the sidebar provider in use
 * @returns {vscode.Disposable[]}
 */
function registerPanelCommands(services) {
  const { registry, logger } = services;
  let lastTextEditor = vscode.window.activeTextEditor;

  /** The column for a new tab: the group Claude tabs already use, else beside the active editor. */
  const newTabColumn = () => {
    const existing = registry.all().find(entry => entry.panel);
    if (existing && existing.panel.viewColumn) return existing.panel.viewColumn;
    return vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  };
  const openTab = (options = {}) => openChatPanel(services, { viewColumn: newTabColumn(), ...options });

  /** Reveals the conversation used last, or opens one where `preferredLocation` says. */
  const revealLastOrOpen = async () => {
    const last = registry.lastActive();
    if (last) {
      await last.reveal();
      return last;
    }
    if (settings.get('preferredLocation') === 'sidebar') return services.sidebar().reveal();
    return openTab();
  };

  const postToLast = async type => {
    const entry = await revealLastOrOpen();
    if (entry) entry.conversation.post({ type });
  };

  const activeTabOrWarn = () => {
    const entry = registry.activeTab();
    if (!entry) vscode.window.showInformationMessage('אין כרטיסיית Claude פעילה.');
    return entry;
  };

  const commands = {
    'claude-local.editor.open': () => openTab(),
    'claude-local.editor.openLast': async () => {
      const lastTab = [registry.lastActive(), ...registry.all()].find(entry => entry && entry.panel);
      if (lastTab) return lastTab.reveal();
      return openTab();
    },
    'claude-local.primaryEditor.open': () => openChatPanel(services, { viewColumn: vscode.ViewColumn.One }),
    'claude-local.window.open': async () => {
      openTab();
      await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    },
    'claude-local.sidebar.open': () => services.sidebar().reveal(),
    'claude-local.newConversation': () => {
      const tab = registry.activeTab();
      if (tab) return openChatPanel(services, { viewColumn: tab.panel.viewColumn });
      return services.sidebar().newConversation();
    },
    'claude-local.reopenClosedSession': () => {
      const session = registry.popClosed();
      if (session) openTab({ saved: session });
    },
    'claude-local.focus': () => postToLast('focus'),
    'claude-local.blur': async () => {
      if (lastTextEditor && !lastTextEditor.document.isClosed) {
        await vscode.window.showTextDocument(lastTextEditor.document, { viewColumn: lastTextEditor.viewColumn, preserveFocus: false });
      } else {
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
      }
    },
    'claude-local.focusLastMessage': () => postToLast('focusLastMessage'),
    'claude-local.toggleFocusView': () => postToLast('toggleFocusView'),
    'claude-local.renameSessionTab': async () => {
      const entry = activeTabOrWarn();
      if (!entry) return;
      const title = await vscode.window.showInputBox({ prompt: 'שם חדש לשיחה', value: entry.conversation.title });
      if (title && title.trim()) {
        entry.conversation.rename(title.trim());
        services.events.fire({ type: 'renamed', sessionId: entry.conversation.sessionId, title: title.trim() });
      }
    },
    'claude-local.markSessionUnread': () => {
      const entry = activeTabOrWarn();
      if (!entry) return;
      entry.conversation.markUnread();
      services.events.fire({ type: 'unread', sessionId: entry.conversation.sessionId });
    },
    'claude-local.showLogs': () => logger.show(),
    'claude-local.openWalkthrough': () => vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false),
  };

  return [
    vscode.window.onDidChangeActiveTextEditor(editor => { if (editor) lastTextEditor = editor; }),
    ...Object.entries(commands).map(([id, handler]) => vscode.commands.registerCommand(id, handler)),
  ];
}

module.exports = { registerPanelCommands };
