/**
 * Entry point: builds the shared services and calls each feature's `register(context, services)`.
 */
const vscode = require('vscode');
const { createLogger } = require('./src/util/logger');
const { PanelRegistry } = require('./src/panels/panel-registry');
const panels = require('./src/panels');
const editorContext = require('./src/context');
const mcp = require('./src/mcp');
const placeholders = require('./src/placeholders');

/** @type {{logger:ReturnType<typeof createLogger>, registry:PanelRegistry}|null} */
let services = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const logger = createLogger();
  const registry = new PanelRegistry();
  const events = new vscode.EventEmitter(); // session metadata changes (rename, unread) for the sessions list
  services = {
    context, logger, registry, events,
    hooks: { beforePermission: [], controlHandlers: new Map(), sendContext: [], initializePayload: [] },
    webviewHandlers: new Map(), // webview message type -> (conversation, message) => void
  };
  context.subscriptions.push(events);
  logger.info(`activate: VS Code ${vscode.version}, extension ${context.extension.packageJSON.version}`);
  panels.register(context, services);
  editorContext.register(context, services);
  mcp.register(context, services);
  placeholders.register(context, services);
}

function deactivate() {
  if (!services) return;
  services.registry.dispose(); // kills every conversation's process
  services.logger.dispose();
  services = null;
}

module.exports = { activate, deactivate };
