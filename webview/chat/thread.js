// Thread: renders the conversation ops (user messages, Claude's text, thinking, tool rows, results, notices).
import { renderMarkdown, escapeHtml } from './markdown.js';

const SUMMARY_KEYS = ['file_path', 'path', 'notebook_path', 'command', 'pattern', 'url', 'query', 'description', 'prompt', 'skill'];
const PATH_KEYS = ['file_path', 'path', 'notebook_path'];

/**
 * @param {HTMLElement} root — the scrolling thread element
 * @param {{post: (msg: object) => void, settings: () => any}} host
 */
export function createThread(root, host) {
  /** @type {Map<string, {el: HTMLElement, body?: HTMLElement, text: string, raf?: number}>} */
  const blocks = new Map();
  /** @type {Map<string, {el: HTMLElement, summary: HTMLElement, input: HTMLElement, output: HTMLElement, name: string}>} */
  const tools = new Map();

  root.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const copy = target.closest('.copy-btn');
    if (copy) {
      const code = copy.closest('.code-block')?.querySelector('code');
      if (code) navigator.clipboard.writeText(code.textContent || '').then(() => flash(/** @type {HTMLElement} */ (copy)));
      return;
    }
    const link = target.closest('[data-open-path]');
    if (link) {
      e.preventDefault();
      host.post({ type: 'openFile', path: link.getAttribute('data-open-path'), line: Number(link.getAttribute('data-open-line')) || undefined });
    }
  });

  const nearBottom = () => root.scrollHeight - root.scrollTop - root.clientHeight < 80;
  const scrollToBottom = () => {
    root.scrollTop = root.scrollHeight;
  };

  /**
   * @param {HTMLElement} el
   */
  function append(el) {
    const stick = nearBottom();
    const anchor = root.querySelector(':scope > .thread-tail');
    root.insertBefore(el, anchor);
    if (stick) scrollToBottom();
  }

  /** @param {number} at */
  function stamp(at) {
    const el = document.createElement('div');
    el.className = 'timestamp';
    el.textContent = new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return el;
  }

  /** @param {any} op */
  function user(op) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.tabIndex = -1;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    for (const src of op.images || []) {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'thumb';
      bubble.appendChild(img);
    }
    if (op.text) {
      const t = document.createElement('div');
      t.className = 'user-text';
      t.dir = 'auto';
      t.textContent = op.text;
      bubble.appendChild(t);
    }
    el.appendChild(bubble);
    if (host.settings().showMessageTimestamps) el.appendChild(stamp(op.at || Date.now()));
    append(el);
  }

  /**
   * @param {any} op
   * @param {'text'|'thinking'} kind
   */
  function textual(op, kind) {
    let block = blocks.get(op.id);
    if (!block) {
      const el = document.createElement(kind === 'thinking' ? 'details' : 'div');
      el.className = kind === 'thinking' ? 'msg thinking' : 'msg assistant';
      el.tabIndex = -1;
      let body;
      if (kind === 'thinking') {
        const summary = document.createElement('summary');
        summary.textContent = 'חשיבה';
        body = document.createElement('div');
        body.className = 'thinking-body';
        el.append(summary, body);
      } else {
        body = document.createElement('div');
        body.className = 'md';
        el.appendChild(body);
        if (host.settings().showMessageTimestamps) el.appendChild(stamp(Date.now()));
      }
      block = { el, body, text: '' };
      blocks.set(op.id, block);
      append(el);
    }
    block.text = op.set !== undefined ? op.set : block.text + (op.append || '');
    if (block.raf) return;
    const b = block;
    b.raf = requestAnimationFrame(() => {
      b.raf = undefined;
      const stick = nearBottom();
      if (kind === 'thinking') b.body.textContent = b.text;
      else b.body.innerHTML = renderMarkdown(b.text);
      if (stick) scrollToBottom();
    });
  }

  /** @param {any} op */
  function tool(op) {
    let row = tools.get(op.id);
    if (!row) {
      const el = document.createElement('details');
      el.className = 'tool running';
      el.tabIndex = -1;
      const summary = document.createElement('summary');
      const input = document.createElement('pre');
      input.className = 'tool-input';
      input.dir = 'ltr';
      const output = document.createElement('pre');
      output.className = 'tool-output';
      output.dir = 'ltr';
      el.append(summary, input, output);
      row = { el, summary, input, output, name: op.name || '' };
      tools.set(op.id, row);
      append(el);
    }
    if (op.name) row.name = op.name;
    renderToolSummary(row, op.input);
    if (op.input) row.input.textContent = JSON.stringify(op.input, null, 2);
  }

  /**
   * @param {{summary: HTMLElement, name: string}} row
   * @param {any} input
   */
  function renderToolSummary(row, input) {
    const key = input ? SUMMARY_KEYS.find((k) => typeof input[k] === 'string' && input[k]) : undefined;
    let detail = '';
    if (key) {
      const value = String(input[key]).split('\n')[0].slice(0, 140);
      if (PATH_KEYS.includes(key)) {
        detail = `<a href="#" class="tool-path" dir="ltr" data-open-path="${escapeHtml(input[key])}">${escapeHtml(value)}</a>`;
      } else {
        detail = `<span class="tool-detail" dir="ltr">${escapeHtml(value)}</span>`;
      }
    }
    row.summary.innerHTML = `<span class="tool-name" dir="ltr">${escapeHtml(row.name)}</span> ${detail}`;
  }

  /** @param {any} op */
  function toolResult(op) {
    const row = tools.get(op.id);
    if (!row) return;
    row.el.classList.remove('running');
    if (op.isError) row.el.classList.add('error');
    row.output.textContent = op.content || '(ללא פלט)';
  }

  /** @param {any} op */
  function result(op) {
    for (const row of tools.values()) row.el.classList.remove('running');
    const el = document.createElement('div');
    el.className = op.isError ? 'result error' : 'result';
    const seconds = (op.durationMs / 1000).toFixed(1);
    const parts = [`${seconds} שנ׳`, `${op.inputTokens.toLocaleString('he-IL')} טוקנים נכנסים`, `${op.outputTokens.toLocaleString('he-IL')} יוצאים`];
    el.textContent = op.isError ? `שגיאה: ${op.error || ''}` : parts.join(' · ');
    append(el);
  }

  /** @param {any} op */
  function notice(op) {
    const el = document.createElement('div');
    el.className = `notice ${op.level === 'error' ? 'error' : ''}`;
    el.textContent = op.text;
    append(el);
  }

  return {
    /** @param {any} op */
    apply(op) {
      switch (op.op) {
        case 'user': return user(op);
        case 'text': return textual(op, 'text');
        case 'thinking': return textual(op, 'thinking');
        case 'tool': return tool(op);
        case 'toolResult': return toolResult(op);
        case 'result': return result(op);
        case 'notice': return notice(op);
        default: return undefined;
      }
    },
    clear() {
      blocks.clear();
      tools.clear();
      for (const el of Array.from(root.children)) if (!el.classList.contains('thread-tail') && !el.classList.contains('empty')) el.remove();
    },
    /** @param {HTMLElement} el */
    append,
    scrollToBottom,
    focusLast() {
      const card = root.querySelector('.card:not(.answered)');
      const items = root.querySelectorAll('.msg, .tool, .card');
      const target = /** @type {HTMLElement|null} */ (card || items[items.length - 1] || null);
      if (target) {
        target.scrollIntoView({ block: 'nearest' });
        target.focus();
      }
    },
  };
}

/** @param {HTMLElement} btn */
function flash(btn) {
  const old = btn.textContent;
  btn.textContent = 'הועתק';
  setTimeout(() => {
    btn.textContent = old;
  }, 1200);
}
