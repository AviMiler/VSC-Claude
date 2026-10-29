/**
 * One long-lived CLI process: newline-delimited JSON over stdio and the control protocol (requests both ways).
 * Plain Node (no `vscode`), so it runs under `node --test` against dev/fake-claude.js.
 */
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawnClaude, killTree } = require('./spawn');

const STDERR_TAIL_CHARS = 3000;
const LOG_CHARS = 500;
const DEFAULT_TIMEOUT_MS = 30000;
const KILL_AFTER_INTERRUPT_MS = 6000;

/** @typedef {{debug:(m:string)=>void, info:(m:string)=>void, warn:(m:string)=>void, error:(m:string)=>void}} Logger */
/** @typedef {{code:number|null, stderr:string, spawnError:Error|null, killed:boolean}} ExitInfo */

const cut = text => (text.length > LOG_CHARS ? `${text.slice(0, LOG_CHARS)}…` : text);

/**
 * Events: `message` (stream event object), `controlRequest` (requestId, request), `controlCancel` (requestId),
 * `exit` (ExitInfo).
 * @example
 * const proc = new ClaudeProcess({ config, args, cwd, logger });
 * proc.on('message', event => …); proc.start(); await proc.request('initialize', {}, 60000);
 */
class ClaudeProcess extends EventEmitter {
  /**
   * @param {{config?:object, args?:string[], cwd?:string, logger:Logger,
   *   spawnFn?:()=>import('child_process').ChildProcessWithoutNullStreams}} options
   *   spawnFn replaces the real spawn (tests start the fake CLI with it).
   */
  constructor({ config, args, cwd, logger, spawnFn }) {
    super();
    this.logger = logger;
    this.spawnFn = spawnFn || (() => spawnClaude(config, args, cwd));
    this.pending = new Map(); // request_id -> {resolve, reject, timer}
    this.alive = false;
    this.killed = false;
    this.stdoutBuffer = '';
    this.stderr = '';
    this.spawnError = null;
    this.child = null;
  }

  /** Spawns the process. A spawn failure is reported through the `exit` event, never thrown. */
  start() {
    try {
      this.child = this.spawnFn();
    } catch (error) {
      this.spawnError = error;
      setImmediate(() => this.finish(null));
      return;
    }
    this.alive = true;
    const child = this.child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      const lines = (this.stdoutBuffer + chunk).split('\n');
      this.stdoutBuffer = lines.pop();
      lines.forEach(line => this.handleLine(line));
    });
    child.stderr.on('data', chunk => this.addStderr(chunk));
    child.stdin.on('error', error => this.logger.warn(`stdin: ${error.message}`));
    // A failed spawn (wrong path) may never emit 'close', so it finishes here.
    child.on('error', error => { this.spawnError = error; if (!child.pid) setImmediate(() => this.finish(null)); });
    child.on('close', code => this.finish(code));
  }

  get pid() { return this.child ? this.child.pid : undefined; }

  isAlive() { return this.alive; }

  addStderr(text) {
    this.logger.debug(`stderr: ${cut(String(text).trimEnd())}`);
    this.stderr = `${this.stderr}${text}`.slice(-STDERR_TAIL_CHARS);
  }

  handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.logger.debug(`← ${cut(trimmed)}`);
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      this.addStderr(`${trimmed}\n`); // usually a plain-text CLI error
      return;
    }
    if (event.type === 'control_response') this.settle(event.response || {});
    else if (event.type === 'control_request') this.emit('controlRequest', event.request_id, event.request || {});
    else if (event.type === 'control_cancel_request') this.emit('controlCancel', event.request_id);
    else if (event.type !== 'keep_alive') this.emit('message', event);
  }

  settle(response) {
    const waiter = this.pending.get(response.request_id);
    if (!waiter) return;
    this.pending.delete(response.request_id);
    clearTimeout(waiter.timer);
    if (response.subtype === 'error') waiter.reject(new Error(response.error || 'control request failed'));
    else waiter.resolve(response.response ?? {});
  }

  finish(code) {
    if (this.finished) return;
    this.finished = true;
    this.alive = false;
    this.handleLine(this.stdoutBuffer);
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Claude process exited'));
    }
    this.pending.clear();
    clearTimeout(this.killTimer);
    /** @type {ExitInfo} */
    const info = { code, stderr: this.stderr.trim(), spawnError: this.spawnError, killed: this.killed };
    this.emit('exit', info);
  }

  /**
   * @param {object} message one JSON message
   * @returns {boolean} false when the process is not running
   */
  send(message) {
    if (!this.alive || !this.child.stdin.writable) return false;
    const line = JSON.stringify(message);
    this.logger.debug(`→ ${cut(line)}`);
    this.child.stdin.write(`${line}\n`, 'utf8');
    return true;
  }

  /**
   * @param {string|object[]} content a string or content blocks (text, image)
   * @returns {boolean}
   */
  sendUser(content) {
    return this.send({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });
  }

  /**
   * Sends a control request and resolves with its response payload.
   * @param {string} subtype
   * @param {object} [payload]
   * @param {number} [timeoutMs]
   * @returns {Promise<object>}
   */
  request(subtype, payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const requestId = `local-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      if (!this.send({ type: 'control_request', request_id: requestId, request: { subtype, ...payload } })) {
        reject(new Error('Claude process is not running'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${subtype}: no answer from Claude within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
    });
  }

  /** @param {string} requestId @param {object} response */
  respond(requestId, response) {
    return this.send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  /** @param {string} requestId @param {string} error */
  respondError(requestId, error) {
    return this.send({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error } });
  }

  /**
   * Sends `interrupt`; a process still alive after 6 s is killed.
   * @returns {Promise<void>}
   */
  async interrupt() {
    if (!this.alive) return;
    clearTimeout(this.killTimer);
    this.killTimer = setTimeout(() => {
      this.logger.warn('interrupt: no answer within 6 s, killing the process');
      this.kill();
    }, KILL_AFTER_INTERRUPT_MS);
    try {
      await this.request('interrupt', {}, KILL_AFTER_INTERRUPT_MS);
      clearTimeout(this.killTimer);
    } catch (error) {
      this.logger.warn(`interrupt: ${error.message}`);
    }
  }

  /** Kills the process tree (`taskkill /T /F` on Windows). */
  kill() {
    if (!this.alive) return;
    this.killed = true;
    killTree(this.pid, message => this.logger.warn(`kill: ${message}`));
  }
}

module.exports = { ClaudeProcess };
