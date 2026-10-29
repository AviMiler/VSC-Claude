/**
 * Which files are excluded from search and context: glob maps (`files.exclude`, `search.exclude`) and `.gitignore`.
 * Plain Node (no `vscode`), so it is unit-testable.
 */

/**
 * Converts a VS Code glob (`**`, `*`, `?`, `{a,b}`, `[abc]`) to a RegExp over `/`-separated relative paths.
 * @param {string} glob
 * @returns {RegExp}
 * @example globToRegExp('**\/node_modules').test('a/node_modules') // true
 */
function globToRegExp(glob) {
  let source = '';
  let inGroup = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        const slashAfter = glob[index + 2] === '/';
        source += slashAfter ? '(?:.*/)?' : '.*';
        index += slashAfter ? 2 : 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      inGroup += 1;
      source += '(?:';
    } else if (char === '}' && inGroup) {
      inGroup -= 1;
      source += ')';
    } else if (char === ',' && inGroup) {
      source += '|';
    } else if (char === '[') {
      const end = glob.indexOf(']', index + 1);
      if (end === -1) {
        source += '\\[';
      } else {
        source += `[${glob.slice(index + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
        index = end;
      }
    } else {
      source += char.replace(/[.+^$()|\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, process.platform === 'win32' ? 'i' : '');
}

/**
 * The active patterns of a `files.exclude`-style map (value `true`; `{when}` conditions are not evaluated and skipped).
 * @param {Record<string, boolean|object>|undefined} map
 * @returns {string[]}
 */
function activeGlobs(map) {
  return Object.entries(map || {}).filter(([, value]) => value === true).map(([glob]) => glob);
}

/**
 * True when the path or one of its parent folders matches a glob.
 * @param {string} relativePath `/`-separated, relative to the workspace folder
 * @param {RegExp[]} patterns from globToRegExp
 * @returns {boolean}
 */
function matchesAny(relativePath, patterns) {
  const parts = relativePath.split('/');
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('/');
    if (patterns.some(pattern => pattern.test(candidate))) return true;
  }
  return false;
}

/**
 * @typedef {{regex:RegExp, negate:boolean, dirOnly:boolean}} IgnoreRule
 */

/**
 * Parses a `.gitignore` (root of a workspace folder).
 * @param {string} text
 * @returns {IgnoreRule[]}
 */
function parseGitignore(text) {
  const rules = [];
  for (const raw of String(text).split(/\r?\n/)) {
    let line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    if (line.startsWith('\\')) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    // A pattern with a slash (other than at the end) is anchored to the root; otherwise it matches at any depth.
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    const glob = anchored ? line : `**/${line}`;
    rules.push({ regex: globToRegExp(glob), negate, dirOnly });
  }
  return rules;
}

/**
 * Git semantics: the last matching rule wins; a rule on a folder excludes everything inside it.
 * @param {string} relativePath `/`-separated
 * @param {IgnoreRule[]} rules
 * @param {boolean} [isDirectory]
 * @returns {boolean}
 */
function isGitIgnored(relativePath, rules, isDirectory = false) {
  const parts = relativePath.split('/');
  for (let length = 1; length <= parts.length; length += 1) {
    const candidate = parts.slice(0, length).join('/');
    const candidateIsDir = length < parts.length || isDirectory;
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !candidateIsDir) continue;
      if (rule.regex.test(candidate)) ignored = !rule.negate;
    }
    if (ignored) return true; // git cannot re-include a file whose parent folder is excluded
  }
  return false;
}

module.exports = { globToRegExp, activeGlobs, matchesAny, parseGitignore, isGitIgnored };
