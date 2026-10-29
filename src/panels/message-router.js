/**
 * The webview → host `postMessage` table of a chat webview: each message type calls one Conversation action.
 */
const path = require('path');
const vscode = require('vscode');

/**
 * Opens a file a tool row links to, in a group that is not Claude's.
 * @param {string} filePath absolute, or relative to the conversation's cwd
 * @param {number|undefined} line 1-based
 * @param {string} cwd
 */
async function openFile(filePath, line, cwd) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolute));
  const position = new vscode.Position(Math.max(0, (Number(line) || 1) - 1), 0);
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One, preview: true, selection: new vscode.Range(position, position),
  });
}

/**
 * @param {import('./conversation').Conversation} conversation
 * @param {{type:string, [key:string]:any}} message
 * @param {{onFocusState:(focused:boolean)=>void, extraHandlers:Map<string, Function>}} host
 *   extraHandlers: message types other features answer (mentionQuery in editor context)
 */
function routeMessage(conversation, message, host) {
  switch (message.type) {
    case 'ready': return conversation.handleReady();
    case 'send': return conversation.send({ text: message.text, attachments: message.attachments || [], mentions: message.mentions || [] });
    case 'interrupt': return conversation.interrupt();
    case 'setMode': return conversation.setMode(message.value);
    case 'setModel': return conversation.setModel(message.value);
    case 'setThinking': return conversation.setThinking(message.value);
    case 'permissionAnswer': return conversation.answerPermission(message);
    case 'openFile':
      return openFile(String(message.path || ''), message.line, conversation.sessionState().cwd)
        .catch(error => vscode.window.showWarningMessage(`לא ניתן לפתוח את ${message.path}: ${error.message}`));
    case 'focusState': return host.onFocusState(Boolean(message.focused));
    case 'dismissOnboarding': return host.onDismissOnboarding();
    default: {
      const handler = host.extraHandlers.get(message.type);
      if (handler) return handler(conversation, message);
      return undefined;
    }
  }
}

module.exports = { routeMessage, openFile };
