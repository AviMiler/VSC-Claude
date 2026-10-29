/**
 * One conversation (an editor tab or a sidebar view): its CLI process, permission prompts, mode/model and the
 * messages it posts to its webview. Shared by chat-panel.js and sidebar-view.js.
 */
const os = require('os');
const crypto = require('crypto');
const vscode = require('vscode');
const settings = require('../util/settings');
const { withPrefix } = require('../util/logger');
const { pickCwd } = require('../util/paths');
const { ClaudeProcess } = require('../cli/process');
const { buildArgs } = require('../cli/args');
const { getCapabilities, cliPermissionMode } = require('../cli/capabilities');
const { describeFailure } = require('../cli/failures');
const { translateEvent, sessionIdOf } = require('./event-translator');

const TITLE_CHARS = 40;
const LOG_LIMIT = 2000;
const INITIALIZE_TIMEOUT_MS = 60000;
const THINKING_TOKENS = 31999;
const QUEUED_UNTIL_READY = new Set(['insertText', 'focus', 'focusLastMessage', 'toggleFocusView', 'context']);
const ONBOARDING_KEY = 'claudeLocal.onboardingDismissed';
const CONTINUE_TEXT = 'המשך מהנקודה שבה עצרת.';
const MODE_LABELS = { default: 'ידני', acceptEdits: 'עריכה אוטומטית', plan: 'תכנון', bypassPermissions: 'ללא הרשאות' };
const MODEL_ENV_KEYS = ['ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_MODEL'];

/**
 * @typedef {{sessionId?:string, title?:string, mode?:string, model?:string, thinking?:boolean, running?:boolean}} SavedState
 * @typedef {{requestId:string, toolName:string, input:object, suggestions:object[], toolUseId:string|null}} PendingPermission
 * @typedef {{logger:object, hooks:{beforePermission:Function[], controlHandlers:Map<string, Function>,
 *   sendContext:Function[], initializePayload:Function[]}}} Services
 *   hooks.beforePermission: async (conversation, prompt) => true when the hook took over the prompt (native diff).
 *   hooks.controlHandlers: subtype -> async (conversation, request) => response payload (in-process MCP).
 *   hooks.sendContext: async (conversation, sendMessage) => text prepended to the message for Claude, or ''.
 *   hooks.initializePayload: () => fields merged into the `initialize` request (SDK MCP servers).
 */

/** @returns {{label:string, value:string}[]} */
function availableModes() {
  const modes = ['default', 'acceptEdits', 'plan'];
  if (settings.get('allowDangerouslySkipPermissions')) modes.push('bypassPermissions');
  return modes.map(value => ({ value, label: MODE_LABELS[value] }));
}

/** Model names from the env the CLI will get, used when `initialize` lists none. */
function modelsFromEnv() {
  const fromSettings = Object.fromEntries(settings.processConfig().envVars.map(variable => [variable.name, variable.value]));
  const values = MODEL_ENV_KEYS.map(key => fromSettings[key] || process.env[key]).filter(Boolean);
  return [...new Set(values)].map(value => ({ value, label: value }));
}

/** @returns {Record<string, any>} webview settings plus the dismissed onboarding flag (globalState) */
function webviewSettingsFor(services) {
  return { ...settings.webviewSettings(), onboardingDismissed: Boolean(services.context.globalState.get(ONBOARDING_KEY)) };
}

function workspaceCwd() {
  const folders = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
  const active = vscode.window.activeTextEditor?.document.uri;
  const activeFolder = active && vscode.workspace.getWorkspaceFolder(active)?.uri.fsPath;
  return pickCwd(folders, activeFolder);
}

class Conversation {
  /**
   * @param {{services:Services, kind:'tab'|'sidebar', saved?:SavedState}} options
   */
  constructor({ services, kind, saved = {} }) {
    this.id = crypto.randomUUID();
    this.kind = kind;
    this.services = services;
    this.logger = withPrefix(services.logger, `${kind}:${this.id.slice(0, 8)}`);
    this.sessionId = saved.sessionId || null;
    this.title = saved.title || '';
    this.mode = saved.mode || settings.initialPermissionMode();
    this.model = saved.model || '';
    this.thinking = Boolean(saved.thinking);
    this.running = false;
    this.unread = false;
    this.visible = true;
    this.pending = new Map(); // requestId -> PendingPermission
    this.log = []; // UI events, replayed if the webview reloads
    this.catalog = { models: [], commands: [] };
    this.capabilities = null;
    this.proc = null;
    this.webview = null;
    this.ready = false; // the webview sent `ready`
    this.queued = [];
    this.disposed = false;
    this.changeEmitter = new vscode.EventEmitter();
    /** Fires on any change the registry shows (title, pending permission, running, unread). */
    this.onDidChange = this.changeEmitter.event;
    this.continueOnStart = Boolean(saved.running && settings.get('continueAfterReload'));
  }

  // ---- webview ----

  /** @param {vscode.Webview} webview */
  attach(webview) {
    this.webview = webview;
  }

  /**
   * Messages that `init` does not cover wait until the webview is ready (Alt+K right after opening a chat).
   * @param {object} message
   */
  post(message) {
    if (!this.webview || this.disposed) return;
    if (!this.ready) {
      if (QUEUED_UNTIL_READY.has(message.type)) this.queued.push(message);
      return;
    }
    this.webview.postMessage(message);
  }

  /** @param {object} event a UI event; kept for replay (deltas are not: the complete block that follows replaces them) */
  postEvent(event) {
    if (!event.kind.endsWith('-delta')) this.log.push(event);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    this.post({ type: 'event', event });
  }

  sessionState() {
    const { cwd, noFolder } = workspaceCwd();
    return {
      sessionId: this.sessionId, title: this.title, mode: this.mode, model: this.model, thinking: this.thinking,
      running: this.running, cwd, noFolder,
    };
  }

  postSession() {
    this.post({ type: 'session', session: this.sessionState() });
    this.changeEmitter.fire();
  }

  /** The webview loaded (`ready`): send everything it needs, then start the process so models and commands load. */
  handleReady() {
    this.ready = true;
    this.post({
      type: 'init',
      settings: webviewSettingsFor(this.services),
      session: this.sessionState(),
      items: this.log,
      capabilities: this.capabilities && { version: this.capabilities.version, error: this.capabilities.error },
      modes: availableModes(),
      models: this.catalog.models.length ? this.catalog.models : modelsFromEnv(),
      commands: this.catalog.commands,
      pending: [...this.pending.values()].map(prompt => this.permissionMessage(prompt)),
    });
    this.queued.splice(0).forEach(message => this.post(message));
    this.ensureProcess().then(() => {
      if (!this.continueOnStart) return;
      this.continueOnStart = false;
      this.send({ text: CONTINUE_TEXT, attachments: [] });
    }).catch(error => this.logger.error(`start: ${error.message}`));
  }

  // ---- process ----

  /** @returns {Promise<ClaudeProcess>} the running process, started when needed */
  ensureProcess() {
    if (this.proc && this.proc.isAlive()) return Promise.resolve(this.proc);
    if (!this.starting) this.starting = this.startProcess().finally(() => { this.starting = null; });
    return this.starting;
  }

  async startProcess() {
    const config = settings.processConfig();
    this.capabilities = await getCapabilities(config);
    if (this.disposed) throw new Error('the conversation was closed while Claude was starting');
    if (this.capabilities.error) this.logger.warn(`capabilities: ${this.capabilities.error}`);
    const args = buildArgs({ permissionMode: this.mode, model: this.model, resume: this.sessionId }, this.capabilities);
    const { cwd } = workspaceCwd();
    const proc = new ClaudeProcess({ config, args, cwd: cwd || os.homedir(), logger: this.logger });
    proc.on('message', event => this.handleCliEvent(event));
    proc.on('controlRequest', (requestId, request) => this.handleControlRequest(proc, requestId, request));
    proc.on('controlCancel', requestId => this.resolvePermission(requestId));
    proc.on('exit', info => this.handleExit(proc, info));
    this.logger.info(`start: ${config.claudePath} ${args.join(' ')} (cwd ${cwd})`);
    proc.start();
    this.proc = proc;
    const initialize = Object.assign({}, ...this.services.hooks.initializePayload.map(hook => hook()));
    proc.request('initialize', initialize, INITIALIZE_TIMEOUT_MS)
      .then(response => this.applyCatalog(response))
      .catch(error => this.logger.warn(`initialize: ${error.message}`));
    if (this.thinking) this.applyThinking(proc);
    return proc;
  }

  /** @param {object} response the `initialize` response */
  applyCatalog(response) {
    const models = (response.models || []).map(model => ({ value: model.value, label: model.displayName || model.value }));
    const commands = (response.commands || []).map(command => ({
      name: command.name, description: command.description || '', argumentHint: command.argumentHint || '',
    }));
    this.catalog = { models: models.length ? models : modelsFromEnv(), commands };
    this.post({ type: 'catalog', models: this.catalog.models, commands });
  }

  handleCliEvent(event) {
    const sessionId = sessionIdOf(event);
    if (sessionId && sessionId !== this.sessionId) {
      this.sessionId = sessionId;
      this.postSession();
    }
    for (const item of translateEvent(event)) {
      if (item.kind === 'init' && item.slashCommands.length && !this.catalog.commands.length) {
        this.catalog.commands = item.slashCommands.map(name => ({ name, description: '', argumentHint: '' }));
        this.post({ type: 'catalog', models: this.catalog.models, commands: this.catalog.commands });
        continue;
      }
      if (item.kind === 'init') continue;
      this.postEvent(item);
      if (item.kind === 'result') this.finishTurn();
    }
  }

  finishTurn() {
    this.running = false;
    if (!this.visible) this.unread = true;
    this.postSession();
  }

  handleExit(proc, info) {
    if (this.proc === proc) this.proc = null;
    for (const requestId of [...this.pending.keys()]) this.resolvePermission(requestId);
    const wasRunning = this.running;
    this.running = false;
    if (!this.disposed) {
      if (info.spawnError || (!info.killed && info.code !== 0 && info.code !== null)) {
        this.postEvent({ kind: 'notice', level: 'error', text: describeFailure(info) });
      } else if (info.killed && wasRunning) {
        this.postEvent({ kind: 'notice', text: 'Claude הופסק.' });
      }
      this.postSession();
    }
    this.logger.info(`exit: code ${info.code}${info.killed ? ' (killed)' : ''}`);
  }

  // ---- control requests from the CLI ----

  async handleControlRequest(proc, requestId, request) {
    if (request.subtype === 'can_use_tool') return this.handlePermission(requestId, request);
    const handler = this.services.hooks.controlHandlers.get(request.subtype);
    if (!handler) return proc.respondError(requestId, `Unsupported control request subtype: ${request.subtype}`);
    try {
      proc.respond(requestId, await handler(this, request));
    } catch (error) {
      proc.respondError(requestId, error.message);
    }
  }

  async handlePermission(requestId, request) {
    /** @type {PendingPermission} */
    const prompt = {
      requestId, toolName: request.tool_name, input: request.input || {}, toolUseId: request.tool_use_id || null,
      suggestions: request.permission_suggestions || [], title: request.title || null, description: request.description || null,
    };
    this.pending.set(requestId, prompt);
    this.changeEmitter.fire();
    for (const hook of this.services.hooks.beforePermission) {
      try {
        if (await hook(this, prompt)) return;
      } catch (error) {
        this.logger.error(`permission hook: ${error.message}`);
      }
    }
    if (this.pending.has(requestId)) this.post(this.permissionMessage(prompt));
  }

  /**
   * @param {PendingPermission} prompt
   * @param {'card'|'diff'} [kind]
   */
  permissionMessage(prompt, kind = prompt.kind || 'card') {
    return {
      type: 'permission', requestId: prompt.requestId, tool: prompt.toolName, input: prompt.input, kind,
      canAlwaysAllow: prompt.suggestions.length > 0, title: prompt.title, description: prompt.description,
    };
  }

  /**
   * The webview's answer to a permission card.
   * @param {{requestId:string, behavior:'allow'|'deny', scope?:'project', message?:string, updatedInput?:object}} answer
   */
  answerPermission(answer) {
    const prompt = this.pending.get(answer.requestId);
    if (!prompt) return;
    if (answer.behavior === 'allow') {
      const alwaysAllow = answer.scope === 'project' && prompt.suggestions.length > 0;
      this.completePermission(answer.requestId, {
        behavior: 'allow', updatedInput: answer.updatedInput || prompt.input,
        ...(alwaysAllow && { updatedPermissions: prompt.suggestions }),
      });
    } else {
      this.completePermission(answer.requestId, { behavior: 'deny', message: answer.message || 'The user denied this request.' });
    }
  }

  /**
   * Answers a pending prompt (from a card, the native diff, or a stop).
   * @param {string} requestId
   * @param {object} response the `can_use_tool` response
   */
  completePermission(requestId, response) {
    if (!this.pending.has(requestId)) return;
    if (this.proc) this.proc.respond(requestId, response);
    this.resolvePermission(requestId);
  }

  /** @param {string} requestId */
  resolvePermission(requestId) {
    if (!this.pending.delete(requestId)) return;
    this.post({ type: 'permissionResolved', requestId });
    this.changeEmitter.fire();
  }

  get waitingForPermission() {
    return this.pending.size > 0;
  }

  // ---- actions from the webview ----

  /**
   * @param {{text:string, attachments?:{mediaType:string, data:string}[], mentions?:object[]}} message
   *   The text `hooks.sendContext` returns (open file, selection, mentions) is prepended for Claude only.
   */
  async send(message) {
    const { text, attachments = [] } = message;
    const body = String(text || '');
    if (!body.trim() && !attachments.length) return;
    if (!this.title) this.title = body.trim().replace(/\s+/g, ' ').slice(0, TITLE_CHARS);
    this.running = true;
    this.unread = false;
    this.postEvent({ kind: 'user', text: body, images: attachments.length, at: Date.now() });
    this.postSession();
    const context = await this.collectContext(message);
    const fullText = context ? `${context}\n\n${body}` : body;
    const content = attachments.length
      ? [...attachments.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })),
        { type: 'text', text: fullText }]
      : fullText;
    try {
      const proc = await this.ensureProcess();
      if (!proc.sendUser(content)) throw new Error('Claude process is not running');
    } catch (error) {
      this.running = false;
      this.postEvent({ kind: 'notice', level: 'error', text: `ההודעה לא נשלחה: ${error.message}` });
      this.postSession();
    }
  }

  /** @returns {Promise<string>} the joined `hooks.sendContext` texts; a failing hook is logged and skipped */
  async collectContext(message) {
    const parts = await Promise.all(this.services.hooks.sendContext.map(hook => Promise.resolve()
      .then(() => hook(this, message))
      .catch(error => { this.logger.error(`send context: ${error.message}`); return ''; })));
    return parts.filter(Boolean).join('\n');
  }

  /** Stop: deny waiting prompts, send `interrupt` (the process is killed if it does not stop within 6 s). */
  interrupt() {
    for (const requestId of [...this.pending.keys()]) {
      this.completePermission(requestId, { behavior: 'deny', message: 'Interrupted by the user', interrupt: true });
    }
    if (this.proc) this.proc.interrupt();
  }

  /** @param {string} value */
  setMode(value) {
    if (!availableModes().some(mode => mode.value === value) || value === this.mode) return;
    const previous = this.mode;
    this.mode = value;
    this.postSession();
    if (!this.proc || !this.proc.isAlive()) return;
    const mode = cliPermissionMode(value, this.capabilities ? this.capabilities.permissionModes : [value]);
    this.proc.request('set_permission_mode', { mode }).catch(error => {
      this.logger.warn(`set_permission_mode: ${error.message}`);
      this.mode = previous;
      this.postSession();
    });
  }

  /** @param {string} value a model name, '' for the CLI default */
  setModel(value) {
    const previous = this.model;
    this.model = String(value || '').trim();
    this.postSession();
    if (!this.proc || !this.proc.isAlive()) return;
    this.proc.request('set_model', { model: this.model || 'default' }).catch(error => {
      this.logger.warn(`set_model: ${error.message}`);
      this.model = previous;
      this.postSession();
    });
  }

  /** @param {boolean} value */
  setThinking(value) {
    this.thinking = Boolean(value);
    this.postSession();
    if (this.proc && this.proc.isAlive()) this.applyThinking(this.proc);
  }

  applyThinking(proc) {
    proc.request('set_max_thinking_tokens', { max_thinking_tokens: this.thinking ? THINKING_TOKENS : null })
      .catch(error => this.logger.warn(`set_max_thinking_tokens: ${error.message}`));
  }

  // ---- registry ----

  /** @param {boolean} visible */
  setVisible(visible) {
    this.visible = visible;
    if (visible && this.unread) {
      this.unread = false;
      this.changeEmitter.fire();
    }
  }

  markUnread() {
    this.unread = true;
    this.changeEmitter.fire();
  }

  /** @param {string} title */
  rename(title) {
    this.title = title.slice(0, 200);
    this.postSession();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.proc) this.proc.kill();
    this.changeEmitter.dispose();
  }
}

module.exports = { Conversation, availableModes, webviewSettingsFor, ONBOARDING_KEY };
