// Chat app: the webview entry — host messages, saved state, spinner and focus handling.
import { createThread } from './thread.js';
import { createComposer } from './composer.js';
import { createCards } from './cards.js';

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();

const app = /** @type {HTMLElement} */ (document.getElementById('app'));
app.innerHTML = `
  <header class="header">
    <span class="title">Claude</span>
    <span class="spacer"></span>
    <button type="button" class="icon-btn new-conv" title="שיחה חדשה">＋</button>
  </header>
  <main class="thread" tabindex="-1">
    <div class="empty">
      <img class="empty-logo" alt="" src="${app.dataset.logo}">
      <div>שלום! על מה נעבוד?</div>
    </div>
    <div class="thread-tail"><div class="spinner" hidden></div></div>
  </main>
  <footer class="composer"></footer>`;

const state = {
  settings: { useCtrlEnterToSend: false, scrollToBottomOnSend: true, showMessageTimestamps: true, spinnerVerbs: ['חושב'], focusView: false },
  saved: vscode.getState() || {},
  running: false,
  modes: ['default', 'acceptEdits', 'plan'],
  models: [],
  mode: 'default',
  model: '',
};

const post = (msg) => vscode.postMessage(msg);
const threadEl = /** @type {HTMLElement} */ (app.querySelector('.thread'));
const thread = createThread(threadEl, { post, settings: () => state.settings });
const cards = createCards({ post, append: (el) => thread.append(el) });
const composer = createComposer(/** @type {HTMLElement} */ (app.querySelector('.composer')), {
  post,
  settings: () => state.settings,
  onSend: () => {
    if (state.settings.scrollToBottomOnSend) thread.scrollToBottom();
  },
});
const spinner = /** @type {HTMLElement} */ (app.querySelector('.spinner'));
const titleEl = /** @type {HTMLElement} */ (app.querySelector('.title'));

app.querySelector('.new-conv').addEventListener('click', () => post({ type: 'newConversation' }));
window.addEventListener('focus', () => post({ type: 'focusChanged', focused: true }));
window.addEventListener('blur', () => post({ type: 'focusChanged', focused: false }));

/** @param {object} patch */
function save(patch) {
  state.saved = { ...state.saved, ...patch };
  vscode.setState(state.saved);
}

let spinnerTimer = 0;
let status = '';
/** @param {boolean} running */
function setRunning(running) {
  state.running = running;
  composer.setRunning(running);
  save({ running });
  spinner.hidden = !running;
  clearInterval(spinnerTimer);
  if (!running) return;
  let i = Math.floor(Math.random() * state.settings.spinnerVerbs.length);
  const render = () => {
    const verbs = state.settings.spinnerVerbs;
    spinner.textContent = `✻ ${verbs[i % verbs.length]}…${status === 'compacting' ? ' (דוחס את ההקשר)' : ''}`;
    i++;
  };
  render();
  spinnerTimer = setInterval(render, 3000);
}

/** @param {any} session */
function applySession(session) {
  if (!session) return;
  if (session.title !== undefined) titleEl.textContent = session.title || 'Claude';
  if (session.mode) {
    state.mode = session.mode;
    composer.setMode(session.mode);
  }
  if (session.model !== undefined) state.model = session.model;
  save({ sessionId: session.sessionId || '', mode: state.mode, model: state.model, title: session.title || state.saved.title || '' });
}

function markEmpty() {
  const empty = threadEl.querySelector('.empty');
  if (empty) empty.hidden = threadEl.querySelectorAll('.msg, .tool, .notice, .card').length > 0;
}

/** @param {any} settings */
function applySettings(settings) {
  if (!settings) return;
  state.settings = settings;
  document.body.classList.toggle('focus-view', !!settings.focusView && !state.focusViewToggled);
}

window.addEventListener('message', (event) => {
  const msg = event.data || {};
  switch (msg.type) {
    case 'init':
      applySettings(msg.settings);
      thread.clear();
      cards.clear();
      state.modes = msg.modes || state.modes;
      state.models = msg.models || [];
      state.mode = (msg.session && msg.session.mode) || 'default';
      state.model = (msg.session && msg.session.model) || '';
      composer.setModes(state.modes, state.mode);
      composer.setModels(state.models, state.model);
      composer.setThinking(msg.session ? msg.session.thinking !== false : true);
      composer.setCommands(msg.commands);
      composer.setNoFolder(!!(msg.session && msg.session.noFolder));
      applySession(msg.session);
      for (const op of msg.items || []) thread.apply(op);
      for (const p of msg.permissions || []) cards.show(p);
      if (msg.session && msg.session.restored && !(msg.items || []).length) {
        thread.apply({ op: 'notice', level: 'info', text: 'השיחה נפתחה מחדש. Claude זוכר את מה שנאמר בה.' });
      }
      status = msg.status || '';
      setRunning(!!msg.running);
      thread.scrollToBottom();
      break;
    case 'update':
      if (msg.settings) applySettings(msg.settings);
      if (msg.modes) {
        state.modes = msg.modes;
        composer.setModes(state.modes, state.mode);
      }
      if (msg.models) {
        state.models = msg.models;
        composer.setModels(state.models, state.model);
      }
      if (msg.commands) composer.setCommands(msg.commands);
      break;
    case 'session':
      applySession(msg);
      break;
    case 'event':
      for (const op of msg.ops || []) thread.apply(op);
      break;
    case 'state':
      status = msg.status || '';
      setRunning(!!msg.running);
      break;
    case 'permission':
      cards.show(msg);
      break;
    case 'permissionResolved':
      cards.resolve(msg.requestId);
      break;
    case 'focus':
      composer.focus();
      break;
    case 'focusLastMessage':
      thread.focusLast();
      break;
    case 'toggleFocusView':
      state.focusViewToggled = true;
      document.body.classList.toggle('focus-view');
      break;
    default:
      break;
  }
  markEmpty();
});

post({ type: 'ready' });
