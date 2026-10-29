// Args: builds the CLI arguments and environment for one conversation process.

/** @typedef {import('./capabilities').Capabilities} Capabilities */

const ENTRYPOINT = 'claude-local-vscode';

/**
 * The CLI's name for a permission mode. CLI 2.1.312 lists `manual` instead of `default` in `--help`.
 * @param {string} mode
 * @param {Capabilities} caps
 * @returns {string}
 */
function cliModeName(mode, caps) {
  const modes = caps.permissionModes || [];
  if (mode === 'default' && modes.length && !modes.includes('default') && modes.includes('manual')) return 'manual';
  return mode;
}

/**
 * @param {{caps: Capabilities, mode: string, model?: string, resume?: string, allowDangerouslySkipPermissions?: boolean}} opts
 * @returns {string[]}
 */
function buildArgs({ caps, mode, model, resume, allowDangerouslySkipPermissions }) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-prompt-tool', 'stdio',
    '--permission-mode', cliModeName(mode, caps),
  ];
  if (caps.flags.includes('--include-partial-messages')) args.push('--include-partial-messages');
  if (allowDangerouslySkipPermissions && caps.flags.includes('--allow-dangerously-skip-permissions')) {
    args.push('--allow-dangerously-skip-permissions');
  }
  if (model) args.push('--model', model);
  if (resume) args.push('--resume', resume);
  return args;
}

/**
 * process.env + the `claudeLocal.environmentVariables` entries + the entrypoint marker.
 * @param {NodeJS.ProcessEnv} base
 * @param {{name: string, value: string}[]} vars
 * @returns {NodeJS.ProcessEnv}
 */
function buildEnv(base, vars) {
  const env = { ...base };
  for (const v of vars) {
    if (v.name) env[v.name] = String(v.value ?? '');
  }
  env.CLAUDE_CODE_ENTRYPOINT = ENTRYPOINT;
  return env;
}

module.exports = { buildArgs, buildEnv, cliModeName, ENTRYPOINT };
