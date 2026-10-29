/**
 * Fake `claude` CLI speaking stream-json + the control protocol, for development without a model server.
 * Prompt keywords: "bash" -> Bash permission card, "edit" -> Edit permission (native diff in Manual mode),
 * "ask" -> AskUserQuestion, "plan" -> ExitPlanMode, "mcp" -> calls the extension's getDiagnostics through
 * mcp_message, "slow" -> slow streaming (to test stop), "fail" -> crash. Anything else -> a streamed echo.
 */
const readline = require('readline');

const args = process.argv.slice(2);
const out = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const argAfter = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

if (args.includes('--version')) {
  console.log('2.1.300 (Claude Code)');
  process.exit(0);
}
if (args.includes('--help')) {
  console.log(`Usage: claude [options]
  -p, --print
  --model <model>
  --resume <id>
  --include-partial-messages
  --permission-prompt-tool <tool>
  --permission-mode <mode>  Permission mode (choices: "acceptEdits", "bypassPermissions", "default", "plan")`);
  process.exit(0);
}

const sessionId = argAfter('--resume') || `fake-${Date.now()}`;
let mode = argAfter('--permission-mode') || 'default';
let model = argAfter('--model') || 'fake-model';
let interrupted = false;
let counter = 0;
const waiting = new Map(); // our request id -> resolve

const CONTROL = {
  initialize: () => ({
    commands: [
      { name: 'compact', description: 'Summarize the conversation so far', argumentHint: '<instructions>' },
      { name: 'init', description: 'Create a CLAUDE.md file', argumentHint: '' },
      { name: 'review', description: 'Review a pull request', argumentHint: '' },
    ],
    models: [{ value: 'default', displayName: 'ברירת מחדל' }, { value: 'fake-large', displayName: 'Fake Large' }],
    current_permission_mode: mode,
  }),
  interrupt: () => { interrupted = true; return {}; },
  set_permission_mode: request => { mode = request.mode; return { mode }; },
  set_model: request => { model = request.model; return {}; },
  set_max_thinking_tokens: () => ({}),
};

/** Sends a control request to the extension and waits for its answer. */
function ask(subtype, payload) {
  const id = `fake-req-${++counter}`;
  out({ type: 'control_request', request_id: id, request: { subtype, ...payload } });
  return new Promise(resolve => waiting.set(id, resolve));
}

async function stream(text, delayMs) {
  for (const word of text.split(' ')) {
    if (interrupted) return;
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `${word} ` } }, session_id: sessionId });
    await sleep(delayMs);
  }
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] }, parent_tool_use_id: null, session_id: sessionId });
}

async function toolTurn(name, input, resultFor) {
  const id = `toolu_${++counter}`;
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] }, parent_tool_use_id: null, session_id: sessionId });
  const answer = await ask('can_use_tool', {
    tool_name: name, input, tool_use_id: id,
    permission_suggestions: [{ type: 'addRules', rules: [{ toolName: name }], behavior: 'allow', destination: 'localSettings' }],
  });
  const denied = answer.behavior !== 'allow';
  const text = denied ? answer.message : resultFor(answer.updatedInput || input);
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: denied }] }, parent_tool_use_id: null, session_id: sessionId });
}

async function turn(prompt) {
  interrupted = false;
  const started = Date.now();
  out({ type: 'system', subtype: 'init', session_id: sessionId, model, permissionMode: mode, slash_commands: ['compact', 'init', 'review'] });
  if (/\bfail\b/.test(prompt)) {
    process.stderr.write('Fake failure: API Error 500\n');
    process.exit(1);
  }
  out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: `The user wrote: ${prompt}` }] }, parent_tool_use_id: null, session_id: sessionId });
  if (/\bbash\b/.test(prompt)) await toolTurn('Bash', { command: 'npm test', description: 'Run tests' }, () => 'All 12 tests passed');
  if (/\bedit\b/.test(prompt)) {
    await toolTurn('Edit', { file_path: process.env.FAKE_EDIT_FILE || 'README.md', old_string: 'a', new_string: 'b' }, input => `Edited ${input.file_path}`);
  }
  if (/\bask\b/.test(prompt)) {
    await toolTurn('AskUserQuestion', { questions: [{ question: 'איזה צבע?', header: 'צבע', multiSelect: false, options: [{ label: 'כתום', description: 'צבע Claude' }, { label: 'כחול', description: 'קלאסי' }] }] },
      input => `answers: ${JSON.stringify(input.answers)}`);
  }
  if (/\bplan\b/.test(prompt)) await toolTurn('ExitPlanMode', { plan: '## התוכנית\n1. לקרוא קבצים\n2. לערוך את `app.js`' }, () => 'Plan approved');
  if (/\bmcp\b/.test(prompt)) {
    const answer = await ask('mcp_message', { server_name: 'claude-local', message: { jsonrpc: '2.0', id: ++counter, method: 'tools/call', params: { name: 'getDiagnostics', arguments: {} } } })
      .catch(error => ({ error: error.message }));
    out({ type: 'assistant', message: { content: [{ type: 'text', text: `mcp answer: ${JSON.stringify(answer).slice(0, 300)}` }] }, parent_tool_use_id: null, session_id: sessionId });
  }
  await stream(`**תשובה מזויפת** ל: ${prompt}. טקסט שמוזרם מילה אחרי מילה עם \`code\`.`, /\bslow\b/.test(prompt) ? 400 : 20);
  out({
    type: 'result', subtype: interrupted ? 'error_during_execution' : 'success', is_error: interrupted,
    duration_ms: Date.now() - started, num_turns: 1, usage: { input_tokens: 120, output_tokens: 48 }, session_id: sessionId,
  });
}

let queue = Promise.resolve();
readline.createInterface({ input: process.stdin })
  .on('line', handle)
  .on('close', () => queue.then(() => process.exit(0)));

function handle(line) {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.type === 'control_response') {
    const resolve = waiting.get(message.response.request_id);
    waiting.delete(message.response.request_id);
    if (resolve) resolve(message.response.subtype === 'error' ? { error: message.response.error } : message.response.response);
    return;
  }
  if (message.type === 'control_request') {
    const handler = CONTROL[message.request.subtype];
    if (!handler) {
      out({ type: 'control_response', response: { subtype: 'error', request_id: message.request_id, error: `Unsupported control request subtype: ${message.request.subtype}` } });
      return;
    }
    out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: handler(message.request) } });
    return;
  }
  if (message.type === 'user') {
    const content = message.message.content;
    const text = typeof content === 'string' ? content : content.map(block => block.text || '').join('');
    queue = queue.then(() => turn(text));
  }
}
