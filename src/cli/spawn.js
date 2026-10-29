// Spawn: resolves the CLI executable and builds the command line (cmd.exe for .cmd/.bat, the optional wrapper).
const fs = require('fs');
const path = require('path');

/**
 * Finds `name` on PATH (with PATHEXT on Windows). A path with a separator is returned as is.
 * @param {string} name
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [platform]
 * @returns {string}
 */
function resolveExecutable(name, env, platform = process.platform) {
  const isWin = platform === 'win32';
  if (name.includes('/') || (isWin && name.includes('\\'))) return name;
  const pathVar = env.PATH || env.Path || env.path || '';
  const dirs = pathVar.split(isWin ? ';' : ':').filter(Boolean);
  const exts = isWin ? ['', ...(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (isWin && ext === '' && !path.extname(name)) continue;
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return name;
}

/**
 * The executable and arguments to pass to child_process.spawn.
 * @param {{cliPath: string, args: string[], wrapper?: string, env: NodeJS.ProcessEnv, platform?: string}} opts
 * @returns {{command: string, args: string[], windowsVerbatimArguments: boolean}}
 */
function buildCommand({ cliPath, args, wrapper, env, platform = process.platform }) {
  let command = resolveExecutable(cliPath, env, platform);
  let fullArgs = args;
  if (wrapper) {
    fullArgs = [command, ...args];
    command = resolveExecutable(wrapper, env, platform);
  }
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    const line = [command, ...fullArgs].map(quoteForCmd).join(' ');
    return { command: env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
  }
  return { command, args: fullArgs, windowsVerbatimArguments: false };
}

/**
 * Quotes one argument for a cmd.exe command line.
 * @param {string} arg
 * @returns {string}
 */
function quoteForCmd(arg) {
  if (/^[\w\-.:\\/=@]+$/.test(arg)) return arg;
  return '"' + String(arg).replace(/(["^%!&|<>()])/g, '^$1') + '"';
}

module.exports = { resolveExecutable, buildCommand, quoteForCmd };
