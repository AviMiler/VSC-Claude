/**
 * The IDE tools feature: the in-process SDK MCP server `claude-local` declared to every panel process.
 */
const { createSdkServer } = require('./sdk-server');
const { panelTools } = require('./tools');

/**
 * @param {import('vscode').ExtensionContext} context
 * @param {object} services shared services (extension.js)
 */
function register(context, services) {
  const server = createSdkServer(panelTools, context.extension.packageJSON.version);
  services.hooks.initializePayload.push(server.initializePayload);
  services.hooks.controlHandlers.set('mcp_message', server.handleControlRequest);
}

module.exports = { register };
