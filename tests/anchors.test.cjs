const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const M = require('../extension/lib/model.js');
global.PokeModel = M;
const A = require('../extension/lib/anchors.js');
function dom(html) { const doc = new JSDOM(`<main id="root">${html}</main>`, { virtualConsole: new VirtualConsole() }).window.document; return { doc, root: doc.querySelector('#root') }; }
function record(anchor, kind, overrides = {}) { return { id: M.id(), anchor, kind, style: 'strike', color: 'green', stamp: { counter: 1, actor: 'test' }, ...overrides }; }
const table = '<h2 id="items">道具</h2><table><tr><th>地点</th><th>物品</th></tr><tr><td>自行车道</td><td><a href="/wiki/伤药">伤药</a></td></tr><tr><td>洞窟入口</td><td>伤药</td></tr></table>';
test('cell survives inserted rows; original links and click listeners survive render and clear', () => {
  const { doc, root } = dom(table); const cell = doc.querySelectorAll('td')[1]; const link = cell.querySelector('a'); let clicks = 0; link.addEventListener('click', e => { e.preventDefault(); clicks++; });
  const mark = record(A.capture(root, cell, 'cell'), 'cell');
  doc.querySelector('table').insertAdjacentHTML('afterbegin', '<tr><td>新增地点</td><td>伤药</td></tr>');
  const result = A.render(root, [mark]); assert.equal(result.unresolved.length, 0); assert.equal(result.located.get(mark.id).element, cell);
  assert.ok(link.querySelector('[data-pkm-mark]')); link.click(); assert.equal(clicks, 1); A.clear(root); link.click(); assert.equal(clicks, 2); assert.equal(link.textContent, '伤药');
});
test('ambiguous repeated cells stay unresolved rather than selecting a path blindly', () => {
  const { root } = dom('<h2 id="same">重复</h2><table><tr><td>相同</td></tr><tr><td>相同</td></tr></table>');
  const anchor = A.capture(root, root.querySelector('td'), 'cell'); anchor.prefix = ''; anchor.suffix = ''; anchor.table = null;
  assert.equal(A.resolve(root, anchor, 'cell'), null);
});
test('text across links, exclusions, and overlapping marks preserves exact original text', () => {
  const { doc, root } = dom('<p>先去<a href="#">宝可梦中心</a>治疗，然后继续。</p><span class="mw-editsection">编辑</span>');
  const text = A.index(root).text; const range = A.rangeFor(A.index(root), 1, 11); const anchor = A.capture(root, range, 'text');
  assert.equal(anchor.exact, text.slice(1, 11));
  const other = record(A.capture(root, root.querySelector('p'), 'step'), 'step', { style: 'highlight', color: 'amber' });
  const result = A.render(root, [record(anchor, 'text'), other]); assert.equal(result.unresolved.length, 0);
  assert.ok(doc.querySelector('a [data-pkm-mark]')); assert.equal(A.index(root).text, text);
  assert.ok([...root.querySelectorAll('[data-pkm-mark]')].some(x => x.style.backgroundColor && x.style.textDecorationLine === 'line-through'));
  A.clear(root); assert.equal(A.index(root).text, text);
});
test('deleted text remains pending and can be relocated to new content', () => {
  const { root } = dom('<p>拿到自行车以后，穿过自行车道。</p>'); const before = A.capture(root, root.querySelector('p'), 'step');
  root.querySelector('p').textContent = '取得自行车后继续向南探索。'; assert.equal(A.resolve(root, before, 'step'), null);
  const revised = A.capture(root, root.querySelector('p'), 'step'); assert.ok(A.resolve(root, revised, 'step'));
});
test('nested tables and rowspan cells keep independent element identities', () => {
  const { root } = dom('<h2>遭遇</h2><table><tr><td rowspan="2">白天</td><td>小火马</td></tr><tr><td><table><tr><td>夜晚</td><td>小火马</td></tr></table></td></tr></table>');
  for (const cell of root.querySelectorAll('td')) { const anchor = A.capture(root, cell, 'cell'); assert.equal(A.resolve(root, anchor, 'cell')?.element, cell); }
});
test('row marks gray the row without wrapping table whitespace or changing original nodes/styles', () => {
  const { root } = dom('<h2>道具</h2><table><tbody><tr id="row" style="background:red">\n<td rowspan="2" style="background:yellow"><a href="#">神奇糖果</a></td>\n<td><b>自行车道入口</b></td>\n</tr><tr><td>别的道具</td></tr></tbody></table>');
  const row = root.querySelector('#row'), before = row.innerHTML, originalStyle = row.getAttribute('style');
  const children = [...row.childNodes], link = row.querySelector('a'); let clicks = 0;
  link.addEventListener('click', e => { e.preventDefault(); clicks++; });
  // Old backups may contain any style/color: every row now uses gray presentation.
  for (const style of M.STYLES) {
    const mark = record(A.capture(root, row, 'row'), 'row', { style });
    const result = A.render(root, [mark]);
    assert.equal(result.unresolved.length, 0); assert.equal(row.getAttribute('data-pkm-row'), mark.id);
    assert.equal(row.innerHTML, before); assert.deepEqual([...row.childNodes], children);
    assert.equal(row.querySelectorAll('span[data-pkm-mark]').length, 0);
    assert.equal(root.querySelectorAll('tr[data-pkm-row]').length, 1);
    link.click(); A.clear(root);
    assert.equal(row.hasAttribute('data-pkm-row'), false); assert.equal(row.innerHTML, before); assert.equal(row.getAttribute('style'), originalStyle);
  }
  assert.equal(clicks, 3);
});
test('removing a row mark keeps the independent cell mark and table structure', () => {
  const { root } = dom(table), row = root.querySelectorAll('tr')[1], cell = row.cells[1];
  const rowMark = record(A.capture(root, row, 'row'), 'row'); const cellMark = record(A.capture(root, cell, 'cell'), 'cell');
  A.render(root, [rowMark, cellMark]); assert.ok(row.hasAttribute('data-pkm-row')); assert.ok(cell.querySelector('[data-pkm-mark]'));
  A.render(root, [cellMark]); assert.equal(row.hasAttribute('data-pkm-row'), false); assert.ok(cell.querySelector('[data-pkm-mark]'));
  assert.equal(row.cells.length, 2); assert.equal(row.querySelector(':scope > span'), null);
});
test('cross-cell text selections never wrap structural table whitespace', () => {
  const { root } = dom('<h2>道具</h2><table><tr>\n<td>神奇糖果</td>\n<td>入口处领取</td>\n</tr></table>');
  const row = root.querySelector('tr'); const range = root.ownerDocument.createRange(); range.selectNodeContents(row);
  A.render(root, [record(A.capture(root, range, 'text'), 'text')]);
  assert.equal(row.cells.length, 2); assert.equal(row.querySelector(':scope > span'), null);
  assert.equal(row.querySelectorAll('td span[data-pkm-mark]').length, 2);
});
for (const file of ['route206.html', 'walkthrough.html']) test(`real 52poke fixture: ${file}`, { skip: !fs.existsSync(`tests/${file}`) }, () => {
  const page = new JSDOM(fs.readFileSync(`tests/${file}`, 'utf8'), { virtualConsole: new VirtualConsole(), url: 'https://wiki.52poke.com/wiki/test' });
  const root = page.window.document.querySelector('#mw-content-text .mw-parser-output'); assert.ok(root);
  const candidates = [...root.querySelectorAll('td,li')].filter(x => { const text = A.plain(x); return text.trim().length >= 3 && text.length < 100; });
  const picks = candidates.filter((_, i) => i % Math.max(1, Math.floor(candidates.length / 12)) === 0).slice(0, 12);
  assert.ok(picks.length);
  for (const cell of picks) { const kind = cell.localName === 'li' ? 'step' : 'cell'; const anchor = A.capture(root, cell, kind); assert.equal(A.resolve(root, anchor, kind)?.element, cell, anchor.exact); }
  const marks = picks.slice(0, 4).map(cell => { const kind = cell.localName === 'li' ? 'step' : 'cell'; return record(A.capture(root, cell, kind), kind); });
  const before = A.index(root).text; const result = A.render(root, marks); assert.equal(result.unresolved.length, 0); assert.equal(A.index(root).text, before);
  A.clear(root); assert.equal(A.index(root).text, before);
});
