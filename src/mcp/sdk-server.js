/**
 * The in-process SDK MCP server `claude-local`: a JSON-RPC adapter for the CLI's `mcp_message` control requests.
 * The only place that knows that shape (not verified against the real CLI; see spec.md "IDE tools").
 * Plain Node (no `vscode`): the tools are passed in.
 */

const SERVER_NAME = 'claude-local';
const PROTOCOL_VERSION = '2024-11-05';

/**
 * @typedef {{name:string, description:string, inputSchema:object, run:(args:object)=>Promise<any>}} Tool
 */

/**
 * Answers one JSON-RPC message for the server.
 * @param {object} message JSON-RPC request or notification
 * @param {Tool[]} tools
 * @param {string} version extension version (serverInfo)
 * @returns {Promise<object>} the JSON-RPC response (notifications get an empty result)
 * @example await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, tools, '0.1.0')
 */
async function handleJsonRpc(message, tools, version) {
  const id = message.id ?? 0;
  const reply = result => ({ jsonrpc: '2.0', id, result });
  const fail = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion: message.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version },
      });
    case 'notifications/initialized':
      return reply({});
    case 'tools/list':
      return reply({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = tools.find(item => item.name === message.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${message.params?.name}`);
      try {
        const result = await tool.run(message.params.arguments || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        return reply({ content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true });
      }
    }
    default:
      if (message.id === undefined) return reply({}); // other notifications need no answer
      return fail(-32601, `Method not found: ${message.method}`);
  }
}

/**
 * The `mcp_message` control-request handler and the `initialize` payload that declares the server.
 * @param {()=>Tool[]} getTools
 * @param {string} version
 * @returns {{initializePayload:()=>object, handleControlRequest:(conversation:object, request:object)=>Promise<object>}}
 */
function createSdkServer(getTools, version) {
  return {
    initializePayload: () => ({ sdkMcpServers: [SERVER_NAME] }),
    async handleControlRequest(conversation, request) {
      if (request.server_name !== SERVER_NAME) throw new Error(`Unknown SDK MCP server: ${request.server_name}`);
      return { mcp_response: await handleJsonRpc(request.message || {}, getTools(), version) };
    },
  };
}

module.exports = { handleJsonRpc, createSdkServer, SERVER_NAME };
