/** Unit tests: glob matching, .gitignore rules, mention text and fuzzy ranking. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { globToRegExp, activeGlobs, matchesAny, parseGitignore, isGitIgnored } = require('../src/context/exclusions');
const { formatMention, selectionLines, rankCandidates, foldersOf } = require('../src/context/mention-format');

test('globToRegExp: **, *, ?, {a,b}, [..]', () => {
  assert.ok(globToRegExp('**/node_modules').test('node_modules'));
  assert.ok(globToRegExp('**/node_modules').test('a/b/node_modules'));
  assert.ok(globToRegExp('*.log').test('x.log'));
  assert.ok(!globToRegExp('*.log').test('dir/x.log'));
  assert.ok(globToRegExp('**/*.{js,ts}').test('src/a.ts'));
  assert.ok(globToRegExp('file?.txt').test('file1.txt'));
  assert.ok(globToRegExp('[ab].md').test('a.md'));
  assert.ok(!globToRegExp('[ab].md').test('c.md'));
});

test('activeGlobs keeps only true values', () => {
  assert.deepEqual(activeGlobs({ '**/.git': true, '**/x': false, '**/*.js': { when: '$(basename).ts' } }), ['**/.git']);
});

test('matchesAny matches a parent folder', () => {
  const patterns = ['**/node_modules'].map(globToRegExp);
  assert.ok(matchesAny('web/node_modules/react/index.js', patterns));
  assert.ok(!matchesAny('web/src/index.js', patterns));
});

test('gitignore: anchored, unanchored, folders, negation', () => {
  const rules = parseGitignore('# comment\nnode_modules/\n*.vsix\n/build\n!keep.vsix\ndocs/*.tmp\n');
  assert.ok(isGitIgnored('node_modules/a/b.js', rules));
  assert.ok(isGitIgnored('pkg/node_modules/x.js', rules));
  assert.ok(!isGitIgnored('node_modules', rules)); // a file named node_modules is not a folder
  assert.ok(isGitIgnored('node_modules', rules, true));
  assert.ok(isGitIgnored('out/a.vsix', rules));
  assert.ok(!isGitIgnored('keep.vsix', rules));
  assert.ok(isGitIgnored('build/x.js', rules));
  assert.ok(!isGitIgnored('src/build/x.js', rules));
  assert.ok(isGitIgnored('docs/a.tmp', rules));
  assert.ok(!isGitIgnored('docs/sub/a.tmp', rules));
  assert.ok(!isGitIgnored('src/index.js', rules));
});

test('formatMention: no selection, one line, a range', () => {
  assert.equal(formatMention('src/a.js', null), '@src/a.js');
  assert.equal(formatMention('src/a.js', { start: 5, end: 5 }), '@src/a.js#5');
  assert.equal(formatMention('src\\a.js', { start: 5, end: 10 }), '@src/a.js#5-10');
});

test('selectionLines: 1-based, a trailing column-0 line is excluded', () => {
  const sel = (sl, sc, el, ec) => ({ start: { line: sl, character: sc }, end: { line: el, character: ec }, isEmpty: sl === el && sc === ec });
  assert.equal(selectionLines(sel(3, 2, 3, 2)), null);
  assert.deepEqual(selectionLines(sel(4, 0, 4, 9)), { start: 5, end: 5 });
  assert.deepEqual(selectionLines(sel(4, 0, 9, 0)), { start: 5, end: 9 });
  assert.deepEqual(selectionLines(sel(4, 0, 9, 3)), { start: 5, end: 10 });
});

test('rankCandidates prefers file-name matches and drops non-matches', () => {
  const files = ['src/panels/chat-panel.js', 'src/cli/process.js', 'webview/chat/app.js', 'README.md'];
  const ranked = rankCandidates('proc', files);
  assert.equal(ranked[0], 'src/cli/process.js');
  assert.ok(!ranked.includes('README.md'));
  assert.equal(rankCandidates('', files).length, 4);
  assert.equal(rankCandidates('x', Array.from({ length: 50 }, (_, i) => `x${i}.js`)).length, 20);
});

test('foldersOf lists every parent folder with a trailing slash', () => {
  assert.deepEqual(foldersOf(['a/b/c.js', 'a/d.js']).sort(), ['a/', 'a/b/']);
});
