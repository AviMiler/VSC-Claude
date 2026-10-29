// Logger: the "Claude Code Local" output channel, with message contents cut to 500 characters.
const vscode = require('vscode');

const MAX_CONTENT = 500;

/** @typedef {{debug(msg: string): void, info(msg: string): void, warn(msg: string): void, error(msg: string): void, show(): void, dispose(): void}} Logger */

/**
 * @returns {Logger}
 */
function createLogger() {
  const channel = vscode.window.createOutputChannel('Claude Code Local', { log: true });
  return {
    debug: (msg) => channel.debug(cut(msg)),
    info: (msg) => channel.info(cut(msg)),
    warn: (msg) => channel.warn(cut(msg)),
    error: (msg) => channel.error(cut(msg)),
    show: () => channel.show(true),
    dispose: () => channel.dispose(),
  };
}

/**
 * @param {string} msg
 * @returns {string}
 */
function cut(msg) {
  const text = String(msg);
  return text.length > MAX_CONTENT ? text.slice(0, MAX_CONTENT) + `… (${text.length} תווים)` : text;
}

module.exports = { createLogger, cut };
