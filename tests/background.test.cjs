const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../extension/lib/model.js');
const copy = value => structuredClone(value);
function harness(stored = {}, drive = {}) {
  let listener; const events = () => ({ addListener() {} });
  const browser = {
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => Object.hasOwn(stored, k)).map(k => [k, copy(stored[k])])); },
      async set(value) { Object.assign(stored, copy(value)); }, async remove(key) { delete stored[key]; }
    } },
    runtime: { id: 'test-extension', getURL: p => 'moz-extension://test/' + p, onMessage: { addListener(fn) { listener = fn; } }, onInstalled: events(), onStartup: events(), async sendMessage() {}, async openOptionsPage() {} },
    tabs: { async query() { return []; }, async sendMessage() {} },
    alarms: { async create() {}, async clear() {}, onAlarm: events() },
    permissions: { async contains() { return true; } }, identity: { getRedirectURL: () => 'https://test.extensions.allizom.org/' }
  };
  const context = vm.createContext({ browser, PokeModel: M, PokeDrive: drive, console, URL });
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), context);
  return { browser, stored, call: (msg, url = 'moz-extension://test/options.html') => listener(msg, { id: 'test-extension', url }) };
}
function payload(extra = {}) { return { type: 'mark.save', profileId: 'default', pageKey: '52poke:测试', title: '测试', url: 'https://wiki.52poke.com/wiki/测试', kind: 'text', style: 'strike', color: 'green', anchor: { exact: '领取自行车后继续前进', start: 0, prefix: '', suffix: '', section: '开局', path: 'p', table: null }, ...extra }; }
test('serialized concurrent saves and a fresh background instance retain all records', async () => {
  const h = harness(); const responses = await Promise.all(Array.from({ length: 12 }, () => h.call(payload()))); assert.ok(responses.every(r => r.ok));
  const restarted = harness(h.stored); const reply = await restarted.call({ type: 'state.get' }); assert.equal(reply.data.marks.length, 12);
});
test('undo is persisted, profile-scoped, and can undo consecutive changes to same mark', async () => {
  const h = harness(); await h.call(payload()); let saved = (await h.call({ type: 'state.get' })).data.marks[0];
  await h.call({ type: 'mark.delete', id: saved.id });
  const restart = harness(h.stored); assert.equal((await restart.call({ type: 'undo' })).ok, true);
  assert.equal((await restart.call({ type: 'state.get' })).data.marks.length, 1);
  assert.equal((await restart.call({ type: 'undo' })).ok, true);
  assert.equal((await restart.call({ type: 'state.get' })).data.marks.length, 0);
});
test('content messages cannot export credentials, connect Drive, or import records', async () => {
  const h = harness({ drive: { clientSecret: 'private-value' } });
  for (const type of ['drive.info', 'drive.connect', 'backup.export', 'backup.import']) assert.equal((await h.call({ type }, 'https://wiki.52poke.com/wiki/测试')).ok, false);
  const state = await h.call({ type: 'state.get' }, 'https://wiki.52poke.com/wiki/测试'); assert.equal(state.ok, true); assert.ok(!JSON.stringify(state).includes('private-value'));
  assert.equal((await h.call(payload(), 'https://evil.example/')).ok, false);
});
test('stale profile saves are rejected and malformed imports are atomic', async () => {
  const h = harness(); await h.call({ type: 'profile.create', name: '二周目' }); assert.equal((await h.call(payload())).ok, false);
  const before = copy(h.stored.state); const reply = await h.call({ type: 'backup.import', data: { schema: 1, profiles: {}, marks: { bad: {} } } });
  assert.equal(reply.ok, false); assert.deepEqual(h.stored.state, before);
});
test('sync writes only this device; changes during upload remain pending', async () => {
  let release, started; const uploadStarted = new Promise(r => { started = r; }); let uploaded;
  const h = harness({ drive: { enabled: true, clientId: 'client', auth: {} } }, {
    PREFIX: '52poke-mark-v1-', async refresh() { return { accessToken: 'token' }; }, async list() { return []; },
    async upload(token, device, file, data) { uploaded = copy(data); started(); await new Promise(r => { release = r; }); }
  });
  await h.call(payload()); const sync = h.call({ type: 'drive.sync' }); await uploadStarted;
  await h.call(payload({ anchor: { ...payload().anchor, exact: '新的独立标记' } })); release(); assert.equal((await sync).ok, true);
  assert.equal(Object.keys(uploaded.marks).length, 1); const state = (await h.call({ type: 'state.get' })).data;
  assert.equal(state.marks.length, 2); assert.ok(state.sync.syncedRevision < state.revision);
});
test('offline sync failure preserves local data and exposes saved/error separately', async () => {
  const h = harness({ drive: { enabled: true, auth: {} } }, { async refresh() { throw Error('offline'); } });
  await h.call(payload()); assert.equal((await h.call({ type: 'drive.sync' })).ok, false);
  const state = (await h.call({ type: 'state.get' })).data; assert.equal(state.marks.length, 1); assert.equal(state.sync.error, 'offline');
});
test('revoked transmission permission prevents any Drive requests', async () => {
  const h = harness({ drive: { enabled: true } }, { async refresh() { throw Error('must not run'); } }); h.browser.permissions.contains = async () => false;
  const result = await h.call({ type: 'drive.sync' }); assert.equal(result.ok, false); assert.match(result.error, /权限/);
});
