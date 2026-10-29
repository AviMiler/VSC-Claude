/** Unit tests: the in-process SDK MCP server's JSON-RPC adapter (mcp_message). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleJsonRpc, createSdkServer } = require('../src/mcp/sdk-server');

const tools = [
  { name: 'echo', description: 'Echo', inputSchema: { type: 'object' }, run: async args => ({ got: args.value }) },
  { name: 'boom', description: 'Fails', inputSchema: { type: 'object' }, run: async () => { throw new Error('bad'); } },
];

test('initialize returns the server info and tools capability', async () => {
  const response = await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, tools, '0.1.0');
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.equal(response.result.serverInfo.name, 'claude-local');
  assert.deepEqual(response.result.capabilities, { tools: {} });
});

test('tools/list hides the run functions', async () => {
  const response = await handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, tools, '0.1.0');
  assert.deepEqual(response.result.tools.map(tool => tool.name), ['echo', 'boom']);
  assert.equal(response.result.tools[0].run, undefined);
});

test('tools/call returns text content; a throwing tool returns isError', async () => {
  const ok = await handleJsonRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { value: 7 } } }, tools, '0');
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { got: 7 });
  const bad = await handleJsonRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'boom' } }, tools, '0');
  assert.equal(bad.result.isError, true);
  const unknown = await handleJsonRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } }, tools, '0');
  assert.equal(unknown.error.code, -32602);
});

test('notifications get an empty result; unknown requests a -32601 error', async () => {
  assert.deepEqual((await handleJsonRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools, '0')).result, {});
  assert.equal((await handleJsonRpc({ jsonrpc: '2.0', id: 6, method: 'resources/list' }, tools, '0')).error.code, -32601);
});

test('the control handler wraps the answer in mcp_response and checks the server name', async () => {
  const server = createSdkServer(() => tools, '0.1.0');
  assert.deepEqual(server.initializePayload(), { sdkMcpServers: ['claude-local'] });
  const answer = await server.handleControlRequest(null, { subtype: 'mcp_message', server_name: 'claude-local', message: { jsonrpc: '2.0', id: 9, method: 'tools/list' } });
  assert.equal(answer.mcp_response.id, 9);
  await assert.rejects(server.handleControlRequest(null, { server_name: 'other', message: {} }), /Unknown SDK MCP server/);
});
