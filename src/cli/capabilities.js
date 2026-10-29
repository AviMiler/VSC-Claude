/**
 * What the installed CLI supports (`claude --version`, `claude --help`), read once per claudePath and cached.
 * Why: optional flags are passed only when the help text lists them, so older CLIs still start.
 */
const { runClaude } = require('./spawn');

const FALLBACK_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
const cache = new Map(); // key -> Promise<Capabilities>

/**
 * @typedef {{version:string|null, flags:string[], permissionModes:string[], error:string|null}} Capabilities
 */

/**
 * @param {string} helpText output of `claude --help`
 * @param {string} versionText output of `claude --version`
 * @returns {Capabilities}
 * @example parseHelp('--permission-mode <mode> (choices: "plan", "default")', '2.1.300 (Claude Code)')
 */
function parseHelp(helpText, versionText) {
  const flags = [...new Set(helpText.match(/--[a-z][a-z-]+/g) || [])];
  const modeBlock = helpText.match(/--permission-mode <mode>[\s\S]*?\(choices:([^)]*)\)/);
  const permissionModes = modeBlock ? [...modeBlock[1].matchAll(/"([^"]+)"/g)].map(match => match[1]) : FALLBACK_MODES;
  const version = (versionText.match(/\d+\.\d+\.\d+/) || [null])[0];
  return { version, flags, permissionModes, error: null };
}

/**
 * Cached per claudePath + wrapper. Never rejects: on failure `error` is set and safe defaults are returned.
 * @param {{claudePath:string, wrapper?:string, envVars?:{name:string, value:string}[]}} config
 * @returns {Promise<Capabilities>}
 */
function getCapabilities(config) {
  const key = `${config.wrapper || ''}|${config.claudePath}`;
  if (!cache.has(key)) cache.set(key, detect(config));
  return cache.get(key);
}

async function detect(config) {
  const [help, version] = await Promise.all([runClaude(config, ['--help']), runClaude(config, ['--version'])]);
  if (help.error || (!help.stdout && help.code !== 0)) {
    cache.delete(`${config.wrapper || ''}|${config.claudePath}`); // retried on the next start (the path may get fixed)
    return { ...parseHelp('', ''), error: help.error || help.stderr || 'claude --help failed' };
  }
  return parseHelp(help.stdout + help.stderr, version.stdout);
}

/**
 * Converts a UI mode to one the CLI flag accepts (newer 2.1.x CLIs call "default" "manual").
 * @param {string} mode
 * @param {string[]} choices
 * @returns {string}
 */
function cliPermissionMode(mode, choices) {
  if (choices.includes(mode)) return mode;
  if (mode === 'default' && choices.includes('manual')) return 'manual';
  if (mode === 'manual' && choices.includes('default')) return 'default';
  return choices.includes('default') ? 'default' : (choices.includes('manual') ? 'manual' : mode);
}

module.exports = { parseHelp, getCapabilities, cliPermissionMode, FALLBACK_MODES };
