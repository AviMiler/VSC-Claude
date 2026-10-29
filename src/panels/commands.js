// Commands: the claude-local.* commands for opening, focusing and managing chat tabs and the sidebar.
const vscode = require('vscode');
const settings = require('../util/settings');

/**
 * @param {vscode.ExtensionContext} context
 * @param {{registry: import('./panel-registry').PanelRegistry, sidebar: import('./sidebar-view').SidebarView, log: import('../util/logger').Logger}} services
 */
function registerCommands(context, { registry, sidebar, log }) {
  const openLast = () => {
    const last = registry.lastPanel && registry.panels.has(registry.lastPanel) ? registry.lastPanel : undefined;
    if (last) last.focusInput();
    else registry.openPanel().focusInput();
  };

  /** Focuses the last active Claude input, opening a conversation where `preferredLocation` says when none is open. */
  const focus = async () => {
    const surface = registry.activeSurface() || registry.lastPanel;
    if (surface) return surface.focusInput();
    if (settings.get('preferredLocation') === 'sidebar') return sidebar.focusInput();
    return registry.openPanel().focusInput();
  };

  /** @param {object} msg */
  const postToActive = (msg) => {
    const surface = registry.activeSurface();
    if (surface) surface.post(msg);
  };

  const handlers = {
    'claude-local.editor.open': () => registry.openPanel(),
    'claude-local.editor.openLast': openLast,
    'claude-local.primaryEditor.open': () => registry.openPanel({ column: vscode.ViewColumn.One, lock: false }),
    'claude-local.window.open': async () => {
      registry.openPanel({ lock: false });
      await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    },
    'claude-local.sidebar.open': () => sidebar.focusInput(),
    'claude-local.newConversation': () => {
      const surface = registry.activeSurface();
      if (surface) surface.conversation.newConversation();
      else registry.openPanel();
    },
    'claude-local.reopenClosedSession': () => {
      if (!registry.reopenClosed()) vscode.window.showInformationMessage('אין שיחה סגורה לפתוח מחדש.');
    },
    'claude-local.focus': focus,
    'claude-local.blur': () => registry.focusLastEditor(),
    'claude-local.focusLastMessage': () => postToActive({ type: 'focusLastMessage' }),
    'claude-local.toggleFocusView': () => postToActive({ type: 'toggleFocusView' }),
    'claude-local.renameSessionTab': async () => {
      const panel = registry.activePanel() || registry.lastPanel;
      if (!panel) return;
      const title = await vscode.window.showInputBox({ prompt: 'שם חדש ללשונית', value: panel.conversation.title });
      if (!title || !title.trim()) return;
      panel.conversation.title = title.trim();
      panel.panel.title = panel.conversation.title;
      panel.post({ type: 'session', sessionId: panel.conversation.sessionId, mode: panel.conversation.mode, model: panel.conversation.model, title: panel.conversation.title });
    },
    'claude-local.showLogs': () => log.show(),
  };

  for (const [id, handler] of Object.entries(handlers)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args) => {
        try {
          await handler(...args);
        } catch (err) {
          log.error(`${id}: ${err && err.stack ? err.stack : err}`);
          vscode.window.showErrorMessage(`Claude Code Local: ${err && err.message ? err.message : err}`);
        }
      }),
    );
  }
}

module.exports = { registerCommands };
