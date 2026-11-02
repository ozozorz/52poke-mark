const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const root = path.resolve(__dirname, '..');
process.env.SE_CACHE_PATH = path.join(root, '.local', 'selenium');
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const UUID = '7ef13c58-b61e-496b-a8be-44c4ffae18de';
const route = 'https://wiki.52poke.com/wiki/%EF%BC%92%EF%BC%90%EF%BC%96%E5%8F%B7%E9%81%93%E8%B7%AF%EF%BC%88%E7%A5%9E%E5%A5%A5%EF%BC%89';
const flow = 'https://wiki.52poke.com/zh-hans/%E9%99%84%E5%BD%95:%E5%AF%B6%E5%8F%AF%E5%A4%A2_%E6%99%B6%E7%87%A6%E9%91%BD%E7%9F%B3%EF%BC%8F%E6%98%8E%E4%BA%AE%E7%8F%8D%E7%8F%A0%E6%B5%81%E7%A8%8B';
const optionsURL = `moz-extension://${UUID}/options.html`;
const version = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version;
fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
let driver;
async function openOptions() {
  await driver.setContext('chrome');
  try { await driver.executeScript('gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});', optionsURL); }
  finally { await driver.setContext('content'); }
  await driver.wait(until.elementLocated(By.id('profile')), 20000);
}
async function waitScript(script, timeout = 30000) {
  try { return await driver.wait(async () => driver.executeScript(script), timeout); }
  catch (error) {
    console.error('WAIT FAILED:', script);
    console.error(await driver.executeScript('const h=document.querySelector("#pkm-host");return {url:location.href,host:!!h,shadow:!!h?.shadowRoot,html:h?.shadowRoot?.innerHTML?.slice(-7000)};'));
    throw error;
  }
}
async function snap(name) { fs.writeFileSync(path.join(__dirname, 'artifacts', name + '.png'), Buffer.from(await driver.takeScreenshot(), 'base64')); }
async function state() { return driver.executeAsyncScript('const done=arguments[arguments.length-1]; browser.runtime.sendMessage({type:"state.get"}).then(done);'); }
async function shadowClick(label) { await driver.executeScript('const s=document.querySelector("#pkm-host").shadowRoot; const b=[...s.querySelectorAll("button")].find(b=>b.textContent===arguments[0]); if(!b)throw Error("Missing button "+arguments[0]); b.click();', label); }
async function contextAction(element, label) {
  await driver.actions().contextClick(element).perform();
  await driver.setContext('chrome');
  try {
    await driver.wait(async () => driver.executeScript('return [...document.querySelectorAll("#contentAreaContextMenu menu")].some(m=>m.getAttribute("label")==="52Poké Mark")'), 10000);
    await driver.executeScript('const m=[...document.querySelectorAll("#contentAreaContextMenu menu")].find(m=>m.getAttribute("label")==="52Poké Mark");m.openMenu(true);');
    await driver.wait(async () => driver.executeScript('return [...document.querySelectorAll("#contentAreaContextMenu menuitem")].some(m=>m.getAttribute("label")===arguments[0]&&!m.disabled);', label), 10000);
    await driver.executeScript('const m=[...document.querySelectorAll("#contentAreaContextMenu menuitem")].find(m=>m.getAttribute("label")===arguments[0]&&!m.disabled);m.doCommand();document.getElementById("contentAreaContextMenu").hidePopup();', label);
  } catch (error) {
    console.error('CONTEXT MENU:', await driver.executeScript('return [...document.querySelectorAll("#contentAreaContextMenu menu,#contentAreaContextMenu menuitem")].map(x=>({label:x.getAttribute("label"),disabled:x.disabled,hidden:x.hidden}));'));
    throw error;
  } finally { await driver.setContext('content'); }
}
(async () => {
  const options = new firefox.Options().setBinary('C:\\Program Files\\Mozilla Firefox\\firefox.exe').addArguments('-headless')
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ '52poke-mark@local.example': UUID }))
    .setPreference('browser.shell.checkDefaultBrowser', false);
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
  await driver.manage().window().setRect({ width: 1440, height: 1080 });
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 60000 });
  console.log('Firefox', (await driver.getCapabilities()).get('browserVersion'));
  await driver.installAddon(path.join(root, 'dist', `52poke-mark-${version}-unsigned.xpi`), true);
  await openOptions();
  await driver.wait(until.elementLocated(By.css('#profile option')), 20000);
  const initial = await state(); assert.equal(initial.ok, true); assert.equal(initial.data.prefs.style, 'strike');
  await snap('options'); console.log('PASS settings load, default profile and strike style');
  await driver.get(route);
  await waitScript('return !!document.querySelector("#pkm-host")?.shadowRoot.querySelector("#profile option")');
  console.log('PASS content script on live route page');
  // Pick a small real item cell with a link, avoiding infobox and navigation tables.
  const cell = await driver.executeScript(`const r=document.querySelector('#mw-content-text .mw-parser-output'); const candidates=[...r.querySelectorAll('td')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().height>0); const c=candidates.find(x=>x.textContent.trim()==='神奇糖果'&&x.querySelector('a'))||candidates.find(x=>x.textContent.trim().length>3&&x.textContent.trim().length<15&&x.querySelector('a')&&!x.querySelector('table')); c.dataset.testCell='yes'; c.scrollIntoView({block:'center'}); return c;`);
  await driver.actions().move({ origin: cell }).perform();
  await driver.sleep(300);
  assert.equal(await driver.executeScript('return document.querySelector("#pkm-host").shadowRoot.querySelector("#toolbar").hidden'), true);
  console.log('PASS pointer hover does not open a toolbar');
  await contextAction(cell, '标记单格');
  await waitScript('return document.querySelector("[data-test-cell] [data-pkm-mark]")?.style.textDecorationLine==="line-through"');
  assert.ok(await driver.executeScript('return !!document.querySelector("[data-test-cell] a[href]")'));
  await shadowClick('展开'); await snap('route-cell'); console.log('PASS real route cell mark, original link remains');
  const geometry = await driver.executeScript('const r=document.querySelector("[data-test-cell]").closest("tr");return {height:r.getBoundingClientRect().height,width:r.getBoundingClientRect().width,cells:r.cells.length};');
  await contextAction(cell, '整行变灰');
  await waitScript('return !!document.querySelector("[data-test-cell]").closest("tr").dataset.pkmRow');
  const grayed = await driver.executeScript('const c=document.querySelector("[data-test-cell]"),r=c.closest("tr");return {height:r.getBoundingClientRect().height,width:r.getBoundingClientRect().width,cells:r.cells.length,background:getComputedStyle(c).backgroundColor,filter:getComputedStyle(c).filter,invalid:r.querySelectorAll(":scope > span").length};');
  assert.equal(grayed.height, geometry.height); assert.equal(grayed.width, geometry.width); assert.equal(grayed.cells, geometry.cells); assert.equal(grayed.invalid, 0); assert.equal(grayed.background, 'rgb(227, 229, 232)'); assert.equal(grayed.filter, 'grayscale(1)');
  await snap('route-gray-row');
  await contextAction(cell, '取消整行变灰');
  await waitScript('return !document.querySelector("tr[data-pkm-row]")');
  assert.ok(await driver.executeScript('return !!document.querySelector("[data-test-cell] [data-pkm-mark]")'));
  await contextAction(cell, '撤销本页标记操作'); await waitScript('return !!document.querySelector("tr[data-pkm-row]")');
  await contextAction(cell, '取消整行变灰'); await waitScript('return !document.querySelector("tr[data-pkm-row]")');
  console.log('PASS native right-click row gray/toggle/undo preserve geometry and cell marks');
  await driver.navigate().refresh();
  await waitScript('return !!document.querySelector("[data-pkm-mark]")'); console.log('PASS reload restores marks');
  // Selecting across a link exercises range splitting without replacing the original link element.
  const selectionLink = await driver.executeScript(`const p=[...document.querySelectorAll('#mw-content-text .mw-parser-output p')].find(p=>p.textContent.trim().length>35&&p.querySelector('a'));p.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return p.querySelector('a');`);
  await driver.sleep(250); assert.equal(await driver.executeScript('return document.querySelector("#pkm-host").shadowRoot.querySelector("#toolbar").hidden'), true);
  await contextAction(selectionLink, '调整样式与颜色…');
  await waitScript('return [...document.querySelector("#pkm-host").shadowRoot.querySelectorAll("#toolbar button")].some(x=>x.textContent==="选区")');
  await driver.executeScript('const s=document.querySelector("#pkm-host").shadowRoot;const mode=s.querySelector("#toolbar select");mode.value="highlight";mode.dispatchEvent(new Event("change"));');
  await driver.sleep(400);
  await shadowClick('选区');
  await waitScript('return [...document.querySelectorAll("[data-pkm-mark]")].some(x=>x.style.backgroundColor)'); console.log('PASS multi-node selection and highlight');
  await openOptions(); const first = (await state()).data; assert.equal(first.marks.length, 2);
  await driver.findElement(By.id('profile-name')).clear(); await driver.findElement(By.id('profile-name')).sendKeys('明亮珍珠 · 二周目'); await driver.findElement(By.id('new-profile')).click();
  await waitScript('return document.getElementById("profile").options.length===2');
  const second = (await state()).data; assert.notEqual(first.activeProfileId, second.activeProfileId); assert.equal(second.marks.length, 0);
  await driver.get(route); await waitScript('return !!document.querySelector("#pkm-host")?.shadowRoot.querySelector("#profile option")'); assert.equal((await driver.findElements(By.css('[data-pkm-mark]'))).length, 0); console.log('PASS playthrough isolation');
  await driver.executeScript('const p=document.querySelector("#pkm-host").shadowRoot.querySelector("#profile");p.value=arguments[0];p.dispatchEvent(new Event("change"));', first.activeProfileId);
  await waitScript('return !!document.querySelector("[data-pkm-mark]")');
  await shadowClick('展开'); await shadowClick('撤销');
  await waitScript('return ![...document.querySelectorAll("[data-pkm-mark]")].some(x=>x.style.backgroundColor)'); console.log('PASS undo in correct playthrough');
  await driver.get(flow); await waitScript('return !!document.querySelector("#pkm-host")?.shadowRoot.querySelector("#profile option")');
  const step = await driver.executeScript(`const r=document.querySelector('#mw-content-text .mw-parser-output');const c=[...r.querySelectorAll('li')].find(x=>x.getClientRects().length&&x.textContent.includes('选择主角')&&!x.querySelector('li')); if(!c)throw Error('No walkthrough step');c.dataset.testStep='yes';c.scrollIntoView({block:'center'});return c;`);
  await contextAction(step, '标记步骤');
  await waitScript('return !!document.querySelector("[data-test-step] [data-pkm-mark]")'); await snap('walkthrough'); console.log('PASS supplied zh-hans walkthrough');
  await driver.executeScript('document.querySelector("[data-test-step]").textContent="这里的攻略已经更新，先拿到你的背包。";');
  await waitScript('return document.querySelector("#pkm-host").shadowRoot.querySelector("#list").textContent.includes("待定位")');
  await shadowClick('展开'); await shadowClick('重新定位');
  await contextAction(step, '重新定位到步骤');
  await waitScript('return !!document.querySelector("[data-test-step] [data-pkm-mark]")'); console.log('PASS changed content stays pending and manual relocation works');
  await openOptions();
  const exported = await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:"backup.export"}).then(done);');
  assert.equal(exported.ok, true); assert.equal(exported.data.schema, 1); assert.equal(Object.values(exported.data.profiles).length, 2); assert.equal(JSON.stringify(exported.data).includes('clientSecret'), false);
  console.log('PASS export has all profiles and no credentials');
  await snap('options-populated');
})().catch(async error => { console.error(error); if (driver) await snap('failure').catch(() => {}); process.exitCode = 1; }).finally(async () => { if (driver) await driver.quit(); });
