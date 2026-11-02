'use strict';
const { $, send } = PokeUI;
async function refresh() {
  const state = await send({ type: 'state.get' });
  $('profile').replaceChildren(...state.profiles.map(p => PokeUI.option(p.id, p.name))); $('profile').value = state.activeProfileId;
  $('status').textContent = PokeUI.status(state); $('status').className = 'status' + (state.sync.error ? ' error' : '');
  $('marks').textContent = state.marks.length; $('strikes').textContent = state.marks.filter(m => m.kind === 'row' || m.style === 'strike').length;
  $('pages').textContent = new Set(state.marks.map(m => m.pageKey)).size;
}
function error(e) { $('message').textContent = e.message; }
$('profile').addEventListener('change', async () => { try { await send({ type: 'profile.select', id: $('profile').value }); await refresh(); } catch (e) { error(e); } });
$('manage').addEventListener('click', () => browser.runtime.openOptionsPage());
$('panel').addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try { await browser.tabs.sendMessage(tab.id, { type: 'pkm.open-panel' }); window.close(); }
  catch (_) { $('message').textContent = '请先打开 52poke 百科页面；已打开的页面可刷新一次。'; }
});
refresh().catch(error);
