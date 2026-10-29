/**
 * The panels feature: sidebar views, tab restore, opening commands, the status bar, placement context keys and
 * live settings pushed to every chat webview.
 */
const vscode = require('vscode');
const settings = require('../util/settings');
const { registerSidebarViews } = require('./sidebar-view');
const { registerSerializer } = require('./serializer');
const { registerPanelCommands } = require('./commands');
const { registerStatusBar } = require('./status-bar');
const { webviewSettingsFor, ONBOARDING_KEY } = require('./conversation');

// First VS Code release whose manifest accepts the `secondarySidebar` view container (not verified; a later
// guess only costs older-but-capable versions the activity-bar fallback).
const SECONDARY_SIDEBAR_VERSION = [1, 106];

/** @param {string} version e.g. "1.105.1" */
function supportsSecondarySidebar(version) {
  const [major, minor] = version.split('.').map(Number);
  return major > SECONDARY_SIDEBAR_VERSION[0] || (major === SECONDARY_SIDEBAR_VERSION[0] && minor >= SECONDARY_SIDEBAR_VERSION[1]);
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {object} services shared services (extension.js); this adds `sidebar()` and `webviewHost(entry)`
 */
function register(context, services) {
  const { registry } = services;
  const secondary = supportsSecondarySidebar(vscode.version);
  vscode.commands.executeCommand('setContext', 'claude-local:doesNotSupportSecondarySidebar', !secondary);
  vscode.commands.executeCommand('setContext', 'claude-local.sessionsListEnabled', true);
  registry.watchClosedTabs();

  const { providers, disposables } = registerSidebarViews(services);
  services.sidebar = () => providers[secondary ? 1 : 0];
  services.webviewHost = entry => ({
    onFocusState: focused => {
      if (focused) registry.setActive(entry);
      if (entry.kind === 'sidebar') registry.setSideBarActive(focused);
    },
    onDismissOnboarding: async () => {
      await context.globalState.update(ONBOARDING_KEY, true);
      broadcastSettings();
    },
    extraHandlers: services.webviewHandlers,
  });

  const broadcastSettings = () => {
    const values = webviewSettingsFor(services);
    for (const entry of registry.all()) entry.conversation.post({ type: 'settings', settings: values });
  };

  context.subscriptions.push(
    ...disposables,
    registerSerializer(services),
    ...registerPanelCommands(services),
    ...registerStatusBar(registry),
    settings.onDidChange(change => {
      if (change.webviewChanged) broadcastSettings();
      if (!change.processChanged) return;
      for (const entry of registry.all()) {
        if (entry.conversation.proc) entry.conversation.postEvent({ kind: 'notice', text: 'ההגדרה תחול בשיחה הבאה.' });
      }
    }),
  );
}

module.exports = { register, supportsSecondarySidebar };
