/**
 * Chat webview entry: talks to the host (`postMessage`), keeps the saved state for reload, and wires the thread,
 * cards, composer and onboarding.
 */
import { createThread } from './thread.js';
import { createCards } from './cards.js';
import { createComposer } from './composer.js';
import { createOnboarding } from './onboarding.js';
import { createMentionMenu } from './mention-menu.js';

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
const post = message => vscode.postMessage(message);

const thread = createThread(document.getElementById('thread'), {
  openFile: (path, line) => post({ type: 'openFile', path, line }),
});
const cards = createCards(thread, {
  answer: payload => post({ type: 'permissionAnswer', ...payload }),
  post,
});
const composer = createComposer(document.getElementById('composer'), {
  send: payload => post({ type: 'send', ...payload, mentions: [] }),
  interrupt: () => post({ type: 'interrupt' }),
  setMode: value => post({ type: 'setMode', value }),
  setModel: value => post({ type: 'setModel', value }),
  setThinking: value => post({ type: 'setThinking', value }),
  clearContext: () => post({ type: 'clearContext' }),
});
const onboarding = createOnboarding(document.getElementById('onboarding'), {
  dismiss: () => post({ type: 'dismissOnboarding' }),
});

let settings = {};

const mentionMenu = createMentionMenu(composer, post);

/** The chip text: "N שורות נבחרו", or the open file's name. */
function contextChipText(message) {
  if (message.selection) return message.selection.lines === 1 ? 'שורה אחת נבחרה' : `${message.selection.lines} שורות נבחרו`;
  return message.file ? message.file.split('/').pop() : null;
}

function applySettings(value) {
  settings = value || {};
  thread.setSettings(settings);
  composer.setSettings(settings);
  onboarding.update(settings, thread.isEmpty());
}

function applySession(session) {
  composer.setSession(session);
  thread.setRunning(Boolean(session.running));
  // Saved for the serializer: a reload reopens this conversation with --resume.
  vscode.setState({
    sessionId: session.sessionId, title: session.title, mode: session.mode, model: session.model,
    thinking: session.thinking, running: session.running,
  });
}

const handlers = {
  init(message) {
    applySettings(message.settings);
    composer.setModes(message.modes, message.session.mode);
    composer.setModels(message.models || []);
    composer.setCommands(message.commands || []);
    (message.items || []).forEach(event => thread.addEvent(event));
    (message.pending || []).forEach(permission => cards.show(permission));
    applySession(message.session);
    thread.toggleFocusView(Boolean(settings.focusView));
    onboarding.update(settings, thread.isEmpty());
    composer.focus();
  },
  settings: message => applySettings(message.settings),
  session: message => applySession(message.session),
  catalog(message) {
    composer.setModels(message.models || []);
    composer.setCommands(message.commands || []);
  },
  event(message) {
    thread.addEvent(message.event);
    onboarding.update(settings, thread.isEmpty());
  },
  permission: message => cards.show(message),
  permissionResolved: message => cards.resolve(message.requestId),
  insertText: message => composer.insertText(message.text),
  focus: () => composer.focus(),
  focusLastMessage: () => thread.focusLastMessage(),
  toggleFocusView: () => thread.toggleFocusView(),
  context: message => composer.setContextChip(contextChipText(message)),
  mentionResults: message => mentionMenu.showResults(message),
};

window.addEventListener('message', event => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  const handler = handlers[message.type];
  if (handler) handler(message);
});

window.addEventListener('focus', () => post({ type: 'focusState', focused: true }));
window.addEventListener('blur', () => post({ type: 'focusState', focused: false }));

post({ type: 'ready' });
