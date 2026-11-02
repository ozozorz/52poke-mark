'use strict';
globalThis.PokeUI = {
  $: id => document.getElementById(id),
  async send(message) { const reply = await browser.runtime.sendMessage(message); if (!reply?.ok) throw new Error(reply?.error || '扩展暂时不可用'); return reply.data; },
  status(state) {
    const sync = state.sync;
    if (!sync.connected) return '✓ 已保存到本机 · Drive 未连接';
    if (sync.syncing) return '✓ 已保存到本机 · 正在同步…';
    if (sync.error) return '✓ 已保存到本机 · ' + sync.error;
    if (sync.syncedRevision < state.revision) return '✓ 已保存到本机 · 等待同步';
    return '✓ 已保存 · 已同步 ' + (sync.lastSynced ? new Date(sync.lastSynced).toLocaleString() : '');
  },
  option(value, label) { const option = document.createElement('option'); option.value = value; option.textContent = label; return option; }
};
