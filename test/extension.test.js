// Host smoke test: activates the extension against the VS Code stub and runs a conversation with dev/fake-claude.js.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { createStub, installStub } = require('./vscode-stub');

const FAKE = path.join(__dirname, '..', 'dev', 'fake-claude.js');

/**
 * @param {() => boolean} check
 * @param {number} [ms]
 */
async function waitFor(check, ms = 8000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('activate registers every declared command, views, serializer and context keys', () => {
  const stub = createStub({ claudePath: FAKE, claudeProcessWrapper: process.execPath });
  const restore = installStub(stub.vscode);
  try {
    const ext = require('../extension');
    ext.activate(stub.context);
    const declared = require('../package.json').contributes.commands.map((c) => c.command);
    for (const id of declared) assert.ok(stub.commands.has(id), `command ${id} not registered`);
    assert.ok(stub.viewProviders.has('claudeLocalSidebar'));
    assert.ok(stub.viewProviders.has('claudeLocalSidebarSecondary'));
    assert.ok(stub.serializers.has('claudeLocalPanel'));
    assert.strictEqual(stub.contextKeys['claude-local:doesNotSupportSecondarySidebar'], false);
    assert.strictEqual(stub.statusItems[0].text, '✻ Claude');
    ext.deactivate();
  } finally {
    restore();
  }
});

test('a tab conversation: send, permission card, allow, result, rename-free title, close + reopen', async () => {
  const stub = createStub({ claudePath: FAKE, claudeProcessWrapper: process.execPath, lockEditorGroups: true });
  const restore = installStub(stub.vscode);
  const ext = require('../extension');
  try {
    ext.activate(stub.context);
    await stub.vscode.commands.executeCommand('claude-local.editor.open');
    assert.strictEqual(stub.panels.length, 1);
    const panel = stub.panels[0];
    assert.strictEqual(panel.viewType, 'claudeLocalPanel');
    assert.ok(panel.options.retainContextWhenHidden);
    assert.match(panel.webview.html, /dir="rtl" lang="he"/);
    assert.match(panel.webview.html, /script-src 'nonce-[0-9a-f]+'/);
    assert.ok(stub.executed.some(([id]) => id === 'workbench.action.lockEditorGroup'));

    const posted = panel.webview.posted;
    panel.webview.receive({ type: 'ready' });
    const init = posted.find((m) => m.type === 'init');
    assert.ok(init);
    assert.deepStrictEqual(init.modes, ['default', 'acceptEdits', 'plan']);

    panel.webview.receive({ type: 'send', text: 'please write a file for me', attachments: [] });
    assert.strictEqual(panel.title, 'please write a file for me');
    await waitFor(() => posted.some((m) => m.type === 'permission'));
    const permission = posted.find((m) => m.type === 'permission');
    assert.strictEqual(permission.tool, 'Write');
    assert.strictEqual(permission.canAlways, true);
    assert.match(String(panel.iconPath.fsPath), /claude-logo-pending\.svg$/);
    assert.strictEqual(stub.statusItems[0].text, '✻ Claude · ממתין לאישור');

    panel.webview.receive({ type: 'permissionAnswer', requestId: permission.requestId, behavior: 'allow' });
    await waitFor(() => posted.some((m) => m.type === 'event' && m.ops.some((o) => o.op === 'result')));
    const ops = posted.filter((m) => m.type === 'event').flatMap((m) => m.ops);
    assert.ok(ops.some((o) => o.op === 'toolResult' && !o.isError));
    assert.ok(ops.some((o) => o.op === 'text'));
    assert.ok(posted.some((m) => m.type === 'permissionResolved'));
    assert.ok(posted.some((m) => m.type === 'update' && Array.isArray(m.models) && m.models.length === 2));
    const session = posted.filter((m) => m.type === 'session').pop();
    assert.ok(session.sessionId);
    assert.strictEqual(stub.statusItems[0].text, '✻ Claude');

    panel.webview.receive({ type: 'setMode', value: 'plan' });
    assert.strictEqual(posted.filter((m) => m.type === 'session').pop().mode, 'plan');

    panel.dispose();
    assert.strictEqual(stub.contextKeys['claude-local.lastClosedWasSession'], true);
    await stub.vscode.commands.executeCommand('claude-local.reopenClosedSession');
    assert.strictEqual(stub.panels.length, 2);
    stub.panels[1].webview.receive({ type: 'ready' });
    const reInit = stub.panels[1].webview.posted.find((m) => m.type === 'init');
    assert.strictEqual(reInit.session.sessionId, session.sessionId);
    assert.strictEqual(reInit.session.restored, true);
    stub.panels[1].dispose();
  } finally {
    ext.deactivate();
    restore();
  }
});

test('the sidebar view keeps its conversation when the view is recreated', async () => {
  const stub = createStub({ claudePath: FAKE, claudeProcessWrapper: process.execPath });
  const restore = installStub(stub.vscode);
  const ext = require('../extension');
  try {
    ext.activate(stub.context);
    const provider = stub.viewProviders.get('claudeLocalSidebarSecondary');
    const makeView = () => {
      const webview = stub.makeWebview();
      return { webview, visible: true, show() {}, onDidChangeVisibility: () => ({ dispose() {} }), onDidDispose: () => ({ dispose() {} }) };
    };
    const first = makeView();
    provider.resolveWebviewView(first);
    first.webview.receive({ type: 'ready' });
    first.webview.receive({ type: 'send', text: 'hello', attachments: [] });
    await waitFor(() => first.webview.posted.some((m) => m.type === 'event' && m.ops.some((o) => o.op === 'result')));
    assert.ok(stub.context.workspaceState.get('claudeLocal.sidebarSession').sessionId);

    const second = makeView();
    provider.resolveWebviewView(second);
    second.webview.receive({ type: 'ready' });
    const init = second.webview.posted.find((m) => m.type === 'init');
    assert.ok(init.items.some((o) => o.op === 'user' && o.text === 'hello'));
    assert.ok(init.items.some((o) => o.op === 'text'));

    second.webview.receive({ type: 'focusChanged', focused: true });
    assert.strictEqual(stub.contextKeys['claude-local.sideBarActive'], true);
  } finally {
    ext.deactivate();
    for (const d of stub.context.subscriptions) if (d && d.dispose) d.dispose();
    restore();
  }
});

test('a missing CLI shows the Hebrew start error', async () => {
  const stub = createStub({ claudePath: path.join(__dirname, 'no-such-claude') });
  const restore = installStub(stub.vscode);
  const ext = require('../extension');
  try {
    ext.activate(stub.context);
    await stub.vscode.commands.executeCommand('claude-local.editor.open');
    const panel = stub.panels[0];
    panel.webview.receive({ type: 'ready' });
    panel.webview.receive({ type: 'send', text: 'hi', attachments: [] });
    await waitFor(() => panel.webview.posted.some((m) => m.type === 'event' && m.ops.some((o) => o.op === 'notice' && o.level === 'error')));
    const notice = panel.webview.posted.flatMap((m) => (m.type === 'event' ? m.ops : [])).find((o) => o.op === 'notice');
    assert.match(notice.text, /לא ניתן להפעיל את Claude .*claudeLocal\.claudePath/);
    const last = panel.webview.posted.filter((m) => m.type === 'state').pop();
    assert.strictEqual(last.running, false);
  } finally {
    ext.deactivate();
    restore();
  }
});
