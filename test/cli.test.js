// Tests for src/cli: args, capabilities parsing, command building and the process against dev/fake-claude.js.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { buildArgs, buildEnv, cliModeName } = require('../src/cli/args');
const { parseHelp, parseVersion, getCapabilities } = require('../src/cli/capabilities');
const { buildCommand, quoteForCmd } = require('../src/cli/spawn');
const { ClaudeProcess } = require('../src/cli/process');

// Excerpt of `claude --help` from CLI 2.1.312.
const HELP = `
  --include-partial-messages            Include partial message chunks as they
  --allow-dangerously-skip-permissions  Enable bypassing all permission checks
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
  --permission-prompts <target>         Who answers permission prompts with
  -r, --resume [value]                  Resume a conversation by session ID or
`;

const FAKE = path.join(__dirname, '..', 'dev', 'fake-claude.js');
const silent = { debug() {}, info() {}, warn() {}, error() {} };

test('parseHelp reads flags and permission modes', () => {
  const caps = parseHelp(HELP);
  assert.ok(caps.flags.includes('--include-partial-messages'));
  assert.ok(caps.flags.includes('--resume'));
  assert.deepStrictEqual(caps.permissionModes, ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan']);
});

test('parseVersion', () => {
  assert.strictEqual(parseVersion('2.1.312 (Claude Code)\n'), '2.1.312');
  assert.strictEqual(parseVersion('nothing'), '');
});

test('cliModeName maps default to manual only when the CLI lists manual and not default', () => {
  assert.strictEqual(cliModeName('default', { version: '', flags: [], permissionModes: ['manual', 'plan'] }), 'manual');
  assert.strictEqual(cliModeName('default', { version: '', flags: [], permissionModes: ['default', 'plan'] }), 'default');
  assert.strictEqual(cliModeName('default', { version: '', flags: [], permissionModes: [] }), 'default');
  assert.strictEqual(cliModeName('plan', { version: '', flags: [], permissionModes: ['manual', 'plan'] }), 'plan');
});

test('buildArgs', () => {
  const caps = { version: '2.1.312', ...parseHelp(HELP) };
  const args = buildArgs({ caps, mode: 'default', model: 'opus', resume: 'abc', allowDangerouslySkipPermissions: true });
  assert.deepStrictEqual(args, [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--permission-prompt-tool', 'stdio', '--permission-mode', 'manual',
    '--include-partial-messages', '--allow-dangerously-skip-permissions',
    '--model', 'opus', '--resume', 'abc',
  ]);
  const bare = buildArgs({ caps: { version: '', flags: [], permissionModes: [] }, mode: 'plan' });
  assert.ok(!bare.includes('--include-partial-messages'));
  assert.ok(!bare.includes('--model'));
  assert.ok(!bare.includes('--resume'));
});

test('buildEnv adds the variables and the entrypoint', () => {
  const env = buildEnv({ A: '1' }, [{ name: 'ANTHROPIC_BASE_URL', value: 'http://127.0.0.1:11434' }]);
  assert.strictEqual(env.A, '1');
  assert.strictEqual(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:11434');
  assert.strictEqual(env.CLAUDE_CODE_ENTRYPOINT, 'claude-local-vscode');
});

test('buildCommand runs .cmd through cmd.exe and puts the wrapper first', () => {
  const win = buildCommand({ cliPath: 'C:\\tools\\claude.cmd', args: ['-p', '--model', 'my model'], env: { ComSpec: 'C:\\Windows\\cmd.exe' }, platform: 'win32' });
  assert.strictEqual(win.command, 'C:\\Windows\\cmd.exe');
  assert.deepStrictEqual(win.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.strictEqual(win.args[3], '"C:\\tools\\claude.cmd -p --model "my model""');
  assert.strictEqual(win.windowsVerbatimArguments, true);
  const wrapped = buildCommand({ cliPath: '/opt/claude', args: ['-p'], wrapper: '/usr/bin/env', env: {}, platform: 'linux' });
  assert.deepStrictEqual(wrapped, { command: '/usr/bin/env', args: ['/opt/claude', '-p'], windowsVerbatimArguments: false });
  assert.strictEqual(quoteForCmd('a&b'), '"a^&b"');
});

test('getCapabilities reads the fake CLI', async () => {
  const caps = await getCapabilities({ cliPath: FAKE, wrapper: process.execPath, env: process.env });
  assert.strictEqual(caps.version, '2.1.312');
  assert.ok(caps.permissionModes.includes('manual'));
});

test('ClaudeProcess: initialize, a turn with a permission, set_model, unknown request, stop', async () => {
  const caps = await getCapabilities({ cliPath: FAKE, wrapper: process.execPath, env: process.env });
  const proc = new ClaudeProcess({ cliPath: FAKE, wrapper: process.execPath, args: buildArgs({ caps, mode: 'default' }), cwd: __dirname, env: process.env, log: silent });
  const init = await proc.request({ subtype: 'initialize', hooks: null }, 10000);
  assert.ok(Array.isArray(init.models) && init.models.length > 0);

  const messages = [];
  proc.on('message', (m) => messages.push(m));
  proc.on('controlRequest', (id, req) => {
    assert.strictEqual(req.subtype, 'can_use_tool');
    assert.strictEqual(req.tool_name, 'Write');
    proc.respond(id, { behavior: 'allow', updatedInput: req.input });
  });
  const done = new Promise((resolve) => proc.on('message', (m) => m.type === 'result' && resolve(m)));
  proc.sendUser([{ type: 'text', text: 'please write a file' }]);
  const result = await done;
  assert.strictEqual(result.is_error, false);
  const toolResult = messages.find((m) => m.type === 'user');
  assert.ok(toolResult && !toolResult.message.content[0].is_error);

  assert.deepStrictEqual(await proc.request({ subtype: 'set_model', model: 'fake-small' }), { model: 'fake-small' });
  await assert.rejects(proc.request({ subtype: 'bogus' }), /Unsupported/);

  const exited = new Promise((resolve) => proc.on('exit', resolve));
  proc.stop();
  const info = await exited;
  assert.strictEqual(info.code, 0);
});

test('ClaudeProcess reports a spawn failure', async () => {
  const proc = new ClaudeProcess({ cliPath: path.join(__dirname, 'does-not-exist'), args: [], cwd: __dirname, env: process.env, log: silent });
  const info = await new Promise((resolve) => proc.on('exit', resolve));
  assert.ok(info.spawnError);
});
