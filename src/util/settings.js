// Settings: reads the claudeLocal.* configuration for the process and for the webview.
const vscode = require('vscode');

const SECTION = 'claudeLocal';

const DEFAULT_SPINNER_VERBS = ['חושב', 'בודק', 'כותב', 'קורא', 'מנתח', 'מתכנן', 'בונה'];

/** @typedef {'default'|'acceptEdits'|'plan'|'bypassPermissions'} PermissionMode */

/**
 * @param {string} key
 * @returns {any}
 */
function get(key) {
  return vscode.workspace.getConfiguration(SECTION).get(key);
}

/**
 * Settings that apply when a Claude process starts.
 * @returns {{claudePath: string, environmentVariables: {name: string, value: string}[], claudeProcessWrapper: string, allowDangerouslySkipPermissions: boolean}}
 */
function processSettings() {
  const vars = get('environmentVariables');
  return {
    claudePath: (get('claudePath') || 'claude').trim(),
    environmentVariables: Array.isArray(vars) ? vars.filter((v) => v && typeof v.name === 'string') : [],
    claudeProcessWrapper: (get('claudeProcessWrapper') || '').trim(),
    allowDangerouslySkipPermissions: !!get('allowDangerouslySkipPermissions'),
  };
}

/**
 * The start mode: read from user settings only (as the official extension); `manual` is `default`.
 * @returns {PermissionMode}
 */
function initialPermissionMode() {
  const inspected = vscode.workspace.getConfiguration(SECTION).inspect('initialPermissionMode');
  const value = inspected && inspected.globalValue;
  if (value === 'acceptEdits' || value === 'plan') return value;
  if (value === 'bypassPermissions' && get('allowDangerouslySkipPermissions')) return value;
  return 'default';
}

/**
 * Settings the chat webview needs.
 * @returns {{useCtrlEnterToSend: boolean, scrollToBottomOnSend: boolean, showMessageTimestamps: boolean, spinnerVerbs: string[], focusView: boolean, allowDangerouslySkipPermissions: boolean}}
 */
function webviewSettings() {
  return {
    useCtrlEnterToSend: !!get('useCtrlEnterToSend'),
    scrollToBottomOnSend: get('scrollToBottomOnSend') !== false,
    showMessageTimestamps: get('showMessageTimestamps') !== false,
    spinnerVerbs: spinnerVerbs(get('spinnerVerbs')),
    focusView: !!get('focusView'),
    allowDangerouslySkipPermissions: !!get('allowDangerouslySkipPermissions'),
  };
}

/**
 * @param {{mode?: string, verbs?: string[]}|undefined} setting
 * @returns {string[]}
 */
function spinnerVerbs(setting) {
  const verbs = setting && Array.isArray(setting.verbs) ? setting.verbs.filter((v) => typeof v === 'string' && v.trim()) : [];
  if (setting && setting.mode === 'replace' && verbs.length) return verbs;
  return DEFAULT_SPINNER_VERBS.concat(verbs);
}

module.exports = { SECTION, get, processSettings, initialPermissionMode, webviewSettings };
