/** ClaudeProcess against dev/fake-claude.js over a real pipe: control requests both ways, streaming, permission, exit. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const { ClaudeProcess } = require('../src/cli/process');
const { describeFailure } = require('../src/cli/failures');

const FAKE = path.join(__dirname, '..', 'dev', 'fake-claude.js');
const silent = { debug() {}, info() {}, warn() {}, error() {} };

function startFake() {
  const proc = new ClaudeProcess({ logger: silent, spawnFn: () => spawn(process.execPath, [FAKE, '-p', '--permission-mode', 'default']) });
  proc.start();
  return proc;
}

/** Resolves with the first event the predicate accepts. */
const waitFor = (proc, eventName, predicate = () => true) => new Promise(resolve => {
  const listener = (...values) => {
    if (!predicate(...values)) return;
    proc.off(eventName, listener);
    resolve(values);
  };
  proc.on(eventName, listener);
});

test('initialize answers with the catalog', async () => {
  const proc = startFake();
  const response = await proc.request('initialize', {}, 5000);
  assert.ok(Array.isArray(response.commands));
  assert.ok(response.models.some(model => model.value === 'fake-large'));
  proc.kill();
  await waitFor(proc, 'exit');
});

test('an unknown control request is rejected with the CLI error', async () => {
  const proc = startFake();
  await assert.rejects(proc.request('no_such_request', {}, 5000), /Unsupported control request subtype/);
  proc.kill();
  await waitFor(proc, 'exit');
});

test('a turn streams deltas, asks can_use_tool, and ends with a result', async () => {
  const proc = startFake();
  const deltas = [];
  proc.on('message', event => { if (event.type === 'stream_event') deltas.push(event); });
  const permission = waitFor(proc, 'controlRequest', (id, request) => request.subtype === 'can_use_tool');
  proc.sendUser('run bash please');
  const [requestId, request] = await permission;
  assert.equal(request.tool_name, 'Bash');
  assert.equal(request.input.command, 'npm test');
  const toolResult = waitFor(proc, 'message', event => event.type === 'user');
  proc.respond(requestId, { behavior: 'allow', updatedInput: request.input });
  const [resultEvent] = await toolResult;
  assert.equal(resultEvent.message.content[0].content, 'All 12 tests passed');
  const [result] = await waitFor(proc, 'message', event => event.type === 'result');
  assert.equal(result.subtype, 'success');
  assert.ok(deltas.length > 0);
  proc.kill();
  await waitFor(proc, 'exit');
});

test('interrupt stops a slow turn', async () => {
  const proc = startFake();
  proc.sendUser('slow answer');
  await waitFor(proc, 'message', event => event.type === 'stream_event');
  await proc.interrupt();
  const [result] = await waitFor(proc, 'message', event => event.type === 'result');
  assert.equal(result.subtype, 'error_during_execution');
  proc.kill();
  await waitFor(proc, 'exit');
});

test('a crash reports the exit code and stderr', async () => {
  const proc = startFake();
  proc.sendUser('please fail');
  const [info] = await waitFor(proc, 'exit');
  assert.equal(info.code, 1);
  assert.match(info.stderr, /Fake failure/);
  assert.match(describeFailure(info), /Claude נסגר עם קוד 1/);
});

test('a spawn failure is reported through exit, not thrown', async () => {
  const proc = new ClaudeProcess({ logger: silent, spawnFn: () => spawn(path.join(__dirname, 'no-such-binary-xyz')) });
  proc.start();
  const [info] = await waitFor(proc, 'exit');
  assert.ok(info.spawnError);
  assert.match(describeFailure(info), /לא ניתן להפעיל את Claude/);
  assert.equal(proc.send({ type: 'user' }), false);
});
