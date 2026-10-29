/**
 * What the user is looking at: the last file editor and its selection. Pushes `context` to every chat (debounced
 * 150 ms) and adds the open file and selection to each sent message (`attachOpenFile`, `attachSelection`).
 */
const vscode = require('vscode');
const settings = require('../util/settings');
const { selectionLines } = require('./mention-format');
const { isContentExcluded } = require('./workspace-exclusions');

const DEBOUNCE_MS = 150;

/**
 * @param {import('../panels/panel-registry').PanelRegistry} registry
 * @returns {{current:()=>vscode.TextEditor|null, contextFor:(editor:vscode.TextEditor|null)=>object|null,
 *   sendContext:(conversation:object)=>string, clear:(conversation:object)=>void, disposables:vscode.Disposable[]}}
 */
function createEditorContext(registry) {
  let lastEditor = vscode.window.activeTextEditor || null;
  let timer = null;
  const cleared = new WeakSet(); // conversations whose chip was clicked: no context on their next message

  /** The last file editor in a workspace folder that is still open. */
  const current = () => {
    if (!lastEditor || lastEditor.document.isClosed) return null;
    const uri = lastEditor.document.uri;
    return uri.scheme === 'file' && vscode.workspace.getWorkspaceFolder(uri) ? lastEditor : null;
  };

  /** @returns {{file:string, selection:{start:number, end:number, lines:number}|null}|null} the `context` message body */
  const contextFor = editor => {
    if (!editor) return null;
    const lines = selectionLines(editor.selection);
    return {
      file: vscode.workspace.asRelativePath(editor.document.uri, false),
      selection: lines ? { start: lines.start, end: lines.end, lines: lines.end - lines.start + 1 } : null,
    };
  };

  const push = () => {
    const value = contextFor(current());
    const visible = value && {
      file: settings.get('attachOpenFile') || (value.selection && settings.get('attachSelection')) ? value.file : null,
      selection: settings.get('attachSelection') ? value.selection : null,
    };
    for (const entry of registry.all()) {
      // A cleared chip stays hidden until the next message: that message goes without context.
      const show = visible && visible.file && !cleared.has(entry.conversation);
      entry.conversation.post({ type: 'context', ...(show ? visible : { file: null, selection: null }) });
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(push, DEBOUNCE_MS);
  };

  /** @returns {string} the text added to a message for Claude */
  const sendContext = conversation => {
    if (cleared.has(conversation)) {
      cleared.delete(conversation);
      schedule(); // the chip comes back for the message after this one
      return '';
    }
    const editor = current();
    if (!editor) return '';
    const relative = vscode.workspace.asRelativePath(editor.document.uri, false);
    const lines = selectionLines(editor.selection);
    const parts = [];
    if (lines && settings.get('attachSelection')) {
      const range = lines.start === lines.end ? `שורה ${lines.start}` : `שורות ${lines.start}-${lines.end}`;
      if (isContentExcluded(editor.document.uri)) {
        parts.push(`הקטע המסומן: ${relative} ${range} (הקובץ מוחרג, התוכן לא צורף)`);
      } else {
        const text = editor.document.getText(editor.selection);
        parts.push(`הקטע המסומן ב-${relative} ${range}:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``);
      }
    } else if (settings.get('attachOpenFile')) {
      parts.push(`הקובץ הפתוח: ${relative}`);
    }
    return parts.join('\n');
  };

  const disposables = [
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.uri.scheme === 'file') lastEditor = editor;
      schedule();
    }),
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.document.uri.scheme === 'file') lastEditor = event.textEditor;
      schedule();
    }),
    registry.onDidChange(schedule),
    settings.onDidChange(schedule),
    new vscode.Disposable(() => clearTimeout(timer)),
  ];

  return {
    current,
    contextFor,
    sendContext,
    /** The chip was clicked: the next message of this conversation goes without editor context. */
    clear: conversation => {
      cleared.add(conversation);
      conversation.post({ type: 'context', file: null, selection: null });
    },
    disposables,
  };
}

module.exports = { createEditorContext };
