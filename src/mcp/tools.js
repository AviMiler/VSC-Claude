/**
 * The VS Code tools Claude can call: getDiagnostics and getOpenEditors (shared by the in-process SDK server and,
 * in M4, the IDE WebSocket server).
 */
const vscode = require('vscode');

const SEVERITY = ['Error', 'Warning', 'Information', 'Hint'];

/** @param {vscode.Range} range */
const plainRange = range => ({
  start: { line: range.start.line, character: range.start.character },
  end: { line: range.end.line, character: range.end.character },
});

/** @param {vscode.Uri} uri @param {readonly vscode.Diagnostic[]} diagnostics */
const shapeDiagnostics = (uri, diagnostics) => ({
  uri: uri.toString(),
  diagnostics: diagnostics.map(diagnostic => ({
    severity: SEVERITY[diagnostic.severity] || 'Information',
    message: diagnostic.message,
    range: plainRange(diagnostic.range),
    source: diagnostic.source || '',
  })),
});

/**
 * @param {{uri?:string}} args a file URI or path; all files when missing
 * @returns {Promise<object[]>}
 */
async function getDiagnostics(args) {
  if (args && args.uri) {
    const uri = /^[a-z][\w+.-]+:/i.test(args.uri) && !/^[a-z]:[\\/]/i.test(args.uri)
      ? vscode.Uri.parse(args.uri) : vscode.Uri.file(args.uri);
    return [shapeDiagnostics(uri, vscode.languages.getDiagnostics(uri))];
  }
  return vscode.languages.getDiagnostics()
    .filter(([, diagnostics]) => diagnostics.length)
    .map(([uri, diagnostics]) => shapeDiagnostics(uri, diagnostics));
}

/** @returns {Promise<object[]>} the visible text editors */
async function getOpenEditors() {
  const active = vscode.window.activeTextEditor;
  return vscode.window.visibleTextEditors.map(editor => ({
    path: editor.document.uri.scheme === 'file' ? editor.document.uri.fsPath : editor.document.uri.toString(),
    language: editor.document.languageId,
    isDirty: editor.document.isDirty,
    isActive: editor === active,
    selection: plainRange(editor.selection),
  }));
}

/** @returns {import('./sdk-server').Tool[]} */
function panelTools() {
  return [
    {
      name: 'getDiagnostics',
      description: 'Get language diagnostics (errors, warnings) from VS Code. Read-only.',
      inputSchema: { type: 'object', properties: { uri: { type: 'string', description: 'File URI or path; omit for all files' } } },
      run: getDiagnostics,
    },
    {
      name: 'getOpenEditors',
      description: 'List the text editors visible in VS Code with path, language, unsaved state and selection.',
      inputSchema: { type: 'object', properties: {} },
      run: getOpenEditors,
    },
  ];
}

module.exports = { panelTools, getDiagnostics, getOpenEditors, plainRange };
