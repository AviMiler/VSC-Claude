// Tests for the pure parts of src/panels: the event translator and permission responses.
const test = require('node:test');
const assert = require('node:assert');
const { EventTranslator, toolResultText } = require('../src/panels/event-translator');
const { permissionResponse, interruptedResponse } = require('../src/panels/permissions');

test('streamed text becomes text ops; the complete assistant message only adds tool input', () => {
  const t = new EventTranslator();
  const ops = [];
  const feed = (m) => ops.push(...t.translate(m).ops);
  feed({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } });
  feed({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } });
  feed({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'שלום ' } } });
  feed({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'עולם' } } });
  feed({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'Write', input: {} } } });
  feed({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{' } } });
  feed({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'שלום עולם' }, { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'a.txt' } }] } });
  assert.deepStrictEqual(ops, [
    { op: 'text', id: 'm1:0', append: 'שלום ' },
    { op: 'text', id: 'm1:0', append: 'עולם' },
    { op: 'tool', id: 't1', name: 'Write' },
    { op: 'tool', id: 't1', name: 'Write', input: { file_path: 'a.txt' } },
  ]);
});

test('without partial messages the assistant message carries the text', () => {
  const t = new EventTranslator();
  const out = t.translate({ type: 'assistant', message: { id: 'm2', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'hi' }] } });
  assert.deepStrictEqual(out.ops, [
    { op: 'thinking', id: 'm2:a0', set: 'hmm' },
    { op: 'text', id: 'm2:a1', set: 'hi' },
  ]);
});

test('tool results, results, init, status and local command output', () => {
  const t = new EventTranslator();
  assert.deepStrictEqual(t.translate({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }], is_error: false }] } }).ops,
    [{ op: 'toolResult', id: 't1', content: 'ok', isError: false }]);
  const r = t.translate({ type: 'result', is_error: false, duration_ms: 1500, total_cost_usd: 0.1, usage: { input_tokens: 2, cache_read_input_tokens: 10, output_tokens: 5 } });
  assert.strictEqual(r.turnEnded, true);
  assert.strictEqual(r.ops[0].inputTokens, 12);
  assert.strictEqual(r.ops[0].outputTokens, 5);
  const init = t.translate({ type: 'system', subtype: 'init', session_id: 's1', model: 'x', permissionMode: 'default', slash_commands: ['clear'] });
  assert.strictEqual(init.session.sessionId, 's1');
  assert.strictEqual(t.translate({ type: 'system', subtype: 'status', status: 'requesting' }).status, 'requesting');
  assert.deepStrictEqual(t.translate({ type: 'user', isReplay: true, message: { content: '<local-command-stdout>Set model to haiku</local-command-stdout>' } }).ops,
    [{ op: 'notice', text: 'Set model to haiku', level: 'info' }]);
  assert.strictEqual(toolResultText([{ type: 'image' }]), '[תמונה]');
});

test('permission responses', () => {
  const req = { tool_name: 'Write', input: { file_path: 'a' }, permission_suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }] };
  assert.deepStrictEqual(permissionResponse(req, { behavior: 'allow' }), { behavior: 'allow', updatedInput: { file_path: 'a' } });
  assert.deepStrictEqual(permissionResponse(req, { behavior: 'allow', scope: 'always' }).updatedPermissions, req.permission_suggestions);
  assert.deepStrictEqual(permissionResponse(req, { behavior: 'deny', message: 'לא עכשיו' }), { behavior: 'deny', message: 'המשתמש דחה את הבקשה: לא עכשיו' });
  const ask = { tool_name: 'AskUserQuestion', input: { questions: [] } };
  assert.deepStrictEqual(permissionResponse(ask, { behavior: 'allow', answers: { 'q?': 'A' } }).updatedInput, { questions: [], answers: { 'q?': 'A' } });
  assert.match(permissionResponse({ tool_name: 'ExitPlanMode', input: {} }, { behavior: 'deny' }).message, /להמשיך לתכנן/);
  assert.strictEqual(interruptedResponse().message, 'Interrupted by the user');
});
