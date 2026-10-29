// VS Code stub: a minimal fake of the `vscode` API so the host code can be exercised under `node --test`.
const Module = require('module');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

/**
 * @template T
 * @returns {{event: (listener: (e: T) => void) => {dispose(): void}, fire: (e: T) => void}}
 */
function emitter() {
  const ee = new EventEmitter();
  return {
    event: (listener) => {
      ee.on('e', listener);
      return { dispose: () => ee.off('e', listener) };
    },
    fire: (e) => ee.emit('e', e),
  };
}

class Uri {
  /** @param {string} fsPath */
  constructor(fsPath) {
    this.fsPath = fsPath;
    this.scheme = 'file';
  }
  static file(p) {
    return new Uri(p);
  }
  static joinPath(base, ...parts) {
    return new Uri(path.join(base.fsPath, ...parts));
  }
  toString() {
    return `file://${this.fsPath}`;
  }
}

/** Creates a fresh stub; `config` holds claudeLocal.* values. */
function createStub(config = {}) {
  const commands = new Map();
  const contextKeys = {};
  const executed = [];
  const panels = [];
  const viewProviders = new Map();
  const serializers = new Map();
  const statusItems = [];
  const logs = [];

  function makeWebview() {
    const received = emitter();
    const webview = {
      html: '',
      options: {},
      cspSource: 'vscode-resource:',
      posted: [],
      asWebviewUri: (uri) => uri,
      postMessage: (msg) => {
        webview.posted.push(msg);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: received.event,
      /** test helper: a message from the webview */
      receive: (msg) => received.fire(msg),
    };
    return webview;
  }

  const vscode = {
    version: '1.106.0',
    ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    Uri,
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    window: {
      activeTextEditor: undefined,
      createOutputChannel: () => ({
        debug: (m) => logs.push(['debug', m]),
        info: (m) => logs.push(['info', m]),
        warn: (m) => logs.push(['warn', m]),
        error: (m) => logs.push(['error', m]),
        show() {},
        dispose() {},
      }),
      createWebviewPanel: (viewType, title, showOptions, options) => {
        const viewState = emitter();
        const disposed = emitter();
        const panel = {
          viewType, title, options, iconPath: undefined, visible: true, active: true,
          viewColumn: typeof showOptions === 'object' ? showOptions.viewColumn : showOptions,
          webview: makeWebview(),
          onDidChangeViewState: viewState.event,
          onDidDispose: disposed.event,
          reveal() {},
          dispose: () => disposed.fire(),
        };
        panels.push(panel);
        return panel;
      },
      registerWebviewViewProvider: (id, provider) => {
        viewProviders.set(id, provider);
        return { dispose() {} };
      },
      registerWebviewPanelSerializer: (id, s) => {
        serializers.set(id, s);
        return { dispose() {} };
      },
      createStatusBarItem: () => {
        const item = { text: '', show() {}, dispose() {} };
        statusItems.push(item);
        return item;
      },
      onDidChangeActiveTextEditor: emitter().event,
      showTextDocument: async () => ({}),
      showInputBox: async () => undefined,
      showInformationMessage: () => {},
      showWarningMessage: () => {},
      showErrorMessage: (m) => logs.push(['errorMessage', m]),
    },
    commands: {
      registerCommand: (id, fn) => {
        commands.set(id, fn);
        return { dispose: () => commands.delete(id) };
      },
      executeCommand: async (id, ...args) => {
        executed.push([id, ...args]);
        if (id === 'setContext') contextKeys[args[0]] = args[1];
        if (commands.has(id)) return commands.get(id)(...args);
        return undefined;
      },
    },
    workspace: {
      workspaceFolders: [{ uri: Uri.file(os.tmpdir()), name: 'tmp', index: 0 }],
      getWorkspaceFolder: () => undefined,
      getConfiguration: () => ({
        get: (key) => config[key],
        inspect: (key) => ({ globalValue: config[key] }),
      }),
      onDidChangeConfiguration: emitter().event,
      openTextDocument: async (uri) => ({ uri }),
    },
  };

  const extensionPath = path.join(__dirname, '..');
  const context = {
    subscriptions: [],
    extensionUri: Uri.file(extensionPath),
    extension: { packageJSON: require('../package.json') },
    workspaceState: {
      store: {},
      get(key) { return this.store[key]; },
      update(key, value) { this.store[key] = value; return Promise.resolve(); },
    },
    globalState: {
      store: {},
      get(key) { return this.store[key]; },
      update(key, value) { this.store[key] = value; return Promise.resolve(); },
    },
  };

  return { vscode, context, commands, contextKeys, executed, panels, viewProviders, serializers, statusItems, logs, makeWebview };
}

/** Makes `require('vscode')` return the given stub and clears the extension's modules from the cache. */
function installStub(vscode) {
  const root = path.join(__dirname, '..');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(root, 'src')) || key === path.join(root, 'extension.js')) delete require.cache[key];
  }
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return original.call(this, request, parent, isMain);
  };
  return () => {
    Module._load = original;
  };
}

module.exports = { createStub, installStub };
