// Capabilities: reads the CLI's version, flags and permission modes from `--version` and `--help`, cached per path.
const { execFile } = require('child_process');
const { buildCommand } = require('./spawn');

/** @typedef {{version: string, flags: string[], permissionModes: string[]}} Capabilities */

const cache = new Map();

/**
 * @param {string} help
 * @returns {{flags: string[], permissionModes: string[]}}
 */
function parseHelp(help) {
  const flags = Array.from(new Set(help.match(/--[a-z][a-z0-9-]+/g) || []));
  let permissionModes = [];
  const at = help.indexOf('--permission-mode');
  if (at >= 0) {
    const tail = help.slice(at, at + 600);
    const choices = tail.match(/choices:([^)]*)\)/);
    if (choices) permissionModes = (choices[1].match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
  }
  return { flags, permissionModes };
}

/**
 * @param {string} text
 * @returns {string}
 */
function parseVersion(text) {
  const m = String(text).match(/\d+\.\d+\.\d+/);
  return m ? m[0] : '';
}

/**
 * @param {{cliPath: string, wrapper?: string, env: NodeJS.ProcessEnv}} opts
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function run(opts, args) {
  const cmd = buildCommand({ cliPath: opts.cliPath, args, wrapper: opts.wrapper, env: opts.env });
  return new Promise((resolve, reject) => {
    execFile(cmd.command, cmd.args, { env: opts.env, timeout: 20000, windowsHide: true, windowsVerbatimArguments: cmd.windowsVerbatimArguments, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) reject(err);
      else resolve(String(stdout) + String(stderr));
    });
  });
}

/**
 * Read once per (path, wrapper) and cached. A failed read is not cached.
 * @param {{cliPath: string, wrapper?: string, env: NodeJS.ProcessEnv}} opts
 * @returns {Promise<Capabilities>}
 */
function getCapabilities(opts) {
  const key = `${opts.cliPath}\u0000${opts.wrapper || ''}`;
  if (!cache.has(key)) {
    const promise = Promise.all([run(opts, ['--version']), run(opts, ['--help'])]).then(([version, help]) => ({
      version: parseVersion(version),
      ...parseHelp(help),
    }));
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

module.exports = { getCapabilities, parseHelp, parseVersion };
