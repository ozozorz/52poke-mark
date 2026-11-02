(function (global) {
  'use strict';
  const SCHEMA = 1;
  const COLORS = { amber: '#d99100', green: '#21856b', blue: '#377fd1', rose: '#cc577c', violet: '#8864c5' };
  const STYLES = ['strike', 'underline', 'highlight'];
  const KINDS = ['text', 'cell', 'row', 'step'];
  const id = () => global.crypto.randomUUID();
  const clone = value => JSON.parse(JSON.stringify(value));
  const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  function fresh() {
    return { schema: SCHEMA, deviceId: id(), clock: 0, revision: 0, activeProfileId: 'default',
      profiles: { default: { id: 'default', name: '晶灿钻石 · 一周目', deleted: false, stamp: { counter: 0, actor: 'initial' } } }, marks: {},
      prefs: { style: 'strike', color: 'green', labels: { amber: '稍后回来', green: '已完成', blue: '缺少条件', rose: '重点关注', violet: '自定义' } } };
  }
  function compare(a, b) { return a.counter - b.counter || a.actor.localeCompare(b.actor, 'en'); }
  function stamp(state) { return { counter: ++state.clock, actor: state.deviceId }; }
  function revise(state) { state.revision++; }
  function put(state, collection, entity) {
    const value = { ...clone(entity), stamp: stamp(state) };
    state[collection][value.id] = value;
    revise(state);
    return value;
  }
  function snapshot(state) { return clone({ schema: SCHEMA, profiles: state.profiles, marks: state.marks }); }
  function text(value, max) { return typeof value === 'string' && value.length <= max; }
  function validateAnchor(a, kind) {
    assert(a && typeof a === 'object' && text(a.exact, 50000) && a.exact.trim(), '标记缺少有效原文');
    assert(text(a.prefix, 120) && text(a.suffix, 120) && text(a.section, 500), '标记上下文无效');
    assert(Number.isSafeInteger(a.start) && a.start >= 0, '标记位置无效');
    assert(text(a.path, 2000), '标记路径无效');
    if (kind !== 'text') assert(KINDS.includes(kind), '标记类型无效');
    if (a.table != null) {
      assert(typeof a.table === 'object' && text(a.table.rowText, 50000) && text(a.table.header, 5000), '表格定位信息无效');
      for (const key of ['index', 'row', 'column']) assert(Number.isSafeInteger(a.table[key]) && a.table[key] >= 0, '表格坐标无效');
    }
  }
  function validate(payload) {
    assert(payload?.schema === SCHEMA, '备份版本不受支持');
    for (const name of ['profiles', 'marks']) {
      const records = payload[name];
      assert(records && typeof records === 'object' && !Array.isArray(records), '备份结构无效');
      assert(Object.keys(records).length <= 50000, '备份记录过多');
      for (const [key, item] of Object.entries(records)) {
        assert(validKey(key) && item?.id === key, '记录 ID 无效');
        assert(Number.isSafeInteger(item.stamp?.counter) && item.stamp.counter >= 0 && item.stamp.counter < Number.MAX_SAFE_INTEGER - 1000000 && validKey(item.stamp.actor), '记录版本无效');
        assert(typeof item.deleted === 'boolean', '记录状态无效');
        if (name === 'profiles') assert(text(item.name, 80) && item.name.trim(), '周目名称无效');
        else {
          assert(validKey(item.profileId) && text(item.pageKey, 2500) && item.pageKey.startsWith('52poke:'), '标记所属页面或周目无效');
          assert(text(item.title, 500) && text(item.url, 5000) && /^https:\/\/wiki\.52poke\.com\//.test(item.url), '标记网页无效');
          assert(KINDS.includes(item.kind) && STYLES.includes(item.style) && Object.hasOwn(COLORS, item.color), '标记样式无效');
          validateAnchor(item.anchor, item.kind);
        }
      }
    }
    for (const mark of Object.values(payload.marks)) assert(Object.hasOwn(payload.profiles, mark.profileId), '备份缺少标记所属周目');
    return payload;
  }
  function merge(state, payload) {
    validate(payload);
    let changed = false;
    for (const name of ['profiles', 'marks']) for (const [key, remote] of Object.entries(payload[name])) {
      state.clock = Math.max(state.clock, remote.stamp.counter);
      const local = state[name][key];
      if (!local || compare(remote.stamp, local.stamp) > 0) {
        state[name][key] = clone(remote); changed = true;
      }
    }
    if (changed) revise(state);
    return changed;
  }
  function activeProfiles(state) { return Object.values(state.profiles).filter(x => !x.deleted); }
  function ensureProfile(state) {
    if (!state.profiles[state.activeProfileId] || state.profiles[state.activeProfileId].deleted) {
      state.activeProfileId = activeProfiles(state)[0]?.id;
      if (!state.activeProfileId) {
        const profile = put(state, 'profiles', { id: id(), name: '新的周目', deleted: false });
        state.activeProfileId = profile.id;
      }
    }
  }
  function pageMarks(state, pageKey) { return Object.values(state.marks).filter(m => !m.deleted && m.profileId === state.activeProfileId && (!pageKey || m.pageKey === pageKey)); }
  function isComplete(mark) { return mark.kind === 'row' || mark.style === 'strike'; }
  function canonicalPage(url, doc) {
    let source = doc?.querySelector('link[rel="canonical"]')?.href || url;
    const parsed = new URL(source, url);
    let title = parsed.searchParams.get('title') || parsed.pathname.replace(/^\/(?:wiki|zh(?:-[a-z]+)?)\//, '');
    try { title = decodeURIComponent(title); } catch (_) { /* Keep a malformed URI as a distinct page. */ }
    return '52poke:' + title.replace(/_/g, ' ').normalize('NFC');
  }
  const api = { SCHEMA, COLORS, STYLES, KINDS, id, clone, fresh, compare, put, snapshot, validate, validateAnchor, merge, activeProfiles, ensureProfile, pageMarks, isComplete, canonicalPage };
  global.PokeModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
