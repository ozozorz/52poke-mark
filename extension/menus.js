'use strict';
// Native Firefox context menu. It never suppresses the website/browser menu.
(() => {
  const ROOT = 'pkm-menu';
  const kinds = ['cell', 'row', 'text', 'step'];
  const titles = { cell: '标记单格', row: '整行变灰', text: '标记选中文字', step: '标记步骤' };
  const contexts = ['page', 'selection', 'link', 'image'];
  let generation = 0;
  let activeMenu = null;
  async function createMenus() {
    await browser.menus.removeAll();
    browser.menus.create({ id: ROOT, title: '52Poké Mark', contexts, documentUrlPatterns: ['https://wiki.52poke.com/*'] });
    for (const kind of kinds) browser.menus.create({ id: `pkm-${kind}`, parentId: ROOT, contexts, title: titles[kind], enabled: false });
    browser.menus.create({ id: 'pkm-separator', parentId: ROOT, contexts, type: 'separator' });
    browser.menus.create({ id: 'pkm-edit', parentId: ROOT, contexts, title: '调整样式与颜色…', enabled: false });
    browser.menus.create({ id: 'pkm-undo', parentId: ROOT, contexts, title: '撤销本页标记操作', enabled: false });
    browser.menus.create({ id: 'pkm-manage', parentId: ROOT, contexts, title: '周目与设置' });
  }
  browser.runtime.onInstalled.addListener(createMenus);
  browser.runtime.onStartup.addListener(createMenus);
  browser.menus.onShown.addListener(async (info, tab) => {
    const version = ++generation;
    activeMenu = null;
    if (!tab?.id || !info.menuIds.includes(ROOT)) return;
    // Disable old actions immediately while the current document is being inspected.
    for (const action of [...kinds, 'edit', 'undo']) browser.menus.update(`pkm-${action}`, { enabled: false }).catch(() => {});
    browser.menus.refresh().catch(() => {});
    try {
      const context = await browser.tabs.sendMessage(tab.id, { type: 'pkm.menu-context', targetElementId: info.targetElementId, selectionText: info.selectionText || '' }, { frameId: info.frameId });
      if (version !== generation || !context) return;
      activeMenu = { tabId: tab.id, frameId: info.frameId, targetElementId: info.targetElementId, token: context.token };
      const updates = kinds.map(kind => browser.menus.update(`pkm-${kind}`, { enabled: !!context.actions[kind], title: context.actions[kind]?.title || titles[kind] }));
      updates.push(browser.menus.update('pkm-edit', { enabled: Object.keys(context.actions).length > 0 }), browser.menus.update('pkm-undo', { enabled: context.valid }));
      await Promise.all(updates);
      if (version === generation) await browser.menus.refresh();
    } catch (_) { /* No content script on this page/frame: keep annotation actions disabled. */ }
  });
  browser.menus.onHidden.addListener(() => { generation++; });
  browser.menus.onClicked.addListener(async (info, tab) => {
    if (!String(info.menuItemId).startsWith('pkm-')) return;
    if (info.menuItemId === 'pkm-manage') { await browser.runtime.openOptionsPage(); return; }
    const selected = activeMenu;
    if (!selected || tab?.id !== selected.tabId || info.frameId !== selected.frameId || info.targetElementId !== selected.targetElementId) return;
    activeMenu = null;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'pkm.menu-action', action: info.menuItemId.slice(4), token: selected.token }, { frameId: info.frameId });
    } catch (_) { /* Navigation closed the original document; never target the new page. */ }
  });
})();
