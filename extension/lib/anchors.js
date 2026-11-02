(function (global) {
  'use strict';
  const EXCLUDE = 'script,style,noscript,textarea,input,select,button,[contenteditable="true"],.mw-editsection,.mw-collapsible-toggle,[data-pkm-ui]';
  function index(root) {
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    const nodes = []; const bounds = new WeakMap(); let node; let text = '';
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest(EXCLUDE)) continue;
      const entry = { node, start: text.length, end: text.length + node.length }; nodes.push(entry);
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const bound = bounds.get(parent);
        if (bound) bound.end = entry.end; else bounds.set(parent, { start: entry.start, end: entry.end });
        if (parent === root) break;
      }
      text += node.data;
    }
    return { root, nodes, text, bounds };
  }
  function plain(element) { return index(element).text; }
  function indexedText(idx, element) { const b = idx.bounds.get(element); return b ? idx.text.slice(b.start, b.end) : ''; }
  function path(root, element) {
    const parts = [];
    while (element && element !== root) {
      const tag = element.localName;
      const siblings = [...element.parentElement.children].filter(x => x.localName === tag);
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(element) + 1})`);
      element = element.parentElement;
    }
    return parts.join(' > ');
  }
  function section(root, element) {
    let last = '';
    for (const heading of root.querySelectorAll('h2,h3,h4,h5,h6')) {
      if (heading === element || heading.contains(element)) { last = heading.querySelector('[id]')?.id || heading.id || heading.textContent.trim(); break; }
      if (heading.compareDocumentPosition(element) & 4) last = heading.querySelector('[id]')?.id || heading.id || heading.textContent.trim();
      else break;
    }
    return last.slice(0, 500);
  }
  function tableInfo(root, element, idx) {
    const table = element.closest('table');
    if (!table) return null;
    const row = element.closest('tr'); const cell = element.closest('td,th');
    return { index: [...root.querySelectorAll('table')].indexOf(table), row: Math.max(0, row?.rowIndex || 0), column: Math.max(0, cell?.cellIndex || 0),
      header: [...table.querySelectorAll('th')].filter(x => x.closest('table') === table).slice(0, 12).map(x => idx ? indexedText(idx, x) : plain(x)).join('|').slice(0, 5000),
      rowText: (row ? (idx ? indexedText(idx, row) : plain(row)) : '').slice(0, 50000) };
  }
  function rangeOffsets(idx, range) {
    const before = range.cloneRange(); before.selectNodeContents(idx.root); before.setEnd(range.startContainer, range.startOffset);
    const through = range.cloneRange(); through.selectNodeContents(idx.root); through.setEnd(range.endContainer, range.endOffset);
    // Clone contents uses the same excluded-node rules as indexing, including selection across links.
    const count = fragment => { const holder = idx.root.ownerDocument.createElement('div'); holder.append(fragment); return plain(holder).length; };
    return { start: count(before.cloneContents()), end: count(through.cloneContents()) };
  }
  function capture(root, target, kind) {
    const idx = index(root); let start; let end; let element;
    if (kind === 'text') {
      ({ start, end } = rangeOffsets(idx, target));
      element = target.startContainer.nodeType === 1 ? target.startContainer : target.startContainer.parentElement;
    } else {
      element = target;
      const bound = idx.bounds.get(element);
      if (!bound) throw new Error('这个范围没有可标记的文字');
      ({ start, end } = bound);
    }
    const exact = idx.text.slice(start, end);
    if (!exact.trim()) throw new Error('请选中一些文字');
    if (exact.length > 50000) throw new Error('选区太长，请分段标记');
    return { exact, start, prefix: idx.text.slice(Math.max(0, start - 64), start), suffix: idx.text.slice(end, end + 64),
      path: path(root, element), section: section(root, element), table: tableInfo(root, element, idx) };
  }
  function rangeFor(idx, start, end) {
    const first = idx.nodes.find(x => x.end > start);
    const last = idx.nodes.find(x => x.end >= end && x.start < end);
    if (!first || !last) return null;
    const range = idx.root.ownerDocument.createRange();
    range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start);
    return range;
  }
  function contextScore(anchor, idx, start, end, element) {
    let score = 0;
    if (anchor.prefix && idx.text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix) score += 24;
    if (anchor.suffix && idx.text.slice(end, end + anchor.suffix.length) === anchor.suffix) score += 24;
    if (anchor.section && section(idx.root, element) === anchor.section) score += 12;
    if (anchor.table) {
      const info = tableInfo(idx.root, element, idx);
      if (info) {
        if (anchor.table.rowText && info.rowText === anchor.table.rowText) score += 22;
        if (anchor.table.header && info.header === anchor.table.header) score += 10;
        if (info.column === anchor.table.column) score += 2;
      }
    }
    // Path and offset are weak hints only; never enough to resolve duplicate content.
    if (path(idx.root, element) === anchor.path) score += 2;
    if (start === anchor.start) score += 1;
    return score;
  }
  function resolve(root, anchor, kind, existingIndex) {
    const idx = existingIndex || index(root); const candidates = [];
    if (kind === 'text') {
      let start = idx.text.indexOf(anchor.exact);
      while (start !== -1 && candidates.length < 3000) {
        const end = start + anchor.exact.length;
        const range = rangeFor(idx, start, end);
        const element = range.startContainer.parentElement;
        candidates.push({ start, end, range, element, score: contextScore(anchor, idx, start, end, element) });
        start = idx.text.indexOf(anchor.exact, start + 1);
      }
    } else {
      const selector = { cell: 'td,th', row: 'tr', step: 'li,p,dd,dt' }[kind];
      for (const element of root.querySelectorAll(selector)) {
        if (element.closest(EXCLUDE) || indexedText(idx, element) !== anchor.exact) continue;
        const bound = idx.bounds.get(element);
        if (!bound) continue;
        const { start, end } = bound;
        candidates.push({ start, end, element, range: rangeFor(idx, start, end), score: contextScore(anchor, idx, start, end, element) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    if (candidates.length > 1 && candidates[0].score - candidates[1].score < 8) return null;
    if (candidates[0].score < 10 && anchor.exact.trim().length < 12) return null;
    return candidates[0];
  }
  function clear(root) {
    for (const row of root.querySelectorAll('tr[data-pkm-row]')) row.removeAttribute('data-pkm-row');
    const parents = new Set();
    for (const span of root.querySelectorAll('span[data-pkm-mark]')) {
      parents.add(span.parentNode); span.replaceWith(...span.childNodes);
    }
    for (const parent of parents) parent.normalize();
  }
  function render(root, marks) {
    clear(root); const located = new Map(); const unresolved = [];
    if (!marks.length) return { located, unresolved };
    const idx = index(root);
    const intervals = [];
    for (const mark of marks) {
      const result = resolve(root, mark.anchor, mark.kind, idx);
      if (!result) { unresolved.push(mark); continue; }
      located.set(mark.id, result);
      if (mark.kind === 'row') result.element.setAttribute('data-pkm-row', mark.id);
      else intervals.push({ ...result, mark });
    }
    for (const entry of idx.nodes) {
      // Wrapping whitespace between cells would create anonymous table cells in Firefox.
      if (!entry.node.data.trim() && /^(TABLE|THEAD|TBODY|TFOOT|TR|COLGROUP)$/.test(entry.node.parentElement.tagName)) continue;
      const overlaps = intervals.filter(x => x.start < entry.end && x.end > entry.start);
      if (!overlaps.length) continue;
      const cuts = [...new Set([entry.start, entry.end, ...overlaps.flatMap(x => [Math.max(x.start, entry.start), Math.min(x.end, entry.end)])])].sort((a, b) => a - b);
      const fragment = root.ownerDocument.createDocumentFragment();
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1]; const value = entry.node.data.slice(a - entry.start, b - entry.start);
        const active = overlaps.filter(x => x.start <= a && x.end >= b).map(x => x.mark).sort((x, y) => global.PokeModel.compare(x.stamp, y.stamp));
        if (!active.length) { fragment.append(value); continue; }
        const span = root.ownerDocument.createElement('span');
        span.dataset.pkmMark = active.map(x => x.id).join(' '); span.textContent = value;
        const decorations = [...new Set(active.map(x => ({ strike: 'line-through', underline: 'underline' })[x.style]).filter(Boolean))];
        const newest = active.at(-1); const highlight = active.filter(x => x.style === 'highlight').at(-1);
        span.style.setProperty('text-decoration-line', decorations.join(' ') || 'none', 'important');
        span.style.setProperty('text-decoration-color', global.PokeModel.COLORS[newest.color], 'important');
        span.style.setProperty('text-decoration-thickness', '2px', 'important');
        span.style.setProperty('text-underline-offset', '3px', 'important');
        if (highlight) span.style.setProperty('background-color', global.PokeModel.COLORS[highlight.color] + '4d', 'important');
        fragment.append(span);
      }
      entry.node.replaceWith(fragment);
    }
    return { located, unresolved };
  }
  global.PokeAnchors = { index, plain, capture, resolve, render, clear, section, tableInfo, rangeFor, rangeOffsets };
  if (typeof module !== 'undefined') module.exports = global.PokeAnchors;
})(globalThis);
