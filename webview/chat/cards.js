/**
 * Permission cards in the thread: a generic tool card (allow / always allow in this project / deny with a reason),
 * AskUserQuestion (options), ExitPlanMode (the plan), and the compact "waiting for review" card of the native diff.
 */
import { el } from './thread.js';
import { renderMarkdown } from './markdown.js';

const PLAN_DENY_MESSAGE = 'המשתמש רוצה להמשיך לתכנן.';

/** @param {string} tool @param {object} input @returns {string} what the card shows as the request */
function describeInput(tool, input) {
  if (tool === 'Bash') return input.command || '';
  if (input.file_path) return input.file_path;
  return JSON.stringify(input, null, 2);
}

/**
 * @param {{appendCard:(node:HTMLElement)=>HTMLElement}} thread
 * @param {{answer:(payload:object)=>void, post:(message:object)=>void}} actions
 */
export function createCards(thread, actions) {
  const cards = new Map(); // requestId -> card element

  const button = (text, className, onClick) => {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };

  function finish(requestId, payload) {
    actions.answer({ requestId, ...payload });
    resolve(requestId);
  }

  /** Deny button that opens an optional reason box first. */
  function denyControls(requestId, label = 'דחייה', defaultMessage) {
    const wrap = el('div', 'deny');
    const reason = el('textarea', 'reason');
    reason.placeholder = 'סיבה (לא חובה) – Claude יקבל אותה';
    reason.rows = 2;
    reason.hidden = true;
    const confirm = button('שליחת הדחייה', 'secondary', () => finish(requestId, {
      behavior: 'deny', message: reason.value.trim() || defaultMessage,
    }));
    confirm.hidden = true;
    const open = button(label, 'secondary', () => {
      if (reason.hidden) {
        reason.hidden = false;
        confirm.hidden = false;
        open.hidden = true;
        reason.focus();
      }
    });
    wrap.append(open, reason, confirm);
    return wrap;
  }

  function genericCard(message) {
    const card = el('div', 'card');
    card.append(el('div', 'card-title', message.title || `Claude מבקש להשתמש ב-${message.tool}`));
    if (message.description) card.append(el('div', 'card-description', message.description));
    const request = el('pre', 'card-input', describeInput(message.tool, message.input));
    request.dir = 'ltr';
    card.append(request);
    const row = el('div', 'card-actions');
    row.append(button('אישור', 'primary', () => finish(message.requestId, { behavior: 'allow' })));
    if (message.canAlwaysAllow) {
      row.append(button('אישור תמיד בפרויקט הזה', 'secondary', () => finish(message.requestId, { behavior: 'allow', scope: 'project' })));
    }
    row.append(denyControls(message.requestId));
    card.append(row);
    return card;
  }

  function questionCard(message) {
    const card = el('div', 'card question');
    const questions = Array.isArray(message.input.questions) ? message.input.questions : [];
    const readers = questions.map((question, index) => {
      const block = el('fieldset', 'question-block');
      block.append(el('legend', '', question.header ? `${question.header}: ${question.question}` : question.question));
      const name = `q-${message.requestId}-${index}`;
      const inputs = (question.options || []).map(option => {
        const label = el('label', 'option');
        const input = el('input');
        input.type = question.multiSelect ? 'checkbox' : 'radio';
        input.name = name;
        input.value = option.label;
        label.append(input, el('span', 'option-label', option.label));
        if (option.description) label.append(el('span', 'option-description', option.description));
        block.append(label);
        return input;
      });
      const other = el('input', 'other');
      other.placeholder = 'תשובה אחרת…';
      block.append(other);
      card.append(block);
      return () => {
        const picked = inputs.filter(input => input.checked).map(input => input.value);
        if (other.value.trim()) picked.push(other.value.trim());
        return [question.question, picked.join(', ')];
      };
    });
    const row = el('div', 'card-actions');
    row.append(button('שליחת התשובות', 'primary', () => finish(message.requestId, {
      behavior: 'allow', updatedInput: { ...message.input, answers: Object.fromEntries(readers.map(read => read())) },
    })));
    row.append(denyControls(message.requestId, 'דילוג'));
    card.append(row);
    return card;
  }

  function planCard(message) {
    const card = el('div', 'card plan');
    card.append(el('div', 'card-title', 'Claude מציע תוכנית'));
    const body = el('div', 'markdown');
    body.innerHTML = renderMarkdown(message.input.plan || '');
    card.append(body);
    const row = el('div', 'card-actions');
    row.append(button('אישור התוכנית', 'primary', () => finish(message.requestId, { behavior: 'allow' })));
    row.append(denyControls(message.requestId, 'המשך תכנון', PLAN_DENY_MESSAGE));
    card.append(row);
    return card;
  }

  function diffCard(message) {
    const card = el('div', 'card diff');
    const file = String(message.input.file_path || '').split(/[\\/]/).pop();
    card.append(el('div', 'card-title', `ממתין לסקירה ב-${file}`));
    const row = el('div', 'card-actions');
    row.append(button('פתח שוב', 'secondary', () => actions.post({ type: 'reopenDiff', requestId: message.requestId })));
    card.append(row);
    return card;
  }

  /** @param {string} requestId */
  function resolve(requestId) {
    const card = cards.get(requestId);
    if (!card) return;
    cards.delete(requestId);
    card.remove();
  }

  return {
    /** @param {{requestId:string, tool:string, input:object, kind:'card'|'diff', canAlwaysAllow:boolean}} message */
    show(message) {
      resolve(message.requestId);
      let card;
      if (message.kind === 'diff') card = diffCard(message);
      else if (message.tool === 'AskUserQuestion') card = questionCard(message);
      else if (message.tool === 'ExitPlanMode') card = planCard(message);
      else card = genericCard(message);
      card.tabIndex = -1;
      cards.set(message.requestId, card);
      // Not focused automatically: an Enter meant for the composer must never approve a tool.
      thread.appendCard(card);
    },
    resolve,
  };
}
