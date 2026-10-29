// Markdown: a small, escaping Markdown-to-HTML renderer for Claude's replies (code blocks get a copy button).

/**
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * @param {string} text — already escaped
 * @returns {string}
 */
function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1 <span class="md-url" dir="ltr">($2)</span>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code dir="ltr">${codes[Number(i)]}</code>`);
}

/**
 * @param {string} src
 * @returns {string} HTML
 */
export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  /** @type {string[]} */
  let para = [];
  const flush = () => {
    if (para.length) html.push(`<p>${inline(escapeHtml(para.join('\n'))).replace(/\n/g, '<br>')}</p>`);
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      const lang = fence[2] ? `<span class="code-lang">${escapeHtml(fence[2])}</span>` : '';
      html.push(`<div class="code-block" dir="ltr"><div class="code-head">${lang}<button class="copy-btn" type="button">העתקה</button></div><pre><code>${escapeHtml(body.join('\n'))}</code></pre></div>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      html.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`);
      continue;
    }
    const list = line.match(/^\s*([-*+]|\d+[.)])\s+/);
    if (list) {
      flush();
      const ordered = /\d/.test(list[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (m) items.push(m[2]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += '\n' + lines[i].trim();
        else break;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((t) => `<li>${inline(escapeHtml(t)).replace(/\n/g, '<br>')}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(escapeHtml(c.trim())));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      html.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return html.join('');
}
