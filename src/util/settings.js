/**
 * Reads the `claudeLocal.*` settings and reports live changes.
 */
const vscode = require('vscode');

const SECTION = 'claudeLocal';
const PROCESS_KEYS = ['claudePath', 'environmentVariables', 'claudeProcessWrapper'];
const WEBVIEW_KEYS = [
  'useCtrlEnterToSend', 'scrollToBottomOnSend', 'showMessageTimestamps', 'spinnerVerbs', 'focusView',
  'allowDangerouslySkipPermissions', 'hideOnboarding',
];
const ALL_KEYS = [
  ...PROCESS_KEYS, ...WEBVIEW_KEYS, 'useTerminal', 'respectGitIgnore', 'initialPermissionMode', 'disableLoginPrompt',
  'autosave', 'preferredLocation', 'lockEditorGroups', 'enableNewConversationShortcut',
  'enableReopenClosedSessionShortcut', 'attachOpenFile', 'attachSelection', 'continueAfterReload',
  'archiveInactiveSessions', 'usePythonEnvironment',
];

/**
 * @param {string} key without the `claudeLocal.` prefix
 * @returns {any}
 */
function get(key) {
  return vscode.workspace.getConfiguration(SECTION).get(key);
}

/** @returns {{claudePath:string, wrapper:string|undefined, envVars:{name:string, value:string}[]}} */
function processConfig() {
  return {
    claudePath: get('claudePath') || 'claude',
    wrapper: get('claudeProcessWrapper') || undefined,
    envVars: Array.isArray(get('environmentVariables')) ? get('environmentVariables') : [],
  };
}

/**
 * The start mode. Read from user settings only (a workspace cannot raise it); `manual` is an alias of `default`;
 * `bypassPermissions` needs `allowDangerouslySkipPermissions`.
 * @returns {'default'|'acceptEdits'|'plan'|'bypassPermissions'}
 */
function initialPermissionMode() {
  const value = vscode.workspace.getConfiguration(SECTION).inspect('initialPermissionMode')?.globalValue;
  if (value === 'acceptEdits' || value === 'plan') return value;
  if (value === 'bypassPermissions' && get('allowDangerouslySkipPermissions')) return value;
  return 'default';
}

/** @returns {Record<string, any>} the settings a chat webview needs */
function webviewSettings() {
  return Object.fromEntries(WEBVIEW_KEYS.map(key => [key, get(key)]));
}

/**
 * @param {(change:{keys:string[], processChanged:boolean, webviewChanged:boolean})=>void} listener
 * @returns {vscode.Disposable}
 */
function onDidChange(listener) {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration(SECTION)) return;
    const keys = ALL_KEYS.filter(key => event.affectsConfiguration(`${SECTION}.${key}`));
    listener({
      keys,
      processChanged: keys.some(key => PROCESS_KEYS.includes(key)),
      webviewChanged: keys.some(key => WEBVIEW_KEYS.includes(key)),
    });
  });
}

module.exports = { get, processConfig, initialPermissionMode, webviewSettings, onDidChange };
