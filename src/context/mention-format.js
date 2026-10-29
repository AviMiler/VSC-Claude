/**
 * The text of an @-mention (`@path`, `@path#5`, `@path#5-10`) and fuzzy ranking of mention candidates.
 * Plain Node (no `vscode`), so it is unit-testable.
 */

/**
 * @param {string} relativePath `/`-separated
 * @param {{start:number, end:number}|null} lines 1-based inclusive line range, or null
 * @returns {string}
 * @example formatMention('src/a.js', { start: 5, end: 5 }) // '@src/a.js#5'
 */
function formatMention(relativePath, lines) {
  const path = relativePath.replace(/\\/g, '/');
  if (!lines) return `@${path}`;
  return lines.start === lines.end ? `@${path}#${lines.start}` : `@${path}#${lines.start}-${lines.end}`;
}

/**
 * The 1-based line range of a selection; a selection that ends at column 0 of a later line excludes that line.
 * @param {{start:{line:number}, end:{line:number, character:number}, isEmpty:boolean}} selection 0-based (vscode.Selection)
 * @returns {{start:number, end:number}|null}
 */
function selectionLines(selection) {
  if (!selection || selection.isEmpty) return null;
  let end = selection.end.line;
  if (selection.end.character === 0 && end > selection.start.line) end -= 1;
  return { start: selection.start.line + 1, end: end + 1 };
}

/**
 * Subsequence score of `query` in `candidate` (higher is better); -1 when not all characters appear in order.
 * Matches in the file name, at word starts and in a row score more.
 * @param {string} query
 * @param {string} candidate `/`-separated path
 * @returns {number}
 */
function fuzzyScore(query, candidate) {
  const needle = query.toLowerCase();
  const hay = candidate.toLowerCase();
  if (!needle) return 0;
  const nameStart = hay.lastIndexOf('/', hay.length - 2) + 1;
  let score = 0;
  let position = -1;
  let previous = -2;
  for (const char of needle) {
    position = hay.indexOf(char, position + 1);
    if (position === -1) return -1;
    score += 1;
    if (position === previous + 1) score += 3;
    if (position >= nameStart) score += 2;
    if (position === 0 || '/-_.'.includes(hay[position - 1])) score += 2;
    previous = position;
  }
  if (hay.slice(nameStart).startsWith(needle)) score += 10;
  return score - candidate.length * 0.01;
}

/**
 * @param {string} query
 * @param {string[]} candidates
 * @param {number} [limit]
 * @returns {string[]} the best `limit` candidates, best first
 */
function rankCandidates(query, candidates, limit = 20) {
  return candidates
    .map(candidate => ({ candidate, score: fuzzyScore(query, candidate) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map(item => item.candidate);
}

/**
 * Every folder (ending with `/`) that holds one of the files.
 * @param {string[]} files `/`-separated relative paths
 * @returns {string[]}
 */
function foldersOf(files) {
  const folders = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let length = 1; length < parts.length; length += 1) folders.add(`${parts.slice(0, length).join('/')}/`);
  }
  return [...folders];
}

module.exports = { formatMention, selectionLines, fuzzyScore, rankCandidates, foldersOf };
