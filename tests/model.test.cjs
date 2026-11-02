const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../extension/lib/model.js');
function mark(id = M.id()) { return { id, profileId: 'default', pageKey: '52poke:测试', title: '测试', url: 'https://wiki.52poke.com/wiki/测试', kind: 'cell', style: 'strike', color: 'green', deleted: false, anchor: { exact: '取得自行车', prefix: '', suffix: '', start: 0, path: 'table > tr > td', section: '道具', table: null } }; }
test('offline additions converge in either merge order and repeated merge is idempotent', () => {
  const a = M.fresh(), b = M.fresh(); M.put(a, 'marks', mark()); M.put(b, 'marks', mark());
  const beforeA = M.snapshot(a), beforeB = M.snapshot(b);
  M.merge(a, beforeB); M.merge(b, beforeA);
  assert.deepEqual(M.snapshot(a), M.snapshot(b)); assert.equal(Object.keys(a.marks).length, 2);
  assert.equal(M.merge(a, M.snapshot(b)), false);
});
test('deletion tombstones survive stale backup and later re-add can win', () => {
  const a = M.fresh(), b = M.fresh(); const m = M.put(a, 'marks', mark()); M.merge(b, M.snapshot(a));
  const stale = M.snapshot(b); M.put(a, 'marks', { ...m, deleted: true }); M.merge(b, M.snapshot(a)); M.merge(b, stale);
  assert.equal(b.marks[m.id].deleted, true); assert.equal(M.pageMarks(b).length, 0);
  M.put(b, 'marks', { ...b.marks[m.id], deleted: false }); M.merge(a, M.snapshot(b)); assert.equal(a.marks[m.id].deleted, false);
});
test('concurrent same-record changes have deterministic winner', () => {
  const a = M.fresh(), b = M.fresh(); const m = M.put(a, 'marks', mark()); M.merge(b, M.snapshot(a));
  M.put(a, 'marks', { ...m, color: 'blue' }); M.put(b, 'marks', { ...m, deleted: true });
  const sa = M.snapshot(a), sb = M.snapshot(b); M.merge(a, sb); M.merge(b, sa); assert.deepEqual(M.snapshot(a), M.snapshot(b));
});
test('playthroughs isolate progress and export does not contain local credentials', () => {
  const s = M.fresh(); M.put(s, 'marks', mark()); const profile = M.put(s, 'profiles', { id: M.id(), name: '二周目', deleted: false }); s.activeProfileId = profile.id;
  assert.equal(M.pageMarks(s).length, 0); s.drive = { clientSecret: 'secret' }; assert.equal(JSON.stringify(M.snapshot(s)).includes('secret'), false);
});
test('invalid backups are rejected before mutation', () => {
  const s = M.fresh(); const before = M.snapshot(s);
  assert.throws(() => M.merge(s, { schema: 2, profiles: {}, marks: {} }));
  const bad = M.snapshot(s); bad.marks.bad = { ...mark('bad'), style: 'expression', stamp: { counter: 1, actor: 'valid' } };
  assert.throws(() => M.merge(s, bad)); assert.deepEqual(M.snapshot(s), before);
  const poison = JSON.parse('{"schema":1,"profiles":{"__proto__":{"id":"__proto__"}},"marks":{}}'); assert.throws(() => M.validate(poison));
});
test('URL forms use canonical page identity and keep full-width title characters', () => {
  const fakeDoc = { querySelector: () => ({ href: 'https://wiki.52poke.com/wiki/附录:寶可夢_流程' }) };
  assert.equal(M.canonicalPage('https://wiki.52poke.com/zh-hans/xx#章节', fakeDoc), '52poke:附录:寶可夢 流程');
  assert.equal(M.canonicalPage('https://wiki.52poke.com/wiki/%EF%BC%92%EF%BC%90%EF%BC%96%E5%8F%B7'), '52poke:２０６号');
});
