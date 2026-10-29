/**
 * Starts the configured `claude` executable: PATH lookup, .cmd/.bat through cmd.exe, the optional wrapper, and the env.
 * Why its own file: Windows needs special handling (npm installs `claude.cmd`, which only cmd.exe can run).
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ENTRYPOINT = 'claude-local-vscode';
const SAFE_CMD_ARG = /^[\w\-.:\\/=@,+]+$/;
const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

/**
 * Finds a bare command name on PATH (with PATHEXT on Windows). Paths and unknown names are returned unchanged.
 * @param {string} command e.g. "claude" or "C:\\tools\\claude.cmd"
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function resolveExecutable(command, env = process.env) {
  if (!command || /[\\/]/.test(command)) return command;
  const isWindows = process.platform === 'win32';
  const extensions = isWindows ? ['', ...(env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)] : [''];
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, command + ext.toLowerCase());
      // On Windows an extensionless file (a shell script npm also installs) cannot be spawned, so it is skipped.
      if (isWindows && !ext) continue;
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return command;
}

/**
 * Quotes one argument for a cmd.exe command line. "%" is refused: cmd.exe expands %NAME% even inside quotes.
 * @param {string} arg
 * @returns {string}
 */
function quoteForCmd(arg) {
  const text = String(arg);
  if (text.includes('%')) throw new Error(`ארגומנט עם % לא נתמך כאשר Claude מופעל דרך קובץ .cmd: ${text}`);
  return SAFE_CMD_ARG.test(text) ? text : `"${text.replace(/"/g, '""')}"`;
}

/**
 * @param {{claudePath:string, wrapper?:string, args:string[], env?:NodeJS.ProcessEnv}} options
 * @returns {{command:string, args:string[], windowsVerbatimArguments:boolean}}
 * @example buildCommand({ claudePath: 'claude', args: ['--version'] })
 */
function buildCommand({ claudePath, wrapper, args, env = process.env }) {
  const executable = resolveExecutable(wrapper || claudePath || 'claude', env);
  const fullArgs = wrapper ? [claudePath || 'claude', ...args] : args;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
    const line = [executable, ...fullArgs].map(quoteForCmd).join(' ');
    return { command: env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
  }
  return { command: executable, args: fullArgs, windowsVerbatimArguments: false };
}

/**
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {{name:string, value:string}[]} variables from `claudeLocal.environmentVariables`
 * @returns {NodeJS.ProcessEnv}
 */
function buildEnv(baseEnv, variables) {
  const env = { ...baseEnv };
  for (const variable of variables || []) {
    if (variable && typeof variable.name === 'string' && variable.name) env[variable.name] = String(variable.value ?? '');
  }
  env.CLAUDE_CODE_ENTRYPOINT = ENTRYPOINT;
  return env;
}

/**
 * @param {{claudePath:string, wrapper?:string, envVars?:{name:string, value:string}[]}} config
 * @param {string[]} args
 * @param {string} cwd
 * @returns {import('child_process').ChildProcessWithoutNullStreams}
 */
function spawnClaude(config, args, cwd) {
  const env = buildEnv(process.env, config.envVars);
  const spec = buildCommand({ claudePath: config.claudePath, wrapper: config.wrapper, args, env });
  return spawn(spec.command, spec.args, { cwd, env, windowsHide: true, windowsVerbatimArguments: spec.windowsVerbatimArguments });
}

/**
 * Runs `claude <args>` to completion and resolves with its output. Never rejects.
 * @param {{claudePath:string, wrapper?:string, envVars?:{name:string, value:string}[]}} config
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {Promise<{code:number|null, stdout:string, stderr:string, error:string|null}>}
 */
function runClaude(config, args, timeoutMs = 30000) {
  return new Promise(resolve => {
    let spec;
    const env = buildEnv(process.env, config.envVars);
    try {
      spec = buildCommand({ claudePath: config.claudePath, wrapper: config.wrapper, args, env });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: '', error: error.message });
      return;
    }
    const child = execFile(spec.command, spec.args, {
      env, timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: spec.windowsVerbatimArguments,
      maxBuffer: 8 * 1024 * 1024, encoding: 'utf8',
    }, (error, stdout, stderr) => {
      const clean = text => String(text || '').replace(ANSI_PATTERN, '');
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
        stdout: clean(stdout), stderr: clean(stderr),
        error: error && typeof error.code !== 'number' ? error.message : null,
      });
    });
    if (child.stdin) child.stdin.end();
  });
}

/**
 * Kills a process and its children (the CLI starts tool subprocesses).
 * @param {number|undefined} pid
 * @param {(message:string)=>void} [onError]
 */
function killTree(pid, onError = () => {}) {
  if (!pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, error => error && onError(error.message));
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch (error) { onError(error.message); }
  }
}

module.exports = { resolveExecutable, quoteForCmd, buildCommand, buildEnv, spawnClaude, runClaude, killTree, ENTRYPOINT };
