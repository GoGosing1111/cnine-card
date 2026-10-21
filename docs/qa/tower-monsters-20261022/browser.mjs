import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),rows=[],out=new URL('./',import.meta.url);
const floors=process.env.QA_FLOORS?process.env.QA_FLOORS.split(',').map(Number):[10,20,30,40,50,60,70];
try{
 await Promise.all([1440,390].map(async width=>{
  for(const floor of floors){
   const name=`pw-${width}-f${floor}-${Date.now()}`,page=await browser.newPage({viewport:{width,height:width===390?844:960},isMobile:width===390,hasTouch:width===390,deviceScaleFactor:1,serviceWorkers:'block'}),errors=[],assets=new Set();
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/ui/tower-monsters-20261022/')&&r.status()===200)assets.add(new URL(r.url()).pathname);});
   await page.goto(`http://127.0.0.1:8939/docs/qa/tower-monsters-20261022/index.html?pve=tower&profile=${name}`);
   await page.locator('[data-abyss-action="fight"]').waitFor({state:'visible',timeout:30000});
   const entry=await page.locator('.abyss-guardian img').evaluate(img=>({src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0}));assert.match(entry.src,/tower-monsters-20261022/);assert.ok(entry.loaded);
   await page.screenshot({path:fileURLToPath(new URL(`${width}-f${floor}-entry.png`,out)),fullPage:true});
   await page.locator('[data-abyss-action="fight"]').click();
   const phases=[];
   for(const phase of ['normal','elite','guardian']){
    await page.waitForFunction(phase=>window.QA.capture===phase,phase,{timeout:180000});
    const diagnostics=await page.evaluate(()=>ProjectVPixiBattle.diagnostics()),active=diagnostics.scrapyard.active;
    assert.ok(active.length);for(const unit of active)assert.match(unit.sprite,/tower-monsters-20261022/);
    assert.equal(active.some(r=>r.boss),phase==='guardian');
    await page.screenshot({path:fileURLToPath(new URL(`${width}-f${floor}-${phase}.png`,out))});
    phases.push({phase,active});await page.evaluate(()=>QA.release());
   }
   await page.locator('.abyss-result-metrics').waitFor({state:'visible',timeout:180000});
   const audit=await page.evaluate(async name=>await(await fetch(`/qa-api/${name}/audit`)).json(),name);
   assert.equal(audit.grants,1);assert.equal(Number(audit.progress.current_floor),floor+1);assert.deepEqual(errors,[]);
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,sound:localStorage.getItem('cnine_battle_sound')}));assert.equal(layout.overflow,false);assert.equal(layout.sound,'OFF');
   assert.equal(assets.size,2);rows.push({width,floor,entry,phases,audit,layout,assets:[...assets],errors});
   await fs.writeFile(new URL(`browser-${width}-f${floor}.json`,out),JSON.stringify(rows.at(-1),null,2)+'\n');console.log(`PASS ${width}px floor ${floor}: entry, normal, elite, guardian, settlement`);await page.close();
  }
 }));
 await fs.writeFile(new URL('browser-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual Tower API against isolated SQLite, live client and V3 renderer. QA holds only at event boundaries; no production account writes.',rows},null,2)+'\n');
}finally{await browser.close();}
