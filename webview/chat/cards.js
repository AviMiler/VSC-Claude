// Cards: permission cards for `can_use_tool` (generic tools, AskUserQuestion, ExitPlanMode).
import { renderMarkdown } from './markdown.js';

/**
 * @typedef {{requestId: string, tool: string, displayName: string, description: string, input: any, canAlways: boolean}} PermissionMsg
 */

/**
 * @param {{post: (msg: object) => void, append: (el: HTMLElement) => void}} host
 */
export function createCards(host) {
  /** @type {Map<string, HTMLElement>} */
  const cards = new Map();

  /**
   * @param {string} requestId
   * @param {object} answer
   */
  function answer(requestId, answer) {
    const card = cards.get(requestId);
    if (card) card.classList.add('answered');
    host.post({ type: 'permissionAnswer', requestId, ...answer });
  }

  /**
   * @param {string} tag
   * @param {string} className
   * @param {string} [text]
   */
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /**
   * @param {string} label
   * @param {string} className
   * @param {() => void} onClick
   */
  function button(label, className, onClick) {
    const b = /** @type {HTMLButtonElement} */ (el('button', className, label));
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /** @param {PermissionMsg} p */
  function inputPreview(p) {
    const input = p.input || {};
    if (p.tool === 'Bash' && typeof input.command === 'string') return input.command;
    if (typeof input.file_path === 'string') {
      const body = typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : '';
      return body ? `${input.file_path}\n\n${body.slice(0, 2000)}` : input.file_path;
    }
    return JSON.stringify(input, null, 2);
  }

  /** @param {PermissionMsg} p */
  function genericCard(p) {
    const card = el('div', 'card');
    card.tabIndex = -1;
    const title = el('div', 'card-title', 'Claude מבקש להשתמש בכלי ');
    const name = el('bdi', 'tool-name', p.displayName);
    name.dir = 'ltr';
    title.append(name);
    card.append(title);
    if (p.description) card.append(el('div', 'card-desc', p.description));
    const pre = el('pre', 'card-input', inputPreview(p));
    pre.dir = 'ltr';
    card.append(pre);
    const reason = /** @type {HTMLInputElement} */ (el('input', 'card-reason'));
    reason.placeholder = 'סיבה לדחייה (לא חובה)';
    const actions = el('div', 'card-actions');
    actions.append(button('אישור', 'primary', () => answer(p.requestId, { behavior: 'allow' })));
    if (p.canAlways) actions.append(button('אישור תמיד בפרויקט הזה', 'secondary', () => answer(p.requestId, { behavior: 'allow', scope: 'always' })));
    actions.append(button('דחייה', 'secondary', () => answer(p.requestId, { behavior: 'deny', message: reason.value })));
    card.append(actions, reason);
    return card;
  }

  /** @param {PermissionMsg} p */
  function questionCard(p) {
    const card = el('div', 'card');
    card.tabIndex = -1;
    const questions = Array.isArray(p.input && p.input.questions) ? p.input.questions : [];
    /** @type {Map<string, Set<string>>} */
    const picked = new Map();
    for (const q of questions) {
      const block = el('div', 'question');
      if (q.header) block.append(el('div', 'question-header', q.header));
      block.append(el('div', 'card-title', q.question));
      const chosen = new Set();
      picked.set(q.question, chosen);
      const options = el('div', 'options');
      for (const opt of q.options || []) {
        const b = button(opt.label, 'option', () => {
          if (!q.multiSelect) {
            chosen.clear();
            options.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
          }
          if (chosen.has(opt.label)) {
            chosen.delete(opt.label);
            b.classList.remove('selected');
          } else {
            chosen.add(opt.label);
            b.classList.add('selected');
          }
        });
        if (opt.description) b.title = opt.description;
        options.append(b);
      }
      block.append(options);
      card.append(block);
    }
    const actions = el('div', 'card-actions');
    actions.append(
      button('שליחה', 'primary', () => {
        const answers = {};
        for (const [question, set] of picked) if (set.size) answers[question] = Array.from(set).join(', ');
        answer(p.requestId, { behavior: 'allow', answers });
      }),
      button('דחייה', 'secondary', () => answer(p.requestId, { behavior: 'deny' })),
    );
    card.append(actions);
    return card;
  }

  /** @param {PermissionMsg} p */
  function planCard(p) {
    const card = el('div', 'card plan');
    card.tabIndex = -1;
    card.append(el('div', 'card-title', 'התוכנית של Claude'));
    const plan = el('div', 'md');
    plan.innerHTML = renderMarkdown(String((p.input && p.input.plan) || ''));
    card.append(plan);
    const reason = /** @type {HTMLInputElement} */ (el('input', 'card-reason'));
    reason.placeholder = 'מה לשנות בתוכנית (לא חובה)';
    const actions = el('div', 'card-actions');
    actions.append(
      button('אישור התוכנית', 'primary', () => answer(p.requestId, { behavior: 'allow' })),
      button('המשך תכנון', 'secondary', () => answer(p.requestId, { behavior: 'deny', message: reason.value })),
    );
    card.append(actions, reason);
    return card;
  }

  return {
    /** @param {PermissionMsg} p */
    show(p) {
      if (cards.has(p.requestId)) return;
      const card = p.tool === 'AskUserQuestion' ? questionCard(p) : p.tool === 'ExitPlanMode' ? planCard(p) : genericCard(p);
      cards.set(p.requestId, card);
      host.append(card);
    },
    /** @param {string} requestId */
    resolve(requestId) {
      const card = cards.get(requestId);
      if (card) card.remove();
      cards.delete(requestId);
    },
    clear() {
      for (const card of cards.values()) card.remove();
      cards.clear();
    },
  };
}
