import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {rankForLevel} from '../shared/account-ranks-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'player-ranks');await fs.mkdir(out,{recursive:true});console.log('Evidence:',out);
const built=createCooperativeBattle({squads:coopSquads().map((s,i)=>({...s,ownerRankLevel:[1,100,250][i]})),seed:123});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});const reports=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});
  await page.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  await page.goto(h.origin+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>window.PveV3BattleBridge);
  await page.evaluate(async({payload,rank})=>{
   window.AccountRankBridge={loadUser:()=>({serverUserId:2,accountRank:rank})};
   await import('/js/account-rank-v1.mjs');
   const css=document.createElement('link');css.rel='stylesheet';css.href='/raid/cooperative/style.css';document.head.append(css);
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:100%;height:100%';document.body.append(host);
   const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');window.rankQa=await mountCoopBattle(host,payload);
  },{payload:built.payload,rank:{...rankForLevel(100),level:100}});
  const selector='.battle-v3-roster.is-cooperative [data-v3-roster-owner]';
  await page.waitForFunction(s=>document.querySelectorAll(s+' .account-rank-inline').length===3,selector);
  const ranks=await page.locator(selector+' .account-rank-inline').evaluateAll(nodes=>nodes.map(n=>n.title));
  assert.deepEqual(ranks,[1,100,250].map(l=>`Lv.${l} ${rankForLevel(l).name}`));
  await page.screenshot({path:path.join(out,viewport.width+'.png')});
  // Old snapshots must not borrow the viewer's rank; the viewer retains their own badge.
  await page.locator(selector).evaluateAll(nodes=>{for(const n of nodes)delete n.dataset.v3RosterOwnerRankLevel;dispatchEvent(new Event('cnine:player-updated'));});
  assert.equal(await page.locator(selector+' .account-rank-inline').count(),1);
  assert.equal(await page.locator(selector+'[data-v3-roster-owner-id="2"] .account-rank-inline').count(),1);
  // The same roster node may be reused by a normal battle: clear stale identity and keep solo rank.
  await page.locator(selector).evaluateAll(nodes=>{const n=nodes[0];delete n.dataset.v3RosterOwnerId;n.closest('[data-v3-roster]').classList.remove('is-cooperative');dispatchEvent(new Event('cnine:player-updated'));});
  assert.equal(await page.locator('[data-v3-roster-side="A"] [data-v3-roster-owner]').first().locator('.account-rank-inline').getAttribute('title'),`Lv.100 ${rankForLevel(100).name}`);
  reports.push({viewport,ranks,legacyFallback:'only-self',solo:'preserved'});await page.evaluate(()=>rankQa.destroy());await page.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await h.dispose();}
