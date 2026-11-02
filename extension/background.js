'use strict';
const M = PokeModel;
let tail = Promise.resolve();
let syncing = null;
let authBusy = false;
function transaction(work) {
  const task = tail.then(async () => {
    const stored = await browser.storage.local.get(['state', 'history']);
    const state = stored.state || M.fresh();
    const history = stored.history || [];
    const result = await work(state, history);
    await browser.storage.local.set({ state, history: history.slice(-50) });
    return result;
  });
  tail = task.catch(() => {});
  return task;
}
async function credentials() { return (await browser.storage.local.get('drive')).drive || {}; }
async function syncStatus() {
  const drive = await credentials();
  return { configured: !!drive.clientId, connected: !!drive.enabled, lastSynced: drive.lastSynced || null,
    syncedRevision: drive.syncedRevision ?? -1, error: drive.error || '', syncing: !!syncing };
}
async function notify() {
  const tabs = await browser.tabs.query({ url: 'https://wiki.52poke.com/*' });
  await Promise.allSettled(tabs.map(tab => browser.tabs.sendMessage(tab.id, { type: 'pkm.changed' })));
  browser.runtime.sendMessage({ type: 'pkm.changed' }).catch(() => {});
}
async function schedule() {
  const drive = await credentials();
  if (drive.enabled) await browser.alarms.create('pkm-pending', { delayInMinutes: 0.5 });
}
async function publicState(pageKey) {
  const value = await transaction(state => {
    M.ensureProfile(state);
    return { profiles: M.activeProfiles(state), activeProfileId: state.activeProfileId, marks: M.pageMarks(state, pageKey),
      prefs: state.prefs, revision: state.revision };
  });
  return { ...value, sync: await syncStatus() };
}
async function performSync() {
  if (authBusy) throw new Error('正在处理 Google 连接，请稍后重试');
  if (syncing) return syncing;
  syncing = (async () => {
    let drive = await credentials();
    if (!drive.enabled) throw new Error('请先在设置中连接 Google Drive');
    try {
      if (!await browser.permissions.contains({ origins: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'], data_collection: ['authenticationInfo', 'browsingActivity', 'websiteContent', 'websiteActivity'] })) throw new Error('同步权限已撤回，请重新连接 Google Drive');
      const auth = await PokeDrive.refresh(drive, drive.auth || {});
      drive.auth = auth;
      await browser.storage.local.set({ drive });
      const files = await PokeDrive.list(auth.accessToken);
      const remote = [];
      for (const file of files) remote.push(M.validate(await PokeDrive.download(auth.accessToken, file.id)));
      const pending = await transaction(state => {
        for (const snapshot of remote) M.merge(state, snapshot);
        M.ensureProfile(state);
        return { deviceId: state.deviceId, data: M.snapshot(state), revision: state.revision };
      });
      await notify();
      // Each device writes only its own snapshot. Concurrent devices cannot overwrite each other.
      const own = files.find(file => file.name === PokeDrive.PREFIX + pending.deviceId + '.json');
      await PokeDrive.upload(auth.accessToken, pending.deviceId, own?.id, pending.data);
      drive = { ...drive, lastSynced: Date.now(), syncedRevision: pending.revision, error: '' };
      await browser.storage.local.set({ drive });
    } catch (error) {
      await browser.storage.local.set({ drive: { ...drive, error: error.message } });
      throw error;
    }
  })();
  try { return await syncing; }
  finally { syncing = null; await notify(); }
}
function remember(history, before, after) { history.push({ id: after.id, before: before ? M.clone(before) : null, afterStamp: after.stamp, profileId: after.profileId, pageKey: after.pageKey }); }
async function mutate(message) {
  const result = await transaction((state, history) => {
    M.ensureProfile(state);
    if (message.type === 'profile.select') {
      if (!state.profiles[message.id] || state.profiles[message.id].deleted) throw new Error('周目不存在');
      state.activeProfileId = message.id;
    } else if (message.type === 'profile.create' || message.type === 'profile.rename') {
      const name = String(message.name || '').trim().slice(0, 80);
      if (!name) throw new Error('请输入周目名称');
      if (message.type === 'profile.rename' && !state.profiles[message.id]) throw new Error('周目不存在');
      const profile = M.put(state, 'profiles', { id: message.type === 'profile.create' ? M.id() : message.id, name, deleted: false });
      state.activeProfileId = profile.id;
    } else if (message.type === 'prefs.save') {
      if (M.STYLES.includes(message.style)) state.prefs.style = message.style;
      if (Object.hasOwn(M.COLORS, message.color)) state.prefs.color = message.color;
      if (message.labels) for (const key of Object.keys(M.COLORS)) if (typeof message.labels[key] === 'string') state.prefs.labels[key] = message.labels[key].slice(0, 30);
    } else if (message.type === 'mark.save') {
      if (message.profileId !== state.activeProfileId) throw new Error('周目已切换，请在当前周目重新操作');
      const before = message.id ? state.marks[message.id] : null;
      if (before && (before.profileId !== state.activeProfileId || before.pageKey !== message.pageKey)) throw new Error('标记不属于当前页面或周目');
      const mark = { id: before?.id || M.id(), profileId: state.activeProfileId, pageKey: message.pageKey, title: message.title,
        url: message.url, kind: message.kind, style: message.style, color: message.color, anchor: message.anchor, deleted: false };
      M.validate({ schema: 1, profiles: state.profiles, marks: { [mark.id]: { ...mark, stamp: { counter: 0, actor: 'validate' } } } });
      const after = M.put(state, 'marks', mark); remember(history, before, after);
    } else if (message.type === 'mark.delete') {
      const before = state.marks[message.id];
      if (!before || before.profileId !== state.activeProfileId) throw new Error('标记不存在于当前周目');
      if (!before.deleted) { const after = M.put(state, 'marks', { ...before, deleted: true }); remember(history, before, after); }
    } else if (message.type === 'undo') {
      const position = history.findLastIndex(item => item.profileId === state.activeProfileId && (!message.pageKey || item.pageKey === message.pageKey));
      if (position < 0) throw new Error('当前周目没有可撤销的操作');
      const item = history[position]; const current = state.marks[item.id];
      if (!current || M.compare(current.stamp, item.afterStamp) !== 0) throw new Error('这条标记已被后续操作或同步更新，请直接编辑它');
      history.splice(position, 1);
      const restored = M.put(state, 'marks', item.before || { ...current, deleted: true });
      // Let consecutive local undo operations on the same entity remain undoable.
      const earlier = history.findLast(x => x.id === item.id);
      if (earlier) earlier.afterStamp = restored.stamp;
    } else if (message.type === 'backup.import') {
      M.merge(state, M.validate(message.data)); M.ensureProfile(state);
    } else throw new Error('不支持的操作');
    return true;
  });
  await notify(); await schedule(); return result;
}
const contentActions = new Set(['state.get', 'profile.select', 'mark.save', 'mark.delete', 'undo', 'prefs.save', 'options.open']);
async function handle(message, sender) {
  if (!message || typeof message.type !== 'string' || message.type === 'pkm.changed') return;
  if (sender.id !== browser.runtime.id) throw new Error('请求来源无效');
  const isContent = !sender.url?.startsWith(browser.runtime.getURL(''));
  if (isContent && (!sender.url?.startsWith('https://wiki.52poke.com/') || !contentActions.has(message.type))) throw new Error('此页面无权执行该操作');
  if (!isContent && !sender.url?.startsWith(browser.runtime.getURL(''))) throw new Error('请求来源无效');
  if (message.type === 'state.get') return publicState(message.pageKey);
  if (message.type === 'options.open') return browser.runtime.openOptionsPage();
  if (message.type === 'backup.export') return transaction(state => M.snapshot(state));
  if (message.type === 'drive.info') {
    const drive = await credentials();
    return { clientId: drive.clientId || '', hasSecret: !!drive.clientSecret, redirect: browser.identity.getRedirectURL(), ...await syncStatus() };
  }
  if (message.type === 'drive.connect') {
    if (authBusy || syncing) throw new Error('正在处理连接或同步，请稍后重试');
    const clientId = String(message.clientId || '').trim();
    const previous = await credentials();
    const clientSecret = String(message.clientSecret || '').trim() || (clientId === previous.clientId ? previous.clientSecret : '');
    if (!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret) throw new Error('请填写自己的 OAuth Client ID 和 Client Secret');
    authBusy = true;
    try {
      const config = { clientId, clientSecret };
      const auth = await PokeDrive.authorize(config);
      await browser.storage.local.set({ drive: { ...config, auth, enabled: true, syncedRevision: -1, error: '' } });
    } finally { authBusy = false; }
    await performSync(); return true;
  }
  if (message.type === 'drive.disconnect') {
    if (authBusy || syncing) throw new Error('请等本次连接或同步结束后再断开');
    await browser.storage.local.remove('drive');
    await browser.alarms.clear('pkm-pending'); await notify(); return true;
  }
  if (message.type === 'drive.sync') { await performSync(); return true; }
  return mutate(message);
}
browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'pkm.changed') return undefined;
  return handle(message, sender).then(data => ({ ok: true, data }), error => ({ ok: false, error: error.message }));
});
browser.alarms.onAlarm.addListener(async alarm => {
  if (!['pkm-pending', 'pkm-periodic'].includes(alarm.name)) return;
  if ((await credentials()).enabled) await performSync().catch(() => {});
});
async function boot() {
  await transaction(state => M.ensureProfile(state));
  await browser.alarms.create('pkm-periodic', { periodInMinutes: 5 });
}
browser.runtime.onInstalled.addListener(boot);
browser.runtime.onStartup.addListener(async () => { await boot(); await schedule(); });
