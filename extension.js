// Extension entry: activate() wires each feature's register(); deactivate() disposes them.
const vscode = require('vscode');
const { createLogger } = require('./src/util/logger');
const { SECTION } = require('./src/util/settings');
const { PanelRegistry } = require('./src/panels/panel-registry');
const { registerSidebar } = require('./src/panels/sidebar-view');
const { registerSerializer } = require('./src/panels/serializer');
const { registerStatusBar } = require('./src/panels/status-bar');
const { registerCommands } = require('./src/panels/commands');

const PROCESS_SETTINGS = ['claudePath', 'environmentVariables', 'claudeProcessWrapper'];

/** @type {PanelRegistry|undefined} */
let registry;

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const log = createLogger();
  context.subscriptions.push(log);
  log.info(`Claude Code Local ${context.extension.packageJSON.version} הופעל (VS Code ${vscode.version})`);

  registry = new PanelRegistry(context, log);
  const sidebar = registerSidebar(registry, context);
  registry.sidebar = sidebar;
  registerStatusBar(context, registry);
  registerSerializer(context, registry);
  registerCommands(context, { registry, sidebar, log });

  vscode.commands.executeCommand('setContext', 'claude-local.lastClosedWasSession', false);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(SECTION) || !registry) return;
      const processChanged = PROCESS_SETTINGS.some((key) => e.affectsConfiguration(`${SECTION}.${key}`));
      registry.settingsChanged(processChanged);
    }),
  );
}

function deactivate() {
  if (registry) registry.dispose();
  registry = undefined;
}

module.exports = { activate, deactivate };
