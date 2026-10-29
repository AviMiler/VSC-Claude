/**
 * The OutputChannel "Claude Code Local" (a log channel with levels), shown by `claude-local.showLogs`.
 */
const vscode = require('vscode');

/**
 * @returns {{debug:(m:string)=>void, info:(m:string)=>void, warn:(m:string)=>void, error:(m:string)=>void,
 *   show:()=>void, dispose:()=>void}}
 */
function createLogger() {
  const channel = vscode.window.createOutputChannel('Claude Code Local', { log: true });
  return {
    debug: message => channel.debug(message),
    info: message => channel.info(message),
    warn: message => channel.warn(message),
    error: message => channel.error(message),
    show: () => channel.show(true),
    dispose: () => channel.dispose(),
  };
}

/**
 * The same logger with a prefix on every line (one per conversation).
 * @param {ReturnType<typeof createLogger>} logger
 * @param {string} prefix
 */
function withPrefix(logger, prefix) {
  return {
    debug: message => logger.debug(`[${prefix}] ${message}`),
    info: message => logger.info(`[${prefix}] ${message}`),
    warn: message => logger.warn(`[${prefix}] ${message}`),
    error: message => logger.error(`[${prefix}] ${message}`),
  };
}

module.exports = { createLogger, withPrefix };
