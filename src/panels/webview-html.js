/**
 * Webview options and HTML for every webview (chat, sessions list): strict CSP with a nonce, local resources only.
 */
const fs = require('fs');
const vscode = require('vscode');
const { createNonce } = require('../util/nonce');

/**
 * @param {vscode.Uri} extensionUri
 * @returns {vscode.WebviewOptions}
 */
function webviewOptions(extensionUri) {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview'), vscode.Uri.joinPath(extensionUri, 'resources')],
  };
}

/**
 * Fills `webview/<folder>/index.html`: {{csp}}, {{nonce}}, {{base}} (the folder's webview URI), {{resources}}.
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @param {'chat'|'sessions'} folder
 * @returns {string}
 */
function renderHtml(webview, extensionUri, folder) {
  const nonce = createNonce();
  const source = webview.cspSource;
  const csp = [
    "default-src 'none'", `img-src ${source} data: blob:`, `style-src ${source}`, `script-src 'nonce-${nonce}'`,
    `font-src ${source}`,
  ].join('; ');
  const template = fs.readFileSync(vscode.Uri.joinPath(extensionUri, 'webview', folder, 'index.html').fsPath, 'utf8');
  const values = {
    csp, nonce,
    base: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview')).toString(),
    resources: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources')).toString(),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));
}

module.exports = { webviewOptions, renderHtml };
