/**
 * Applies the exclusion rules to real workspace files: `files.exclude`, `search.exclude` and, with
 * `respectGitIgnore`, the root `.gitignore` of each workspace folder (cached by modification time).
 */
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const settings = require('../util/settings');
const { globToRegExp, activeGlobs, matchesAny, parseGitignore, isGitIgnored } = require('./exclusions');

const gitignoreCache = new Map(); // folder path -> {mtimeMs, rules}

/** @param {string} folderPath @returns {import('./exclusions').IgnoreRule[]} */
function gitignoreRules(folderPath) {
  const file = path.join(folderPath, '.gitignore');
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return [];
  }
  const cached = gitignoreCache.get(folderPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.rules;
  const rules = parseGitignore(fs.readFileSync(file, 'utf8'));
  gitignoreCache.set(folderPath, { mtimeMs, rules });
  return rules;
}

/**
 * @param {vscode.WorkspaceFolder} folder
 * @returns {string[]} the `files.exclude` and `search.exclude` globs active for the folder
 */
function excludeGlobs(folder) {
  return [
    ...activeGlobs(vscode.workspace.getConfiguration('files', folder.uri).get('exclude')),
    ...activeGlobs(vscode.workspace.getConfiguration('search', folder.uri).get('exclude')),
  ];
}

/**
 * True when a file's text must never be attached (only its path).
 * @param {vscode.Uri} uri
 * @returns {boolean}
 */
function isContentExcluded(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return false;
  const relative = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
  if (matchesAny(relative, excludeGlobs(folder).map(globToRegExp))) return true;
  return Boolean(settings.get('respectGitIgnore')) && isGitIgnored(relative, gitignoreRules(folder.uri.fsPath));
}

/**
 * A filter for many paths of one folder (rules compiled once).
 * @param {vscode.WorkspaceFolder} folder
 * @returns {(relative:string, isDirectory?:boolean)=>boolean} true when search must leave the path out
 */
function createSearchFilter(folder) {
  const patterns = excludeGlobs(folder).map(globToRegExp);
  const rules = settings.get('respectGitIgnore') ? gitignoreRules(folder.uri.fsPath) : [];
  return (relative, isDirectory = false) => matchesAny(relative, patterns) || isGitIgnored(relative, rules, isDirectory);
}

module.exports = { isContentExcluded, createSearchFilter, excludeGlobs };
