/**
 * The argument list for one long-lived `claude -p` stream-json process.
 */
const { cliPermissionMode } = require('./capabilities');

/**
 * @param {{permissionMode:string, model?:string, resume?:string}} session
 * @param {{flags:string[], permissionModes:string[]}} capabilities
 * @returns {string[]}
 * @example buildArgs({ permissionMode: 'plan' }, { flags: [], permissionModes: ['plan'] })
 */
function buildArgs(session, capabilities) {
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
  if (capabilities.flags.includes('--include-partial-messages')) args.push('--include-partial-messages');
  // Permission prompts reach the extension (as can_use_tool control requests) only with the stdio prompt tool.
  args.push('--permission-prompt-tool', 'stdio');
  args.push('--permission-mode', cliPermissionMode(session.permissionMode || 'default', capabilities.permissionModes));
  if (session.model) args.push('--model', session.model);
  if (session.resume) args.push('--resume', session.resume);
  return args;
}

module.exports = { buildArgs };
