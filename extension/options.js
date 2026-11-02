'use strict';
const { $, send } = PokeUI;
let current, importing, loading = false, busy = false;
function notice(text, error = false) { $('notice').textContent = text; $('notice').className = 'status' + (error ? ' error' : ''); $('notice').hidden = false; }
async function act(callback) {
  if (busy) return;
  busy = true;
  try { await callback(); await refresh(); }
  catch (error) { notice(error.message, true); }
  finally { busy = false; }
}
async function refresh(initial = false) {
  if (loading) return; loading = true;
  try {
    current = await send({ type: 'state.get' });
    $('profile').replaceChildren(...current.profiles.map(p => PokeUI.option(p.id, p.name))); $('profile').value = current.activeProfileId;
    $('mark-count').textContent = current.marks.length; $('strike-count').textContent = current.marks.filter(PokeModel.isComplete).length;
    const pages = new Map();
    for (const mark of current.marks) { const item = pages.get(mark.pageKey) || { title: mark.title, url: mark.url, count: 0 }; item.count++; pages.set(mark.pageKey, item); }
    $('page-count').textContent = pages.size; $('pages').replaceChildren();
    for (const page of pages.values()) {
      const row = document.createElement('div'); row.className = 'page'; const link = document.createElement('a'); link.href = page.url; link.textContent = page.title; link.target = '_blank'; link.rel = 'noreferrer';
      const count = document.createElement('small'); count.textContent = page.count + ' 处'; row.append(link, count); $('pages').append(row);
    }
    if (!pages.size) $('pages').textContent = '在百科上留下第一处标记吧。';
    $('sync-status').textContent = PokeUI.status(current); $('sync-status').className = 'status' + (current.sync.error ? ' error' : '');
    $('sync').disabled = !current.sync.connected || current.sync.syncing; $('disconnect').disabled = !current.sync.configured || current.sync.syncing;
    if (initial) {
      $('profile-name').value = current.profiles.find(p => p.id === current.activeProfileId)?.name || '';
      $('style').value = current.prefs.style;
      $('color').replaceChildren(...Object.keys(PokeModel.COLORS).map(key => PokeUI.option(key, current.prefs.labels[key]))); $('color').value = current.prefs.color;
      for (const [key, color] of Object.entries(PokeModel.COLORS)) {
        const label = document.createElement('label'); label.className = 'color-label';
        const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.background = color;
        const input = document.createElement('input'); input.id = 'label-' + key; input.maxLength = 30; input.value = current.prefs.labels[key]; input.setAttribute('aria-label', key + ' 的颜色含义');
        label.append(dot, input); $('colors').append(label);
      }
      const info = await send({ type: 'drive.info' }); $('client-id').value = info.clientId; $('redirect').textContent = info.redirect;
      if (info.hasSecret) $('client-secret').placeholder = '已保存；留空沿用已有凭据';
    }
  } finally { loading = false; }
}
$('profile').addEventListener('change', () => act(async () => {
  await send({ type: 'profile.select', id: $('profile').value });
  $('profile-name').value = current.profiles.find(p => p.id === $('profile').value)?.name || '';
  notice('已切换周目，百科标签页会自动更新。');
}));
$('new-profile').addEventListener('click', () => act(async () => { await send({ type: 'profile.create', name: $('profile-name').value }); notice('已创建独立的空白周目。'); }));
$('rename-profile').addEventListener('click', () => act(async () => { await send({ type: 'profile.rename', id: current.activeProfileId, name: $('profile-name').value }); notice('周目名称已保存。'); }));
$('save-prefs').addEventListener('click', () => act(async () => {
  const labels = Object.fromEntries(Object.keys(PokeModel.COLORS).map(key => [key, $('label-' + key).value.trim() || key]));
  await send({ type: 'prefs.save', style: $('style').value, color: $('color').value, labels }); notice('标记偏好已保存。');
  const selected = $('color').value; $('color').replaceChildren(...Object.keys(labels).map(key => PokeUI.option(key, labels[key]))); $('color').value = selected;
}));
$('connect').addEventListener('click', () => {
  // Permission request must be made directly in the user gesture handler.
  const permission = browser.permissions.request({ origins: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'], data_collection: ['authenticationInfo', 'browsingActivity', 'websiteContent', 'websiteActivity'] });
  act(async () => {
    if (!await permission) throw new Error('连接需要 Google API 访问权限');
    notice('请在 Google 窗口完成授权…'); $('connect').disabled = true;
    try { await send({ type: 'drive.connect', clientId: $('client-id').value, clientSecret: $('client-secret').value }); $('client-secret').value = ''; $('client-secret').placeholder = '已保存；留空沿用已有凭据'; notice('已连接 Google Drive，并完成首次同步。'); }
    finally { $('connect').disabled = false; }
  });
});
$('sync').addEventListener('click', () => act(async () => { notice('正在同步…'); await send({ type: 'drive.sync' }); notice('同步完成。'); }));
$('disconnect').addEventListener('click', () => act(async () => { await send({ type: 'drive.disconnect' }); $('client-id').value = ''; $('client-secret').value = ''; notice('已断开并清除本机 Google 凭据；本地标记和云端备份保留。'); }));
$('copy-redirect').addEventListener('click', () => act(async () => { await navigator.clipboard.writeText($('redirect').textContent); notice('重定向地址已复制。'); }));
$('export').addEventListener('click', () => act(async () => {
  const data = await send({ type: 'backup.export' });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `52poke-mark-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); notice('备份已生成，包含全部周目。');
}));
$('choose-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', () => act(async () => {
  importing = null; $('import-preview').hidden = true; const file = $('import-file').files[0]; if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('备份超过 10 MB，请使用较小的备份');
  importing = PokeModel.validate(JSON.parse(await file.text()));
  $('import-summary').textContent = `${Object.values(importing.profiles).filter(p => !p.deleted).length} 个周目，${Object.values(importing.marks).filter(m => !m.deleted).length} 处标记。将按版本合并，不会用旧备份覆盖更新的记录。`;
  $('import-preview').hidden = false; $('import-file').value = '';
}));
$('confirm-import').addEventListener('click', () => act(async () => { if (!importing) return; await send({ type: 'backup.import', data: importing }); importing = null; $('import-preview').hidden = true; notice('备份已合并并保存。'); }));
$('cancel-import').addEventListener('click', () => { importing = null; $('import-preview').hidden = true; });
browser.runtime.onMessage.addListener(message => { if (message.type === 'pkm.changed') refresh().catch(error => notice(error.message, true)); });
refresh(true).catch(error => notice(error.message, true));
