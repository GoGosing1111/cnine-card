import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8902',out=path.resolve('../qa/live-connections-2091/ui');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Isolated local account QA only');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));
 const api=p=>page.evaluate(async p=>{const r=await fetch('/api/'+p,{headers:{authorization:'Bearer local-account-7'}});if(!r.ok)throw Error(await r.text());return r.json();},p);
 const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'viewport overflow');
 await page.goto(base+'/mercenary-hangar/');await page.locator('#open:not([disabled])').waitFor();
 assert.equal(await page.locator('#roster [data-code]').count(),14);
 assert.match(await page.locator('#skill-list').textContent(),/성검의 맹세/);
 const before=await api('mercenaries/v3/state');let committed;
 // Lose the response after the actual local transaction committed. The next
 // page must recover the durable receipt without charging or granting twice.
 await page.route('**/api/mercenary-cards/open-batch',async route=>{const response=await route.fetch();assert.equal(response.status(),200);committed=await response.json();await route.abort('failed');},{times:1});
 await page.selectOption('#draw-count','10');await page.click('#open');
 await page.waitForFunction(()=>document.getElementById('message').textContent.includes('fetch'));
 assert.equal(committed.draws.length,10);assert.ok(committed.draws.every(d=>d.duplicate));
 const charged=await api('mercenaries/v3/state');assert.equal(Number(before.coin)-Number(charged.coin),5000000000);
 await page.reload();await page.locator('#open:not([disabled])').waitFor();await page.click('#open');
 await page.locator('.mercenary-pack-stage[data-state="playing"]').waitFor({timeout:60000});
 await page.locator('[data-pause]').click();assert.equal(await page.locator('.mercenary-pack-stage').getAttribute('data-state'),'paused');await page.locator('[data-pause]').click();
 await page.locator('.mercenary-pack-stage[data-state="revealed"]').waitFor();
 await fit();await page.screenshot({path:path.join(out,'opening-1440.png'),fullPage:true});
 await page.locator('[data-skip]').click();await page.locator('.mercenary-pack-stage[data-state="complete"]').waitFor({state:'attached'});
 assert.equal(await page.locator('.mercenary-pack-results li').count(),10);assert.match(await page.locator('.mercenary-pack-results').textContent(),/중복 \+1/);
 assert.equal(Number((await api('mercenaries/v3/state')).coin),Number(charged.coin));
 await page.locator('[data-close]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('cnine.mercenary.pack.pending:7')),null);
 results.push('10 real opens; 5 billion coin once; ten duplicates; lost response receipt recovery; pause/skip');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await fit();await page.screenshot({path:path.join(out,`hangar-${width}.png`),fullPage:true});
  await page.evaluate(receipt=>void globalThis.MercenaryPack.showReceipt(receipt),committed);
  await page.locator('.mercenary-pack-stage[data-state="playing"]').waitFor({timeout:30000});await page.locator('[data-skip]').click();await fit();
  await page.screenshot({path:path.join(out,`receipt-${width}.png`),fullPage:true});await page.locator('[data-close]').click();
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-code="V-004"]').click();assert.match(await page.locator('#skill-list').textContent(),/루비 최후통첩/);await page.click('#equip');
 await page.waitForFunction(()=>document.getElementById('slot').textContent.includes('베스페라'));
 results.push('actual S/SS CMS skills visible; SS V-004 saved in separate slot');
 for(const [content,selection,width]of[['scrapyard','OUTER',1440],['scrapyard','CORE',390],['scrapyard','FURNACE',1440],['cow-room','PASTURE',390]]){
  await page.setViewportSize({width,height:1000});await page.goto(`${base}/pve-v3/?content=${content}`);await page.locator('#start:not([disabled])').waitFor();await page.selectOption('#difficulty',selection);
  const responsePromise=page.waitForResponse(r=>r.url().endsWith(`/api/${content}/v3/run`)&&r.request().method()==='POST');await page.click('#start');const response=await responsePromise;assert.equal(response.status(),200);const run=await response.json();
  await page.waitForFunction(()=>document.getElementById('battle-frame').contentWindow.PveV3BattleBridge?.diagnostics().formation?.mercenaries?.length===1,{timeout:60000});
  const d=await page.evaluate(()=>document.getElementById('battle-frame').contentWindow.PveV3BattleBridge.diagnostics());assert.equal(d.cards,5);assert.equal(d.canvasCount,1);assert.equal(d.formation.layoutVersion,'UNIFORM_LATTICE_V2');
  await fit();await page.screenshot({path:path.join(out,`${content}-${selection}-${width}.png`),fullPage:true});
  if(content==='cow-room'){
   const portals=(await api('cow-room/v3/state')).portals.available;
   await page.reload();await page.locator('#speed:not([disabled])').waitFor({timeout:60000});assert.equal((await api('cow-room/v3/state')).portals.available,portals);
  }
  await page.locator('#speed:not([disabled])').waitFor();await page.click('#speed');
  console.log(`${content}/${selection}: actual 5+1 account battle; waiting for result`);
  await page.locator('#result:not([hidden])').waitFor({timeout:180000});assert.match(await page.locator('#result-title').textContent(),/작전 성공/);
  await page.click('#acknowledge');await page.locator('#start:not([disabled])').waitFor();
  assert.ok(run.requestId);results.push(`${content}/${selection}: real saved loadout, uniform grid, result/reward${content==='cow-room'?', recovery with one portal':''}`);
  await fs.writeFile(path.join(out,'qa.json'),JSON.stringify({results,errors},null,2));
 }
 await page.goto(base+'/__qa/connections-cms');await page.getByRole('button',{name:'V3 실게임 연결',exact:true}).click();await page.getByText('실제 운영 CMS를 조회했습니다.',{exact:true}).waitFor();assert.equal(await page.locator('#view-v3-connections tbody tr').count(),14);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await fit();await page.screenshot({path:path.join(out,`cms-${width}.png`),fullPage:true});}results.push('CMS real account URLs and 14 assignment rows');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,results}));
}finally{await fs.writeFile(path.join(out,'qa.json'),JSON.stringify({results,errors},null,2));await browser.close();}
