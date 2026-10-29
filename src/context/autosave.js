/**
 * `autosave`: before Claude reads or writes a file whose document has unsaved changes, the document is saved.
 */
const path = require('path');
const vscode = require('vscode');
const settings = require('../util/settings');

const FILE_TOOLS = new Set(['Read', 'Edit', 'MultiEdit', 'Write']);

/**
 * A `beforePermission` hook; never takes over the prompt.
 * @param {import('../panels/conversation').Conversation} conversation
 * @param {{toolName:string, input:{file_path?:string}}} prompt
 * @returns {Promise<false>}
 */
async function saveBeforeTool(conversation, prompt) {
  if (!settings.get('autosave') || !FILE_TOOLS.has(prompt.toolName) || !prompt.input.file_path) return false;
  const target = path.resolve(conversation.sessionState().cwd, prompt.input.file_path);
  const document = vscode.workspace.textDocuments.find(doc => doc.uri.scheme === 'file'
    && path.resolve(doc.uri.fsPath).toLowerCase() === target.toLowerCase());
  if (document && document.isDirty) await document.save();
  return false;
}

module.exports = { saveBeforeTool };
