#!/usr/bin/env node
// Fake CLI: a stand-in for `claude` that speaks stream-json and the control protocol, for trying the extension without a model.
// Select it with "claudeLocal.claudePath": "<repo>/dev/fake-claude.cmd" (Windows) or "<repo>/dev/fake-claude.js".
// A message containing "write" or "כתוב" asks for a Write permission; "ask" or "שאל" sends an AskUserQuestion.
const readline = require('readline');
const crypto = require('crypto');

const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  process.stdout.write('2.1.312 (Fake Claude Code)\n');
  process.exit(0);
}
if (argv.includes('--help')) {
  process.stdout.write([
    'Usage: claude [options] [prompt]',
    '  -p, --print',
    '  --input-format <format>',
    '  --output-format <format>',
    '  --verbose',
    '  --include-partial-messages',
    '  --permission-prompt-tool <tool>',
    '  --allow-dangerously-skip-permissions',
    '  --permission-mode <mode>   Permission mode to use for the session',
    '                             (choices: "acceptEdits", "auto",',
    '                             "bypassPermissions", "manual",',
    '                             "dontAsk", "plan")',
    '  --model <model>',
    '  -r, --resume [value]',
    '',
  ].join('\n'));
  process.exit(0);
}

const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const sessionId = flag('--resume') || crypto.randomUUID();
let model = flag('--model') || 'fake-model';
let mode = flag('--permission-mode') || 'default';
if (mode === 'manual') mode = 'default';
const partial = argv.includes('--include-partial-messages');

const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** @type {Map<string, (response: any) => void>} */
const waiting = new Map();
let interrupted = false;
let initSent = false;
const queue = [];
let busy = false;

function controlSuccess(requestId, response) {
  out({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
}

function askHost(request) {
  const requestId = crypto.randomUUID();
  out({ type: 'control_request', request_id: requestId, request });
  return new Promise((resolve) => waiting.set(requestId, resolve));
}

async function streamText(messageId, text) {
  if (partial) {
    out({ type: 'stream_event', event: { type: 'message_start', message: { id: messageId, role: 'assistant', content: [] } }, session_id: sessionId });
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, session_id: sessionId });
    for (const word of text.split(/(\s+)/)) {
      if (interrupted) return false;
      out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: word } }, session_id: sessionId });
      await sleep(40);
    }
    out({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, session_id: sessionId });
  }
  out({ type: 'assistant', message: { id: messageId, role: 'assistant', model, content: [{ type: 'text', text }] }, session_id: sessionId });
  return true;
}

async function turn(text) {
  interrupted = false;
  const started = Date.now();
  if (!initSent) {
    initSent = true;
    out({ type: 'system', subtype: 'init', session_id: sessionId, model, permissionMode: mode, cwd: process.cwd(), tools: ['Write', 'AskUserQuestion'], slash_commands: ['compact', 'clear'] });
  }
  out({ type: 'system', subtype: 'status', status: 'requesting', session_id: sessionId });
  let ok = true;
  if (/write|כתוב/i.test(text)) {
    const toolId = `toolu_${crypto.randomUUID()}`;
    const input = { file_path: `${process.cwd()}/fake-claude-output.txt`, content: 'שלום מ-Claude המדומה\n' };
    out({ type: 'assistant', message: { id: `msg_${crypto.randomUUID()}`, role: 'assistant', model, content: [{ type: 'tool_use', id: toolId, name: 'Write', input }] }, session_id: sessionId });
    let answer = { behavior: 'allow' };
    if (mode === 'default') {
      answer = await askHost({ subtype: 'can_use_tool', tool_name: 'Write', display_name: 'Write', input, description: 'fake-claude-output.txt', permission_suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }], tool_use_id: toolId });
    }
    const allowed = answer.behavior === 'allow';
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: allowed ? 'הקובץ נכתב (מדומה, לא נכתב באמת).' : `נדחה: ${answer.message || ''}`, is_error: !allowed }] }, session_id: sessionId });
    ok = await streamText(`msg_${crypto.randomUUID()}`, allowed ? 'כתבתי את הקובץ.' : 'בסדר, לא כתבתי את הקובץ.');
  } else if (/ask|שאל/i.test(text)) {
    const toolId = `toolu_${crypto.randomUUID()}`;
    const input = { questions: [{ question: 'באיזו שפה לכתוב?', header: 'שפה', multiSelect: false, options: [{ label: 'JavaScript', description: 'CommonJS' }, { label: 'Python', description: '' }] }] };
    out({ type: 'assistant', message: { id: `msg_${crypto.randomUUID()}`, role: 'assistant', model, content: [{ type: 'tool_use', id: toolId, name: 'AskUserQuestion', input }] }, session_id: sessionId });
    const answer = await askHost({ subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input, tool_use_id: toolId });
    const picked = answer.behavior === 'allow' && answer.updatedInput && answer.updatedInput.answers ? JSON.stringify(answer.updatedInput.answers) : 'לא נבחר';
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: picked }] }, session_id: sessionId });
    ok = await streamText(`msg_${crypto.randomUUID()}`, `בחרת: ${picked}`);
  } else {
    ok = await streamText(`msg_${crypto.randomUUID()}`, `**שלום!** אני Claude מדומה (מודל \`${model}\`, מצב \`${mode}\`). קיבלתי:\n\n> ${text}\n\n\`\`\`js\nconsole.log('שלום');\n\`\`\``);
  }
  out({
    type: 'result',
    subtype: ok ? 'success' : 'error_during_execution',
    is_error: !ok,
    result: ok ? '' : 'Interrupted by the user',
    duration_ms: Date.now() - started,
    session_id: sessionId,
    total_cost_usd: 0,
    usage: { input_tokens: 12, output_tokens: 34, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  });
}

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) await turn(queue.shift());
  busy = false;
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'control_response') {
    const resolve = waiting.get(msg.response.request_id);
    waiting.delete(msg.response.request_id);
    if (resolve) resolve(msg.response.response || {});
    return;
  }
  if (msg.type === 'control_request') {
    const req = msg.request || {};
    switch (req.subtype) {
      case 'initialize':
        return controlSuccess(msg.request_id, {
          commands: [{ name: 'compact', description: 'דחיסת ההקשר', argumentHint: '' }, { name: 'clear', description: 'ניקוי השיחה', argumentHint: '' }],
          models: [{ value: 'default', displayName: 'ברירת מחדל', description: 'המודל המדומה' }, { value: 'fake-small', displayName: 'Fake Small', description: '' }],
          claude_code_version: '2.1.312',
          current_permission_mode: mode,
        });
      case 'interrupt':
        interrupted = true;
        for (const [id, resolve] of waiting) {
          waiting.delete(id);
          resolve({ behavior: 'deny', message: 'Interrupted by the user' });
        }
        return controlSuccess(msg.request_id, {});
      case 'set_permission_mode':
        mode = req.mode;
        return controlSuccess(msg.request_id, { mode });
      case 'set_model':
        model = req.model;
        return controlSuccess(msg.request_id, { model });
      case 'set_max_thinking_tokens':
        return controlSuccess(msg.request_id, undefined);
      default:
        return out({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: `Unsupported control request subtype: ${req.subtype}` } });
    }
  }
  if (msg.type === 'user') {
    const content = msg.message && msg.message.content;
    const text = Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : String(content || '');
    queue.push(text);
    drain();
  }
}).on('close', () => process.exit(0));
