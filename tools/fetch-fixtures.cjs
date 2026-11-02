const fs = require('node:fs/promises');
const path = require('node:path');
const pages = {
  'route206.html': 'https://wiki.52poke.com/wiki/２０６号道路（神奥）',
  'walkthrough.html': 'https://wiki.52poke.com/zh-hans/附录:寶可夢_晶燦鑽石／明亮珍珠流程'
};
(async () => {
  for (const [name, url] of Object.entries(pages)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
    const html = await response.text();
    if (!html.includes('mw-parser-output')) throw Error('No wiki content: ' + name);
    await fs.writeFile(path.join(__dirname, '..', 'tests', name), html); console.log('Saved test fixture:', name);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
