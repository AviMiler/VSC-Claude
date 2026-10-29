// Conversation: one chat — its CLI process, thread ops, permissions and the webview messages of the panel or view showing it.
const path = require('path');
const vscode = require('vscode');
const { ClaudeProcess } = require('../cli/process');
const { buildArgs, buildEnv } = require('../cli/args');
const { getCapabilities } = require('../cli/capabilities');
const { EventTranslator } = require('./event-translator');
const { permissionResponse, interruptedResponse } = require('./permissions');
const settings = require('../util/settings');
const { conversationCwd } = require('../util/paths');

const INITIALIZE_TIMEOUT_MS = 60000;
const TITLE_LENGTH = 40;
const CONTINUE_TEXT = 'המשך מהנקודה שבה עצרת.';

/**
 * @typedef {import('./event-translator').ThreadOp} ThreadOp
 * @typedef {'default'|'acceptEdits'|'plan'|'bypassPermissions'} PermissionMode
 * @typedef {{sessionId?: string, mode?: PermissionMode, model?: string, running?: boolean, title?: string}} SavedState
 * @typedef {{
 *   log: import('../util/logger').Logger,
 *   kind: 'panel'|'sidebar',
 *   restore?: SavedState,
 *   onTitle?: (title: string) => void,
 *   onAttention: () => void,
 *   onState?: () => void,
 *   onFocusChange?: (focused: boolean) => void,
 *   openFileColumn: () => vscode.ViewColumn,
 * }} ConversationOptions
 */

class Conversation {
  /** @param {ConversationOptions} opts */
  constructor(opts) {
    this.opts = opts;
    this.log = opts.log;
    const restore = opts.restore || {};
    /** @type {vscode.Webview|undefined} */
    this.webview = undefined;
    this.webviewDisposables = [];
    this.sessionId = restore.sessionId || '';
    this.title = restore.title || 'Claude';
    /** @type {PermissionMode} */
    this.mode = restore.mode || settings.initialPermissionMode();
    this.model = restore.model || '';
    this.thinking = true;
    this.continuePending = !!(restore.running && restore.sessionId && settings.get('continueAfterReload') !== false);
    this.restored = !!restore.sessionId;
    this.reset();
  }

  /** Clears the thread and kills the process (a new conversation in the same surface). */
  reset() {
    this.killProcess();
    /** Bumped on every reset, so a process start that finishes after a reset or dispose is dropped. */
    this.generation = (this.generation || 0) + 1;
    /** @type {ThreadOp[]} */
    this.ops = [];
    this.translator = new EventTranslator();
    /** @type {Map<string, {request: any, at: number}>} */
    this.permissions = new Map();
    this.running = false;
    this.status = '';
    this.unreadDone = false;
    this.models = [];
    this.commands = [];
    this.cliVersion = '';
    this.firstUserText = '';
  }

  /** Starts a fresh conversation in the same tab or view. */
  newConversation() {
    this.reset();
    this.sessionId = '';
    this.restored = false;
    this.continuePending = false;
    this.title = 'Claude';
    if (this.opts.onTitle) this.opts.onTitle(this.title);
    this.opts.onAttention();
    if (this.opts.onState) this.opts.onState();
    this.postInit();
  }

  /**
   * Shows this conversation in a webview (a panel's, or the sidebar view's, which can be recreated).
   * @param {vscode.Webview} webview
   */
  attach(webview) {
    this.webviewDisposables.forEach((d) => d.dispose());
    this.webview = webview;
    this.webviewDisposables = [webview.onDidReceiveMessage((m) => this.onWebviewMessage(m))];
  }

  /** @param {object} msg */
  post(msg) {
    if (this.webview) this.webview.postMessage(msg);
  }

  /** @param {any} m */
  onWebviewMessage(m) {
    if (!m || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'ready':
        this.postInit();
        if (this.restored || this.continuePending) this.ensureProcess();
        break;
      case 'send':
        this.sendUser(String(m.text || ''), Array.isArray(m.attachments) ? m.attachments : []);
        break;
      case 'interrupt':
        this.interrupt();
        break;
      case 'setMode':
        this.setMode(m.value);
        break;
      case 'setModel':
        this.setModel(String(m.value || ''));
        break;
      case 'setThinking':
        this.setThinking(!!m.value);
        break;
      case 'permissionAnswer':
        this.answerPermission(m);
        break;
      case 'openFile':
        this.openFile(String(m.path || ''), m.line);
        break;
      case 'newConversation':
        this.newConversation();
        break;
      case 'focusChanged':
        if (this.opts.onFocusChange) this.opts.onFocusChange(!!m.focused);
        break;
      case 'showLogs':
        vscode.commands.executeCommand('claude-local.showLogs');
        break;
      default:
        this.log.warn(`הודעה לא מוכרת מה-webview: ${m.type}`);
    }
  }

  postInit() {
    const cwd = conversationCwd();
    this.post({
      type: 'init',
      settings: settings.webviewSettings(),
      session: { sessionId: this.sessionId, title: this.title, mode: this.mode, model: this.model, thinking: this.thinking, noFolder: cwd.isHome, restored: this.restored },
      items: this.ops,
      capabilities: { version: this.cliVersion },
      modes: this.availableModes(),
      models: this.models,
      commands: this.commands,
      running: this.running,
      status: this.status,
      permissions: Array.from(this.permissions.entries()).map(([requestId, p]) => permissionMessage(requestId, p.request)),
    });
  }

  /** @returns {PermissionMode[]} */
  availableModes() {
    const modes = ['default', 'acceptEdits', 'plan'];
    if (settings.get('allowDangerouslySkipPermissions')) modes.push('bypassPermissions');
    return /** @type {PermissionMode[]} */ (modes);
  }

  /** Settings changed: push webview settings, and say when a process setting waits for the next process. */
  onSettingsChanged(processSettingChanged) {
    this.post({ type: 'update', settings: settings.webviewSettings(), modes: this.availableModes() });
    if (processSettingChanged && this.process) this.addOp({ op: 'notice', text: 'ההגדרה תחול בשיחה הבאה.', level: 'info' });
  }

  /** @returns {Promise<ClaudeProcess|undefined>} */
  ensureProcess() {
    if (this.process && !this.process.exited) return Promise.resolve(this.process);
    if (this.starting) return this.starting;
    this.starting = this.startProcess().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  /** @returns {Promise<ClaudeProcess|undefined>} */
  async startProcess() {
    const ps = settings.processSettings();
    const env = buildEnv(process.env, ps.environmentVariables);
    const { cwd } = conversationCwd();
    const generation = this.generation;
    let caps;
    try {
      caps = await getCapabilities({ cliPath: ps.claudePath, wrapper: ps.claudeProcessWrapper, env });
    } catch (err) {
      if (!this.disposed && generation === this.generation) this.failStart(err);
      return undefined;
    }
    if (this.disposed || generation !== this.generation) return undefined;
    this.cliVersion = caps.version;
    const args = buildArgs({
      caps,
      mode: this.mode,
      model: this.model,
      resume: this.sessionId,
      allowDangerouslySkipPermissions: ps.allowDangerouslySkipPermissions,
    });
    const proc = new ClaudeProcess({ cliPath: ps.claudePath, args, wrapper: ps.claudeProcessWrapper, cwd, env, log: this.log });
    this.process = proc;
    proc.on('message', (msg) => this.onCliMessage(msg));
    proc.on('controlRequest', (id, req) => this.onControlRequest(proc, id, req));
    proc.on('controlCancel', (id) => this.resolvePermission(id));
    proc.on('exit', (info) => this.onExit(proc, info));
    try {
      const init = await proc.request({ subtype: 'initialize', hooks: null }, INITIALIZE_TIMEOUT_MS);
      this.models = Array.isArray(init.models) ? init.models.map((m) => ({ value: m.value, label: m.displayName || m.value, description: m.description || '' })) : [];
      this.commands = Array.isArray(init.commands) ? init.commands.map((c) => ({ name: c.name, description: c.description || '', argumentHint: c.argumentHint || '' })) : [];
      if (init.claude_code_version) this.cliVersion = init.claude_code_version;
      this.post({ type: 'update', models: this.models, commands: this.commands, capabilities: { version: this.cliVersion } });
    } catch (err) {
      if (proc.exited) return undefined;
      this.log.warn(`initialize: ${err.message}`);
    }
    if (this.continuePending) {
      this.continuePending = false;
      this.sendUser(CONTINUE_TEXT, []);
    }
    return proc;
  }

  /** @param {Error} err */
  failStart(err) {
    this.log.error(`לא ניתן להפעיל את Claude: ${err.message}`);
    this.addOp({ op: 'notice', level: 'error', text: `לא ניתן להפעיל את Claude (${err.message}). בדוק את ההגדרה claudeLocal.claudePath.` });
    this.setRunning(false);
  }

  /**
   * @param {ClaudeProcess} proc
   * @param {{code: number|null, signal: string|null, stderr: string, spawnError?: Error}} info
   */
  onExit(proc, info) {
    if (this.process !== proc) return;
    this.process = undefined;
    this.clearPermissions();
    if (!this.disposed && !proc.stopping) {
      if (info.spawnError) {
        this.failStart(info.spawnError);
      } else if (/unknown option|unrecognized option/i.test(info.stderr)) {
        this.addOp({ op: 'notice', level: 'error', text: 'גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח.' });
      } else if (info.code !== 0 || this.running) {
        const tail = info.stderr.trim() ? `\n${info.stderr.trim()}` : '';
        this.addOp({ op: 'notice', level: 'error', text: `Claude הסתיים (קוד ${info.code === null ? info.signal : info.code}).${tail}` });
      }
    }
    this.setRunning(false);
  }

  /** @param {any} msg */
  onCliMessage(msg) {
    const out = this.translator.translate(msg);
    if (out.session) {
      if (out.session.sessionId) this.sessionId = out.session.sessionId;
      this.post({ type: 'session', sessionId: this.sessionId, mode: this.mode, model: this.model, title: this.title });
      if (this.opts.onState) this.opts.onState();
    }
    for (const op of out.ops) this.addOp(op);
    if (out.status !== undefined) {
      this.status = out.status;
      this.post({ type: 'state', running: this.running, status: this.status });
    }
    if (out.turnEnded) this.setRunning(false);
  }

  /**
   * @param {ClaudeProcess} proc
   * @param {string} requestId
   * @param {any} request
   */
  onControlRequest(proc, requestId, request) {
    if (request.subtype === 'can_use_tool') {
      this.permissions.set(requestId, { request, at: Date.now() });
      this.post(permissionMessage(requestId, request));
      this.opts.onAttention();
      return;
    }
    this.log.warn(`בקשת בקרה לא נתמכת: ${request.subtype}`);
    proc.respondError(requestId, `Unsupported control request subtype: ${request.subtype}`);
  }

  /** @param {{requestId: string, behavior: 'allow'|'deny', scope?: 'always', message?: string, answers?: Record<string, string>}} answer */
  answerPermission(answer) {
    const entry = this.permissions.get(answer.requestId);
    if (!entry || !this.process) return;
    this.process.respond(answer.requestId, permissionResponse(entry.request, answer));
    this.resolvePermission(answer.requestId);
  }

  /** @param {string} requestId */
  resolvePermission(requestId) {
    if (!this.permissions.delete(requestId)) return;
    this.post({ type: 'permissionResolved', requestId });
    this.opts.onAttention();
  }

  /** Denies every waiting permission with "Interrupted by the user". */
  clearPermissions() {
    for (const requestId of Array.from(this.permissions.keys())) {
      if (this.process) this.process.respond(requestId, interruptedResponse());
      this.resolvePermission(requestId);
    }
  }

  /**
   * @param {string} text
   * @param {{mediaType: string, data: string}[]} attachments
   */
  async sendUser(text, attachments) {
    const images = attachments.filter((a) => a && /^image\/(png|jpeg|gif|webp)$/.test(a.mediaType) && typeof a.data === 'string');
    if (!text.trim() && !images.length) return;
    if (!this.firstUserText && text.trim()) {
      this.firstUserText = text.trim();
      this.title = this.firstUserText.replace(/\s+/g, ' ').slice(0, TITLE_LENGTH);
      if (this.opts.onTitle) this.opts.onTitle(this.title);
    }
    this.addOp({ op: 'user', id: `u${Date.now()}`, text, images: images.map((i) => `data:${i.mediaType};base64,${i.data}`), at: Date.now() });
    this.setRunning(true);
    const proc = await this.ensureProcess();
    if (!proc) return;
    const content = images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }));
    if (text) content.push({ type: 'text', text });
    proc.sendUser(content);
  }

  interrupt() {
    if (!this.process) return;
    this.clearPermissions();
    this.process.request({ subtype: 'interrupt' }).catch((err) => this.log.warn(`interrupt: ${err.message}`));
  }

  /** @param {PermissionMode} mode */
  setMode(mode) {
    if (!this.availableModes().includes(mode)) return;
    const previous = this.mode;
    this.mode = mode;
    this.post({ type: 'session', sessionId: this.sessionId, mode: this.mode, model: this.model, title: this.title });
    if (!this.process) return;
    this.process.request({ subtype: 'set_permission_mode', mode }).catch((err) => {
      this.log.warn(`set_permission_mode: ${err.message}`);
      this.mode = previous;
      this.post({ type: 'session', sessionId: this.sessionId, mode: this.mode, model: this.model, title: this.title });
    });
  }

  /** @param {string} model */
  setModel(model) {
    const previous = this.model;
    this.model = model;
    if (!this.process) return;
    this.process.request({ subtype: 'set_model', model: model || 'default' }).catch((err) => {
      this.log.warn(`set_model: ${err.message}`);
      this.model = previous;
      this.post({ type: 'session', sessionId: this.sessionId, mode: this.mode, model: this.model, title: this.title });
    });
  }

  /** @param {boolean} on */
  setThinking(on) {
    this.thinking = on;
    if (!this.process) return;
    this.process.request({ subtype: 'set_max_thinking_tokens', max_thinking_tokens: on ? null : 0 }).catch((err) => this.log.warn(`set_max_thinking_tokens: ${err.message}`));
  }

  /**
   * @param {string} file
   * @param {number} [line]
   */
  async openFile(file, line) {
    if (!file) return;
    const full = path.isAbsolute(file) ? file : path.join(conversationCwd().cwd, file);
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full));
      const pos = typeof line === 'number' && line > 0 ? new vscode.Position(line - 1, 0) : undefined;
      await vscode.window.showTextDocument(doc, {
        viewColumn: this.opts.openFileColumn(),
        preview: false,
        selection: pos ? new vscode.Range(pos, pos) : undefined,
      });
    } catch (err) {
      vscode.window.showWarningMessage(`לא ניתן לפתוח את ${file}: ${err.message}`);
    }
  }

  /** @param {ThreadOp} op */
  addOp(op) {
    const last = this.ops[this.ops.length - 1];
    if (last && op.append !== undefined && last.op === op.op && last.id === op.id && last.append !== undefined) {
      last.append += op.append;
    } else {
      this.ops.push({ ...op });
    }
    this.post({ type: 'event', ops: [op] });
  }

  /** @param {boolean} running */
  setRunning(running) {
    const wasRunning = this.running;
    this.running = running;
    if (!running) this.status = '';
    if (wasRunning && !running && !this.isVisible()) this.unreadDone = true;
    this.post({ type: 'state', running, status: this.status });
    this.opts.onAttention();
    if (this.opts.onState) this.opts.onState();
  }

  /** Overridden by the owner: whether its panel or view is visible. */
  isVisible() {
    return true;
  }

  /** The surface became visible: the "done" dot is cleared. */
  markSeen() {
    if (!this.unreadDone) return;
    this.unreadDone = false;
    this.opts.onAttention();
  }

  /** @returns {'pending'|'done'|null} */
  attention() {
    if (this.permissions.size) return 'pending';
    if (this.unreadDone) return 'done';
    return null;
  }

  /** @returns {SavedState} */
  savedState() {
    return { sessionId: this.sessionId, mode: this.mode, model: this.model, running: this.running, title: this.title };
  }

  killProcess() {
    const proc = this.process;
    if (!proc) return;
    this.clearPermissions();
    proc.stopping = true;
    this.process = undefined;
    proc.stop();
  }

  dispose() {
    this.disposed = true;
    this.killProcess();
    this.webviewDisposables.forEach((d) => d.dispose());
    this.webview = undefined;
  }
}

/**
 * @param {string} requestId
 * @param {any} request
 */
function permissionMessage(requestId, request) {
  return {
    type: 'permission',
    requestId,
    tool: request.tool_name,
    displayName: request.display_name || request.tool_name,
    description: request.description || '',
    input: request.input || {},
    canAlways: Array.isArray(request.permission_suggestions) && request.permission_suggestions.length > 0,
    kind: 'card',
  };
}

module.exports = { Conversation };
