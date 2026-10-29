/**
 * Folder rules shared by features: the CLI's config folder and the working folder of a conversation.
 * Plain Node (no `vscode`), so it is unit-testable.
 */
const os = require('os');
const path = require('path');

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} `CLAUDE_CONFIG_DIR`, else `~/.claude`
 */
function claudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

/**
 * The first workspace folder, or the folder that holds the active file when there are several; no folder: home.
 * @param {string[]} folders workspace folder paths
 * @param {string|undefined} activeFolder workspace folder of the active file
 * @returns {{cwd:string, noFolder:boolean}}
 * @example pickCwd(['C:\\a', 'C:\\b'], 'C:\\b') // { cwd: 'C:\\b', noFolder: false }
 */
function pickCwd(folders, activeFolder) {
  if (!folders.length) return { cwd: os.homedir(), noFolder: true };
  return { cwd: activeFolder && folders.includes(activeFolder) ? activeFolder : folders[0], noFolder: false };
}

module.exports = { claudeConfigDir, pickCwd };
