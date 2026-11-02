(async function () {
  'use strict';
  const root = document.querySelector('#mw-content-text .mw-parser-output') || document.querySelector('.mw-parser-output');
  if (!root || document.querySelector('#pkm-host') || /[?&]action=(edit|submit|history)/.test(location.search)) return;
  const M = PokeModel, A = PokeAnchors;
  const pageKey = M.canonicalPage(location.href, document);
  const host = document.createElement('div'); host.id = 'pkm-host'; host.dataset.pkmUi = '';
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;color:#183d35;color-scheme:light}
    *{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer;border:1px solid #d8e4df;background:#fff;color:#244c42;border-radius:7px;padding:6px 9px}button:hover{background:#e8f4ee;border-color:#86b9a7}button:focus-visible,select:focus-visible{outline:3px solid #d49b32;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}select{max-width:100%;padding:5px;border:1px solid #d5e3db;border-radius:6px;background:#fff;color:#193f34}.primary{background:#187764;color:#fff;border-color:#187764}.primary:hover{background:#0f604f;color:#fff}.muted{color:#6d817b;font-size:11px}.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}[hidden]{display:none!important}
    #dock{position:fixed;right:20px;bottom:20px;z-index:2147483645;width:290px;border-radius:14px;background:#fbfdf9;box-shadow:0 8px 40px #123c3526;border:1px solid #d4e3da;overflow:hidden}#dock header{padding:11px 13px;display:flex;align-items:center;gap:8px;background:#edf4ed}#dock header b{flex:1;font-size:13px}.dot{width:8px;height:8px;border-radius:50%;background:#197862}#body{padding:12px}.line{margin-top:10px}.status{font-size:11px;color:#567367}.warning{color:#ad6320}#list{max-height:260px;overflow:auto;margin:10px -4px 0}.item{border-top:1px solid #e1e9e2;padding:9px 4px}.quote{white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:#36584d;margin:4px 0}.small{font-size:11px;padding:3px 6px}.count{font-variant-numeric:tabular-nums}.item .row{justify-content:space-between}#toolbar{position:fixed;z-index:2147483647;padding:7px;max-width:min(470px,calc(100vw - 16px));background:#fdfefa;border:1px solid #c6dcd0;border-radius:11px;box-shadow:0 4px 22px #15392d30;display:flex;gap:5px;flex-wrap:wrap;align-items:center}#palette{display:flex;gap:4px;border-left:1px solid #dce6df;padding-left:6px}.swatch{width:21px;height:21px;border-radius:50%;padding:0;border:3px solid transparent;box-shadow:inset 0 0 0 1px #0002}.swatch[aria-pressed="true"]{outline:2px solid #264c40;outline-offset:1px}#preview{position:fixed;z-index:2147483644;pointer-events:none;border:2px dashed #19846c;background:#28b08516;border-radius:4px}#toast{position:fixed;z-index:2147483647;bottom:88px;left:50%;transform:translateX(-50%);max-width:80vw;background:#183f35;color:white;padding:10px 16px;border-radius:10px;box-shadow:0 4px 20px #0002}#hint{padding:8px;background:#fff4d9;border-radius:8px;margin-top:10px}.collapse #body{display:none}.collapse{width:210px!important}#dock header button{padding:2px 7px;background:transparent;border:0}.badge{font-size:10px;border:1px solid #d8e5db;padding:1px 5px;border-radius:5px}.empty{padding:12px 0;color:#698276}.error{color:#b94d3b}
  `;
  shadow.append(style);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) { if (key === 'text') node.textContent = value; else if (key.startsWith('on')) node.addEventListener(key.slice(2), value); else node.setAttribute(key, value); }
    for (const child of children) node.append(child);
    return node;
  };
  const preview = el('div', { id: 'preview', hidden: '' });
  const toolbar = el('div', { id: 'toolbar', role: 'toolbar', 'aria-label': '标记工具', hidden: '' });
  const toast = el('div', { id: 'toast', role: 'status', hidden: '' });
  const dock = el('section', { id: 'dock', class: 'collapse', 'aria-label': '52Poké Mark 标记管理' });
  const title = el('b', { text: '52Poké Mark' });
  const expand = el('button', { text: '展开', 'aria-expanded': 'false', onclick: () => {
    const collapsed = dock.classList.toggle('collapse'); expand.textContent = collapsed ? '展开' : '收起'; expand.setAttribute('aria-expanded', String(!collapsed));
  } });
  const header = el('header', {}, [el('span', { class: 'dot' }), title, expand]);
  const profile = el('select', { id: 'profile', 'aria-label': '当前游戏周目', style: 'width:100%', onchange: () => run(async () => { await send({ type: 'profile.select', id: profile.value }); target = null; relink = null; hideToolbar(); await refresh(); }) });
  const counts = el('div', { class: 'line count' }); const status = el('div', { class: 'status line', 'aria-live': 'polite' });
  const hint = el('div', { id: 'hint', hidden: '' }); const list = el('div', { id: 'list' });
  const body = el('div', { id: 'body' }, [profile, counts, status,
    el('div', { class: 'row line' }, [el('button', { text: '撤销', onclick: () => run(async () => { await send({ type: 'undo', pageKey }); await refresh(); say('已撤销'); }) }),
      el('button', { text: '设置 / 新建周目', onclick: () => run(() => send({ type: 'options.open' })) })]),
    el('div', { class: 'muted line', text: '右键 → 52Poké Mark，选择单格、整行变灰或标记选中文字。' }), hint, list]);
  dock.append(header, body); shadow.append(preview, toolbar, dock, toast);
  let state, rendered = { located: new Map(), unresolved: [] }, signature = '', target = null, relink = null;
  let renderTimer, toastTimer, busy = false, refreshGeneration = 0;
  async function send(message) { const response = await browser.runtime.sendMessage(message); if (!response?.ok) throw new Error(response?.error || '扩展暂时不可用，请刷新页面'); return response.data; }
  function say(message, error = false) { clearTimeout(toastTimer); toast.textContent = message; toast.style.background = error ? '#9f4637' : '#183f35'; toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; }, 4500); }
  async function run(action) { if (busy) return; busy = true; try { await action(); } catch (error) { say(error.message, true); } finally { busy = false; } }
  function hideToolbar() { toolbar.hidden = true; preview.hidden = true; }
  function previewElement(element) {
    if (!element?.isConnected) { preview.hidden = true; return; }
    const rect = element.getBoundingClientRect();
    Object.assign(preview.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' }); preview.hidden = false;
  }
  function updatePanel() {
    const active = state.profiles.find(x => x.id === state.activeProfileId);
    title.textContent = '52Poké · ' + (active?.name || '攻略标记');
    title.title = active?.name || '';
    title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    profile.replaceChildren(...state.profiles.map(p => el('option', { value: p.id, text: p.name })));
    profile.value = state.activeProfileId;
    counts.textContent = `${state.marks.length} 处标记 · ${state.marks.filter(M.isComplete).length} 处已完成`;
    const sync = state.sync;
    status.textContent = '✓ 已保存到本机 · ' + (!sync.connected ? 'Drive 未连接' : sync.syncing ? '同步中…' : sync.error ? '同步失败' : sync.syncedRevision < state.revision ? '待同步' : '已同步');
    status.classList.toggle('warning', !!sync.error); status.title = sync.error || (sync.lastSynced ? new Date(sync.lastSynced).toLocaleString() : '');
    hint.hidden = !relink;
    hint.replaceChildren();
    if (relink) hint.append(document.createTextNode('右键新的文字或范围，在 52Poké Mark 中重新定位。 '), el('button', { class: 'small', text: '取消', onclick: () => { relink = null; updatePanel(); } }));
    list.replaceChildren();
    if (!state.marks.length) list.append(el('div', { class: 'empty', text: '这个周目，在本页还没有标记。' }));
    const pending = new Set(rendered.unresolved.map(x => x.id));
    if (pending.size) list.append(el('div', { class: 'warning', text: `有 ${pending.size} 处待重新定位，原记录仍保留。` }));
    for (const mark of [...state.marks].sort((a, b) => Number(pending.has(b.id)) - Number(pending.has(a.id)) || M.compare(b.stamp, a.stamp))) {
      const label = { text: '选区', cell: '单格', row: '整行', step: '步骤' }[mark.kind];
      const labelStyle = mark.kind === 'row' ? '变灰' : { strike: '删除线', underline: '下划线', highlight: '高亮' }[mark.style];
      const item = el('div', { class: 'item', 'data-mark-id': mark.id }, [
        el('div', { class: 'row' }, [el('span', { class: 'badge', text: `${label} · ${labelStyle}`, style: `color:${mark.kind === 'row' ? '#72777d' : M.COLORS[mark.color]}` }), el('span', { class: pending.has(mark.id) ? 'warning' : 'muted', text: pending.has(mark.id) ? '待定位' : '已定位' })]),
        el('div', { class: 'quote', text: mark.anchor.exact.trim(), title: mark.anchor.exact.trim().slice(0, 500) }),
        el('div', { class: 'row' }, [el('button', { class: 'small', text: pending.has(mark.id) ? '重新定位' : '查看位置', onclick: () => {
          if (pending.has(mark.id)) { relink = mark.id; updatePanel(); say('右键新的位置，在 52Poké Mark 菜单中选择重新定位'); }
          else { const found = rendered.located.get(mark.id); const node = mark.kind === 'text' ? root.querySelector(`[data-pkm-mark~="${mark.id}"]`) : found?.element; node?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { previewElement(node); setTimeout(() => { preview.hidden = true; }, 1500); }, 450); }
        } }), el('button', { class: 'small', text: '取消标记', onclick: () => run(async () => { await send({ type: 'mark.delete', id: mark.id }); await refresh(); say('已取消 · 可以撤销'); }) })])]);
      list.append(item);
    }
  }
  function renderMarks(force = false) {
    const next = JSON.stringify(state.marks);
    if (next !== signature || force) {
      observer.disconnect(); rendered = A.render(root, state.marks); signature = next;
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
    updatePanel();
  }
  async function refresh() {
    const generation = ++refreshGeneration;
    const next = await send({ type: 'state.get', pageKey });
    if (generation !== refreshGeneration) return;
    if (state && next.activeProfileId !== state.activeProfileId) { target = null; relink = null; hideToolbar(); }
    state = next; renderMarks();
  }
  const observer = new MutationObserver(() => { clearTimeout(renderTimer); renderTimer = setTimeout(() => { if (state) renderMarks(true); }, 350); });
  function existing(kind, anchor) {
    return state.marks.find(mark => {
      if (mark.kind !== kind) return false;
      const match = rendered.located.get(mark.id);
      return match ? match.start === anchor.start && match.end === anchor.start + anchor.exact.length : mark.anchor.exact === anchor.exact && mark.anchor.path === anchor.path && mark.anchor.start === anchor.start;
    });
  }
  async function apply(kind, element) {
    if (!target || target.profileId !== state.activeProfileId) throw new Error('周目或目标已变化，请重新右键选择');
    if (kind !== 'text' && (!element?.isConnected || !root.contains(element))) throw new Error('目标已变化，请重新右键选择');
    const anchor = kind === 'text' ? target.anchor : A.capture(root, element, kind);
    const prior = relink ? state.marks.find(m => m.id === relink) : existing(kind, anchor);
    const wasRelink = !!relink;
    if (prior && !wasRelink && (kind === 'row' || (prior.style === state.prefs.style && prior.color === state.prefs.color))) await send({ type: 'mark.delete', id: prior.id });
    else await send({ type: 'mark.save', id: prior?.id, profileId: state.activeProfileId, pageKey, title: document.querySelector('#firstHeading')?.textContent?.trim().slice(0, 500) || document.title.slice(0, 500),
      url: location.href.split('#')[0], anchor, kind, style: kind === 'row' ? 'strike' : wasRelink ? prior.style : state.prefs.style, color: wasRelink ? prior.color : state.prefs.color });
    relink = null; target = null; hideToolbar(); window.getSelection()?.removeAllRanges();
    await refresh(); say(wasRelink ? '已重新定位' : '已保存 · 可以撤销');
  }
  function showToolbar(rect) {
    if (!state || !target) return;
    toolbar.replaceChildren();
    const buttons = [];
    if (target.kind === 'text') buttons.push(['选区', 'text', null]);
    else {
      const cell = target.element.closest('td,th'), row = target.element.closest('tr'), step = target.element.closest('li,p,dd,dt');
      if (cell && root.contains(cell)) buttons.push(['单格', 'cell', cell]);
      if (row && root.contains(row)) buttons.push(['整行变灰', 'row', row]);
      if (step && root.contains(step)) buttons.push(['步骤', 'step', step]);
    }
    buttons.forEach(([label, kind, element], i) => toolbar.append(el('button', { class: i === 0 ? 'primary' : '', text: relink ? '重新定位 · ' + label : label,
      title: `预览并标记${label}；相同样式再次点击可取消`, onmouseenter: () => previewElement(element), onfocus: () => previewElement(element), onclick: () => run(() => apply(kind, element)) })));
    const mode = el('select', { 'aria-label': '标记方式', onchange: () => run(async () => { state.prefs.style = mode.value; await send({ type: 'prefs.save', style: mode.value }); }) });
    for (const [value, label] of [['strike', '删除线'], ['underline', '下划线'], ['highlight', '高亮']]) mode.append(el('option', { value, text: label }));
    mode.value = state.prefs.style; toolbar.append(mode);
    const palette = el('div', { id: 'palette', role: 'group', 'aria-label': '标记颜色' });
    for (const [color, hex] of Object.entries(M.COLORS)) palette.append(el('button', { class: 'swatch', style: `background:${hex}`, title: state.prefs.labels[color], 'aria-label': state.prefs.labels[color], 'aria-pressed': String(state.prefs.color === color), onclick: () => run(async () => {
      state.prefs.color = color; await send({ type: 'prefs.save', color }); for (const button of palette.children) button.setAttribute('aria-pressed', String(button.style.backgroundColor === palette.querySelector(`[data-color="${color}"]`)?.style.backgroundColor));
    }), 'data-color': color }));
    toolbar.append(palette, el('button', { text: '×', 'aria-label': '关闭标记工具', onclick: () => { hideToolbar(); target = null; } }));
    toolbar.hidden = false;
    const width = toolbar.getBoundingClientRect().width;
    const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
    const height = toolbar.getBoundingClientRect().height;
    const top = rect.bottom + height + 12 < innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - height - 5);
    Object.assign(toolbar.style, { left: left + 'px', top: top + 'px' });
  }
  toolbar.addEventListener('mouseleave', () => { preview.hidden = true; });
  function prepareMenu(message) {
    hideToolbar(); target = null;
    const element = browser.menus.getTargetElement(message.targetElementId);
    const actions = {};
    if (!state || !element || !root.contains(element) || element.closest('input,textarea,select,button,[contenteditable="true"],.mw-editsection')) return { valid: false, actions };
    const token = M.id();
    target = { kind: 'element', element, token, profileId: state.activeProfileId, rect: element.getBoundingClientRect() };
    const selection = window.getSelection();
    if (message.selectionText && selection?.rangeCount && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      if (root.contains(range.startContainer) && root.contains(range.endContainer)) {
        target.anchor = A.capture(root, range, 'text'); target.kind = 'text'; target.rect = range.getBoundingClientRect();
      }
    }
    // Capture stable semantic containers, not annotation spans that a rerender may replace.
    target.elements = { cell: element.closest('td,th'), row: element.closest('tr'), step: element.closest('li,p,dd,dt') };
    const names = { cell: '单格', row: '整行', text: '选中文字', step: '步骤' };
    for (const kind of M.KINDS) {
      const node = target.elements[kind];
      if (kind === 'text' ? !target.anchor : !node || !root.contains(node) || !node.textContent.trim()) continue;
      const prior = kind === 'text' ? existing(kind, target.anchor) : state.marks.find(mark => mark.kind === kind && rendered.located.get(mark.id)?.element === node);
      const removing = prior && (kind === 'row' || (prior.style === state.prefs.style && prior.color === state.prefs.color));
      const title = relink ? `重新定位到${names[kind]}` : kind === 'row' ? (prior ? '取消整行变灰' : '整行变灰') : removing ? `取消${names[kind]}标记` : `标记${names[kind]}`;
      actions[kind] = { title };
    }
    target.element = target.elements.cell || target.elements.step || element;
    return { valid: true, token, actions };
  }
  async function menuAction(message) {
    if (!target || target.token !== message.token || target.profileId !== state.activeProfileId) throw new Error('目标已变化，请重新右键选择');
    if (message.action === 'edit') { showToolbar(target.rect); return; }
    if (message.action === 'undo') { await send({ type: 'undo', pageKey }); await refresh(); say('已撤销'); return; }
    if (M.KINDS.includes(message.action)) await apply(message.action, target.elements[message.action]);
  }
  document.addEventListener('contextmenu', hideToolbar);
  document.addEventListener('pointerdown', event => { if (!event.composedPath().includes(host)) hideToolbar(); });
  document.addEventListener('keyup', event => {
    if (event.key === 'Escape') { hideToolbar(); target = null; relink = null; if (state) updatePanel(); }
  });
  window.addEventListener('scroll', hideToolbar, { passive: true, capture: true });
  window.addEventListener('resize', hideToolbar, { passive: true });
  browser.runtime.onMessage.addListener(message => {
    if (message.type === 'pkm.menu-context') {
      try { return Promise.resolve(prepareMenu(message)); }
      catch (error) { say(error.message, true); return Promise.resolve({ valid: false, actions: {} }); }
    }
    if (message.type === 'pkm.menu-action') return run(() => menuAction(message));
    if (message.type === 'pkm.changed') refresh().catch(error => say(error.message, true));
    if (message.type === 'pkm.open-panel') { dock.classList.remove('collapse'); expand.textContent = '收起'; expand.setAttribute('aria-expanded', 'true'); }
  });
  try { await refresh(); } catch (error) { say(error.message, true); }
})();
