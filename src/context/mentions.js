/**
 * The composer's `@` search (files, folders and integrated terminals) and the `@terminal:<name>` output that is
 * attached to a message (the last 200 lines, collected through shell integration).
 */
const path = require('path');
const vscode = require('vscode');
const { rankCandidates, foldersOf } = require('./mention-format');
const { excludeGlobs, createSearchFilter } = require('./workspace-exclusions');

const RESULT_LIMIT = 20;
const FILE_SCAN_LIMIT = 20000;
const FILE_CACHE_MS = 30000;
const TERMINAL_LINES = 200;
const TERMINAL_MENTION = /(?:^|\s)@terminal:(\S+)/g;
const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

/**
 * @typedef {{label:string, insert:string, kind:'file'|'folder'|'terminal', detail?:string}} MentionItem
 */

function createMentions() {
  let fileCache = null; // {at, paths:string[]} workspace-relative, `/`-separated
  const terminalLines = new Map(); // vscode.Terminal -> string[]

  async function workspacePaths() {
    if (fileCache && Date.now() - fileCache.at < FILE_CACHE_MS) return fileCache.paths;
    const folders = vscode.workspace.workspaceFolders || [];
    const paths = [];
    for (const folder of folders) {
      const globs = excludeGlobs(folder);
      const exclude = globs.length ? `{${globs.join(',')}}` : undefined;
      const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), exclude, FILE_SCAN_LIMIT);
      const isExcluded = createSearchFilter(folder);
      const prefix = folders.length > 1 ? `${folder.name}/` : '';
      for (const uri of uris) {
        const relative = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
        if (!isExcluded(relative)) paths.push(prefix + relative);
      }
    }
    fileCache = { at: Date.now(), paths };
    return paths;
  }

  /**
   * @param {string} query the text after `@`
   * @returns {Promise<MentionItem[]>} files and folders first, then terminals
   */
  async function search(query) {
    const files = await workspacePaths();
    const candidates = [...files, ...foldersOf(files)];
    const items = rankCandidates(query, candidates, RESULT_LIMIT).map(candidate => ({
      label: candidate, insert: `@${candidate}`, kind: candidate.endsWith('/') ? 'folder' : 'file',
    }));
    const terminalQuery = query.replace(/^terminal:?/i, '').toLowerCase();
    for (const terminal of vscode.window.terminals) {
      if (!terminal.name.toLowerCase().includes(terminalQuery) && !'terminal'.startsWith(query.toLowerCase())) continue;
      const name = terminal.name.replace(/\s+/g, '_');
      const captured = terminalLines.has(terminal);
      items.push({
        label: `terminal:${name}`, insert: `@terminal:${name}`, kind: 'terminal',
        detail: captured ? 'פלט הטרמינל' : 'אין עדיין פלט שנקלט (נדרש shell integration)',
      });
    }
    return items;
  }

  /**
   * Appends output; a chunk may end mid-line, so its first piece continues the last stored line.
   * @param {vscode.Terminal} terminal @param {string} chunk @param {boolean} newExecution starts on a fresh line
   */
  function record(terminal, chunk, newExecution) {
    const lines = terminalLines.get(terminal) || [];
    const pieces = chunk.replace(ANSI_PATTERN, '').replace(/\r/g, '').split('\n');
    if (lines.length && !newExecution) lines[lines.length - 1] += pieces.shift();
    for (const piece of pieces) lines.push(piece);
    if (lines.length > TERMINAL_LINES) lines.splice(0, lines.length - TERMINAL_LINES);
    terminalLines.set(terminal, lines);
  }

  /** @returns {string} the output of every `@terminal:<name>` in the message, for Claude */
  function sendContext(conversation, message) {
    const parts = [];
    for (const match of String(message.text || '').matchAll(TERMINAL_MENTION)) {
      const name = match[1];
      const terminal = vscode.window.terminals.find(item => item.name.replace(/\s+/g, '_') === name);
      const lines = terminal && terminalLines.get(terminal);
      parts.push(lines && lines.length
        ? `פלט הטרמינל ${name} (${TERMINAL_LINES} השורות האחרונות):\n\`\`\`\n${lines.join('\n').trim()}\n\`\`\``
        : `הטרמינל ${name}: אין פלט שנקלט.`);
    }
    return parts.join('\n');
  }

  const disposables = [
    vscode.workspace.onDidCreateFiles(() => { fileCache = null; }),
    vscode.workspace.onDidDeleteFiles(() => { fileCache = null; }),
    vscode.workspace.onDidRenameFiles(() => { fileCache = null; }),
    vscode.window.onDidCloseTerminal(terminal => terminalLines.delete(terminal)),
  ];
  // Shell integration output (VS Code 1.93+); older versions only miss the @terminal content.
  if (typeof vscode.window.onDidStartTerminalShellExecution === 'function') {
    disposables.push(vscode.window.onDidStartTerminalShellExecution(async event => {
      try {
        let first = true;
        for await (const chunk of event.execution.read()) {
          record(event.terminal, chunk, first);
          first = false;
        }
      } catch {
        // the terminal closed while reading
      }
    }));
  }

  return { search, sendContext, disposables };
}

module.exports = { createMentions };
