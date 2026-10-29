// Paths: the working folder for a new Claude process.
const os = require('os');
const vscode = require('vscode');

/**
 * The first workspace folder, or the folder of the active file's workspace when there are several.
 * No folder open: the user's home folder.
 * @returns {{cwd: string, isHome: boolean}}
 */
function conversationCwd() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) return { cwd: os.homedir(), isHome: true };
  const editor = vscode.window.activeTextEditor;
  if (folders.length > 1 && editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) return { cwd: folder.uri.fsPath, isHome: false };
  }
  return { cwd: folders[0].uri.fsPath, isHome: false };
}

module.exports = { conversationCwd };
