/**
 * The editor-context feature: open file and selection sent with messages, the `context` chip, Alt+K
 * (`insertAtMention`), the `@` search and autosave before file tools.
 */
const vscode = require('vscode');
const { createEditorContext } = require('./editor-context');
const { createMentions } = require('./mentions');
const { saveBeforeTool } = require('./autosave');
const { formatMention, selectionLines } = require('./mention-format');

/**
 * @param {vscode.ExtensionContext} context
 * @param {object} services shared services (extension.js; `revealConversation` comes from the panels feature)
 */
function register(context, services) {
  const editorContext = createEditorContext(services.registry);
  const mentions = createMentions();

  services.hooks.sendContext.push(conversation => editorContext.sendContext(conversation));
  services.hooks.sendContext.push((conversation, message) => mentions.sendContext(conversation, message));
  services.hooks.beforePermission.push(saveBeforeTool);

  services.webviewHandlers.set('clearContext', conversation => editorContext.clear(conversation));
  services.webviewHandlers.set('mentionQuery', async (conversation, message) => {
    try {
      const items = await mentions.search(String(message.query || ''));
      conversation.post({ type: 'mentionResults', query: message.query, items });
    } catch (error) {
      services.logger.warn(`mention search: ${error.message}`);
      conversation.post({ type: 'mentionResults', query: message.query, items: [] });
    }
  });

  const insertAtMention = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const relative = vscode.workspace.asRelativePath(editor.document.uri, false);
    const text = formatMention(relative, selectionLines(editor.selection));
    const entry = await services.revealConversation();
    if (entry) entry.conversation.post({ type: 'insertText', text });
  };

  context.subscriptions.push(
    ...editorContext.disposables,
    ...mentions.disposables,
    vscode.commands.registerCommand('claude-local.insertAtMention', insertAtMention),
  );
}

module.exports = { register };
