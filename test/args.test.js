/** Unit tests: CLI arguments, capability parsing, mode mapping and Windows command building. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArgs } = require('../src/cli/args');
const { parseHelp, cliPermissionMode } = require('../src/cli/capabilities');
const { buildEnv, quoteForCmd, buildCommand } = require('../src/cli/spawn');

const HELP = `--model <model>
  --include-partial-messages
  --permission-mode <mode>  Permission mode (choices: "acceptEdits", "bypassPermissions", "manual", "plan")`;

test('parseHelp reads flags, permission modes and the version', () => {
  const caps = parseHelp(HELP, '2.1.300 (Claude Code)');
  assert.equal(caps.version, '2.1.300');
  assert.ok(caps.flags.includes('--include-partial-messages'));
  assert.deepEqual(caps.permissionModes, ['acceptEdits', 'bypassPermissions', 'manual', 'plan']);
});

test('parseHelp falls back to the known modes without a choices list', () => {
  assert.deepEqual(parseHelp('', '').permissionModes, ['default', 'acceptEdits', 'plan', 'bypassPermissions']);
});

test('cliPermissionMode maps default <-> manual', () => {
  assert.equal(cliPermissionMode('default', ['manual', 'plan']), 'manual');
  assert.equal(cliPermissionMode('manual', ['default', 'plan']), 'default');
  assert.equal(cliPermissionMode('plan', ['default', 'plan']), 'plan');
});

test('buildArgs: base flags, partial messages only when supported, model and resume', () => {
  const caps = parseHelp(HELP, '');
  const args = buildArgs({ permissionMode: 'default', model: 'm1', resume: 'abc' }, caps);
  assert.deepEqual(args.slice(0, 6), ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']);
  assert.ok(args.includes('--include-partial-messages'));
  assert.deepEqual(args.slice(args.indexOf('--permission-prompt-tool'), args.indexOf('--permission-prompt-tool') + 2), ['--permission-prompt-tool', 'stdio']);
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'manual');
  assert.equal(args[args.indexOf('--model') + 1], 'm1');
  assert.equal(args[args.indexOf('--resume') + 1], 'abc');

  const bare = buildArgs({ permissionMode: 'plan' }, { flags: [], permissionModes: ['plan'] });
  assert.ok(!bare.includes('--include-partial-messages'));
  assert.ok(!bare.includes('--model'));
  assert.ok(!bare.includes('--resume'));
});

test('buildEnv adds the settings variables and the entrypoint', () => {
  const env = buildEnv({ A: '1' }, [{ name: 'ANTHROPIC_BASE_URL', value: 'http://localhost:11434' }, { name: '', value: 'x' }]);
  assert.equal(env.A, '1');
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://localhost:11434');
  assert.equal(env.CLAUDE_CODE_ENTRYPOINT, 'claude-local-vscode');
  assert.ok(!('' in env));
});

test('quoteForCmd quotes spaces and quotes, refuses %', () => {
  assert.equal(quoteForCmd('--verbose'), '--verbose');
  assert.equal(quoteForCmd('a b'), '"a b"');
  assert.equal(quoteForCmd('say "hi"'), '"say ""hi"""');
  assert.throws(() => quoteForCmd('%PATH%'));
});

test('buildCommand puts the wrapper first', () => {
  const spec = buildCommand({ claudePath: '/opt/claude', wrapper: '/opt/wrap', args: ['--version'], env: { PATH: '' } });
  if (process.platform !== 'win32') {
    assert.equal(spec.command, '/opt/wrap');
    assert.deepEqual(spec.args, ['/opt/claude', '--version']);
  } else {
    assert.ok(spec.args.join(' ').includes('--version'));
  }
});

test('buildCommand runs a .cmd through cmd.exe on Windows', { skip: process.platform !== 'win32' }, () => {
  const spec = buildCommand({ claudePath: 'C:\\tools\\claude.cmd', args: ['-p', 'a b'], env: { ComSpec: 'cmd.exe' } });
  assert.equal(spec.command, 'cmd.exe');
  assert.deepEqual(spec.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(spec.args[3], '"C:\\tools\\claude.cmd -p "a b""');
  assert.equal(spec.windowsVerbatimArguments, true);
});
