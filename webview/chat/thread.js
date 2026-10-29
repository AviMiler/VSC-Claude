/**
 * The conversation thread: user messages, streamed replies (Markdown), thinking, tool rows, result lines, notices,
 * the working line, and focus view (tool rows hidden).
 */
import { renderMarkdown, enableCodeCopy, escapeHtml } from './markdown.js';

const DEFAULT_VERBS = ['חושב', 'בודק', 'כותב', 'מנתח', 'מתכנן', 'קורא'];
const FILE_TOOLS = new Set(['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

/** @param {string} tag @param {string} [className] @param {string} [text] @returns {HTMLElement} */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const timeOf = at => new Date(at || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

/**
 * A one-line summary of a tool call and, for file tools, the file it touches.
 * @param {string} name @param {object} input
 * @returns {{text:string, path:string|null}}
 */
function summarizeTool(name, input) {
  if (FILE_TOOLS.has(name) && (input.file_path || input.notebook_path)) {
    return { text: input.file_path || input.notebook_path, path: input.file_path || input.notebook_path };
  }
  if (name === 'Bash') return { text: input.command || '', path: null };
  if (name === 'Grep' || name === 'Glob') return { text: `${input.pattern || ''}${input.path ? ` · ${input.path}` : ''}`, path: null };
  if (name === 'WebFetch' || name === 'WebSearch') return { text: input.url || input.query || '', path: null };
  if (name === 'Task' || name === 'Agent') return { text: input.description || '', path: null };
  if (name === 'TodoWrite') return { text: `${(input.todos || []).length} משימות`, path: null };
  const first = Object.values(input || {}).find(value => typeof value === 'string');
  return { text: first || '', path: null };
}

/**
 * @param {HTMLElement} root the thread container
 * @param {{openFile:(path:string, line?:number)=>void}} actions
 */
export function createThread(root, actions) {
  enableCodeCopy(root);
  let settings = {};
  let streaming = null; // {node, body, text, kind}
  let renderScheduled = false;
  const tools = new Map(); // tool_use id -> row element
  const working = el('div', 'working');
  working.hidden = true;
  let verbTimer = null;

  root.addEventListener('click', event => {
    const link = event.target.closest('[data-open-path]');
    if (!link) return;
    event.preventDefault();
    actions.openFile(link.dataset.openPath, Number(link.dataset.line) || undefined);
  });

  const nearBottom = () => root.scrollHeight - root.scrollTop - root.clientHeight < 80;
  const append = (node, { forceScroll = false } = {}) => {
    const stick = forceScroll || nearBottom();
    root.insertBefore(node, working.parentNode === root ? working : null);
    if (stick) root.scrollTop = root.scrollHeight;
    return node;
  };
  root.append(working);

  const stamp = (node, at) => {
    if (settings.showMessageTimestamps) node.append(el('div', 'timestamp', timeOf(at)));
  };

  function flushStream() {
    renderScheduled = false;
    if (!streaming) return;
    const stick = nearBottom();
    if (streaming.kind === 'text') streaming.body.innerHTML = renderMarkdown(streaming.text);
    else streaming.body.textContent = streaming.text;
    if (stick) root.scrollTop = root.scrollHeight;
  }

  function startStream(kind) {
    if (streaming && streaming.kind === kind) return streaming;
    endStream();
    const node = kind === 'text' ? el('div', 'message assistant') : el('details', 'thinking');
    if (kind === 'thinking') node.append(el('summary', '', 'חשיבה'));
    const body = el('div', kind === 'text' ? 'markdown' : 'thinking-body');
    node.append(body);
    append(node);
    streaming = { node, body, text: '', kind };
    return streaming;
  }

  function endStream() {
    streaming = null;
  }

  function addDelta(kind, text) {
    const target = startStream(kind);
    target.text += text;
    if (!renderScheduled) {
      renderScheduled = true;
      requestAnimationFrame(flushStream);
    }
  }

  /** A complete text/thinking block: replaces the streamed copy of it, or adds a new one. */
  function addBlock(kind, text, parent, at) {
    const target = streaming && streaming.kind === kind ? streaming : startStream(kind);
    target.text = text;
    flushStream();
    if (parent) target.node.classList.add('nested');
    if (kind === 'text') stamp(target.node, at);
    endStream();
  }

  function addTool(event) {
    endStream();
    const { text, path } = summarizeTool(event.name, event.input);
    const row = el('details', `tool${event.parent ? ' nested' : ''}`);
    const summary = el('summary');
    summary.append(el('span', 'tool-name', event.name));
    if (path) {
      const link = el('a', 'tool-path', text);
      link.href = '#';
      link.dir = 'ltr';
      link.dataset.openPath = path;
      summary.append(link);
    } else {
      summary.append(el('span', 'tool-summary', text));
    }
    const status = el('span', 'tool-status', '…');
    summary.append(status);
    row.append(summary);
    const input = el('pre', 'tool-input', JSON.stringify(event.input, null, 2));
    input.dir = 'ltr';
    row.append(input);
    tools.set(event.id, { row, status });
    append(row);
  }

  function addToolResult(event) {
    const tool = tools.get(event.toolUseId);
    if (!tool) return;
    tool.status.textContent = event.isError ? '✕' : '✓';
    tool.row.classList.toggle('error', event.isError);
    const output = el('pre', 'tool-output', event.text);
    output.dir = 'ltr';
    tool.row.append(output);
  }

  function addResult(event) {
    endStream();
    const parts = [];
    if (event.durationMs) parts.push(`${(event.durationMs / 1000).toFixed(1)} שנ׳`);
    if (event.tokens) parts.push(`${event.tokens.toLocaleString('he-IL')} טוקנים`);
    if (event.isError && event.subtype === 'error_during_execution') parts.unshift('הופסק');
    else if (event.isError) parts.unshift('שגיאה');
    const line = el('div', `result${event.isError ? ' error' : ''}`, parts.join(' · '));
    if (event.isError && event.text) line.append(el('div', 'result-text', event.text));
    append(line);
  }

  function addNotice(event) {
    endStream();
    append(el('div', `notice${event.level === 'error' ? ' error' : ''}`, event.text));
  }

  function addUser(event) {
    endStream();
    const node = el('div', 'message user');
    node.tabIndex = -1;
    const body = el('div', 'user-text', event.text);
    body.dir = 'auto';
    node.append(body);
    if (event.images) node.append(el('div', 'user-images', `📎 ${event.images} תמונות`));
    stamp(node, event.at);
    append(node, { forceScroll: settings.scrollToBottomOnSend !== false });
  }

  const verbs = () => {
    const spinner = settings.spinnerVerbs || {};
    const custom = Array.isArray(spinner.verbs) ? spinner.verbs.filter(Boolean) : [];
    if (spinner.mode === 'replace' && custom.length) return custom;
    return [...DEFAULT_VERBS, ...custom];
  };

  return {
    /** @param {object} value webview settings */
    setSettings(value) {
      settings = value || {};
    },
    /** @param {{kind:string}} event a UI event from the host */
    addEvent(event) {
      switch (event.kind) {
        case 'user': return addUser(event);
        case 'text-delta': return addDelta('text', event.text);
        case 'thinking-delta': return addDelta('thinking', event.text);
        case 'text': return addBlock('text', event.text, event.parent);
        case 'thinking': return addBlock('thinking', event.text, event.parent);
        case 'tool': return addTool(event);
        case 'tool-result': return addToolResult(event);
        case 'result': return addResult(event);
        case 'notice': return addNotice(event);
        default: return undefined;
      }
    },
    /** @param {HTMLElement} node a card; kept above the working line */
    appendCard(node) {
      endStream();
      return append(node, { forceScroll: true });
    },
    /** @param {boolean} running */
    setRunning(running) {
      working.hidden = !running;
      clearInterval(verbTimer);
      if (!running) return;
      const list = verbs();
      let index = Math.floor(Math.random() * list.length);
      const show = () => { working.textContent = `✻ ${list[index % list.length]}…`; index += 1; };
      show();
      verbTimer = setInterval(show, 2500);
      if (nearBottom()) root.scrollTop = root.scrollHeight;
    },
    /** @param {boolean} [force] */
    toggleFocusView(force) {
      root.classList.toggle('focus-view', force);
    },
    /** Focuses the waiting permission card, else the newest message. */
    focusLastMessage() {
      const target = root.querySelector('.card:not(.answered)') || [...root.querySelectorAll('.message')].pop();
      if (!target) return;
      target.tabIndex = -1;
      target.scrollIntoView({ block: 'nearest' });
      target.focus();
    },
    isEmpty() {
      return !root.querySelector('.message, .tool, .card');
    },
    escapeHtml,
  };
}
