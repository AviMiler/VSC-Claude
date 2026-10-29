// Process: one long-lived CLI process speaking stream-json and the control protocol over stdin/stdout.
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { buildCommand } = require('./spawn');
const { nonce } = require('../util/nonce');

const KILL_AFTER_MS = 6000;
const STDERR_KEEP = 3000;

/**
 * @typedef {{debug(m: string): void, info(m: string): void, warn(m: string): void, error(m: string): void}} Log
 * @typedef {{cliPath: string, args: string[], wrapper?: string, cwd: string, env: NodeJS.ProcessEnv, log: Log}} ProcessOptions
 */

/**
 * Events:
 * - `message` (msg: object) — every stdout line that is not a control message
 * - `controlRequest` (requestId: string, request: object) — a request from the CLI (`can_use_tool`, `mcp_message`, …)
 * - `exit` ({code: number|null, signal: string|null, stderr: string, spawnError?: Error})
 */
class ClaudeProcess extends EventEmitter {
  /** @param {ProcessOptions} opts */
  constructor(opts) {
    super();
    this.log = opts.log;
    this.stderr = '';
    this.exited = false;
    /** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout|undefined}>} */
    this.pending = new Map();
    const cmd = buildCommand({ cliPath: opts.cliPath, args: opts.args, wrapper: opts.wrapper, env: opts.env });
    this.log.info(`הפעלה: ${cmd.command} ${cmd.args.join(' ')} (cwd: ${opts.cwd})`);
    this.child = spawn(cmd.command, cmd.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: cmd.windowsVerbatimArguments,
    });
    this.child.on('error', (err) => this.finish(null, null, err));
    this.child.on('exit', (code, signal) => this.finish(code, signal));
    this.child.stdin.on('error', (err) => this.log.warn(`stdin: ${err.message}`));
    let buf = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) this.onLine(line);
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_KEEP);
      this.log.debug(`stderr: ${chunk.trimEnd()}`);
    });
  }

  /** @param {string} line */
  onLine(line) {
    this.log.debug(`← ${line}`);
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log.warn(`שורה שאינה JSON: ${line}`);
      return;
    }
    if (msg.type === 'control_response' && msg.response) {
      const entry = this.pending.get(msg.response.request_id);
      if (!entry) return;
      this.pending.delete(msg.response.request_id);
      clearTimeout(entry.timer);
      if (msg.response.subtype === 'success') entry.resolve(msg.response.response || {});
      else entry.reject(new Error(msg.response.error || 'control request failed'));
      return;
    }
    if (msg.type === 'control_request' && msg.request) {
      this.emit('controlRequest', msg.request_id, msg.request);
      return;
    }
    if (msg.type === 'control_cancel_request') {
      this.emit('controlCancel', msg.request_id);
      return;
    }
    this.emit('message', msg);
  }

  /** @param {object} obj */
  send(obj) {
    if (this.exited || !this.child.stdin.writable) return false;
    const line = JSON.stringify(obj);
    this.log.debug(`→ ${line}`);
    this.child.stdin.write(line + '\n');
    return true;
  }

  /**
   * Sends a control request and waits for its control_response.
   * @param {object} request — `{subtype, ...fields}`
   * @param {number} [timeoutMs]
   * @returns {Promise<object>}
   */
  request(request, timeoutMs = 0) {
    const requestId = `req_${nonce(8)}`;
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(new Error('process exited'));
      const timer = timeoutMs ? setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${request.subtype}: timeout`));
      }, timeoutMs) : undefined;
      this.pending.set(requestId, { resolve, reject, timer });
      this.send({ type: 'control_request', request_id: requestId, request });
    });
  }

  /**
   * Answers a control request from the CLI.
   * @param {string} requestId
   * @param {object} response
   */
  respond(requestId, response) {
    this.send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  /**
   * @param {string} requestId
   * @param {string} error
   */
  respondError(requestId, error) {
    this.send({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error } });
  }

  /**
   * @param {Array<object>} content — Anthropic content blocks
   */
  sendUser(content) {
    return this.send({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });
  }

  /** Sends `interrupt`, then kills the process tree if it is still alive after 6 s. */
  stop() {
    if (this.exited) return;
    this.request({ subtype: 'interrupt' }).catch(() => {});
    try {
      this.child.stdin.end();
    } catch {
      // already closed
    }
    this.killTimer = setTimeout(() => this.kill(), KILL_AFTER_MS);
  }

  kill() {
    if (this.exited || !this.child.pid) return;
    if (process.platform === 'win32') {
      execFile('taskkill', ['/T', '/F', '/PID', String(this.child.pid)], { windowsHide: true }, () => {});
    } else {
      this.child.kill('SIGKILL');
    }
  }

  /**
   * @param {number|null} code
   * @param {string|null} signal
   * @param {Error} [spawnError]
   */
  finish(code, signal, spawnError) {
    if (this.exited) return;
    this.exited = true;
    clearTimeout(this.killTimer);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('process exited'));
    }
    this.pending.clear();
    this.log.info(`התהליך הסתיים (code ${code}, signal ${signal}${spawnError ? `, ${spawnError.message}` : ''})`);
    this.emit('exit', { code, signal, stderr: this.stderr, spawnError });
  }
}

module.exports = { ClaudeProcess };
