// Webview HTML: the chat shell with its CSP nonce, local resource roots and asset URIs.
const vscode = require('vscode');
const { nonce } = require('../util/nonce');

/**
 * Options for any webview that shows the chat (panel or view).
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
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @returns {string}
 */
function chatHtml(webview, extensionUri) {
  const n = nonce();
  const asset = (...p) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...p)).toString();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${n}' ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset('webview', 'chat', 'chat.css')}">
<title>Claude</title>
</head>
<body>
<div id="app" data-logo="${asset('resources', 'claude-logo.svg')}"></div>
<script type="module" nonce="${n}" src="${asset('webview', 'chat', 'app.js')}"></script>
</body>
</html>`;
}

module.exports = { webviewOptions, chatHtml };
