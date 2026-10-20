import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
const out=process.env.ENERGY_QA_OUTPUT;assert(out);await fs.mkdir(out,{recursive:true});
const h=await cooperativeMiniflare(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
const energy=current=>h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:['coop_energy_v1:2',JSON.stringify({version:1,current,maximum:3,updatedAt:Date.now()})]}]);
async function open(width){
 const page=await browser.newPage({viewport:{width,height:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
 await page.context().grantPermissions(['local-network-access'],{origin:h.origin});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==h.origin)return route.abort();
  if(u.pathname==='/entry-qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#091018;color:#eee;font-family:Arial,sans-serif}#qa{max-width:1440px;margin:auto}</style><main id="qa"></main></html>'});
  return route.continue();
 });
 await page.goto(h.origin+'/entry-qa.html');
 await page.evaluate(async()=>{localStorage.setItem('cnine_card_api_token','local-qa-2');window.energyQa=await (await import('/raid/cooperative/live.mjs')).mountCooperative(document.getElementById('qa'));});
 return {page,errors};
}
try{
 const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
 await h.db.batch([{sql:"INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count) VALUES(2,'V-976',1,0)"}]);
 const hostClient='energy-entry-host-20261020',created=await h.request(1,'create',{clientId:hostClient,requestId:crypto.randomUUID(),difficulty:'NORMAL'});assert.equal(created.status,200);
 const roomId=created.roomId;
 for(const width of [1440,390]){
  await energy(0);let {page,errors}=await open(width);
  await page.locator(`[data-join-room="${roomId}"]`).waitFor();
  assert.equal(await page.locator('[data-create]').isDisabled(),true);assert.match(await page.locator('[data-create]').textContent(),/행동력 충전 대기/);
  assert.equal(await page.locator(`[data-join-room="${roomId}"]`).isDisabled(),true);assert.match(await page.locator(`[data-join-room="${roomId}"]`).textContent(),/행동력 부족/);
  assert.match(await page.locator('.coop-create-note').textContent(),/다음 충전/);
  await page.screenshot({path:path.join(out,'entry-empty-'+width+'.png'),fullPage:true});
  await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+3*60*60*1000;});
  await page.waitForFunction(()=>!document.querySelector('[data-create]').disabled);
  assert.equal(await page.locator(`[data-join-room="${roomId}"]`).isDisabled(),false,'recharge unlocks room buttons');assert.equal(errors.length,0,errors.join('\n'));
  await page.evaluate(()=>window.energyQa.destroy());await page.close();
  // Recreate a lobby participant who was already inside before the new gate.
  await energy(1);const clientId='energy-entry-legacy-'+width;
  assert.equal((await h.request(2,'join',{clientId,roomId,requestId:crypto.randomUUID()})).status,200);
  assert.equal((await h.request(2,'select',{clientId,roomId,requestId:crypto.randomUUID(),cardIds:coopSquads()[1].cards.map(c=>c.id),mercenaryCode:'V-976'})).status,200);
  await energy(0);({page,errors}=await open(width));
  await page.locator('[data-room]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-card-count]').textContent(),/2\/2/);assert.match(await page.locator('[data-merc-count]').textContent(),/1\/1/);
  assert.equal(await page.locator('[data-ready]').isDisabled(),true);assert.match(await page.locator('[data-ready-summary]').textContent(),/행동력이 부족/);
  assert.match(await page.locator('.coop-readybar>div>span').textContent(),/행동력 0 \/ 3 · 다음 충전/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,'ready-empty-'+width+'.png'),fullPage:true});assert.equal(errors.length,0,errors.join('\n'));
  await page.locator('[data-leave]').click();await page.locator('[data-entry]').waitFor({state:'visible'});
  assert.equal((await h.request(2,'current')).state,null);await page.evaluate(()=>window.energyQa.destroy());await page.close();
  reports.push({width,emptyCreateBlocked:true,emptyJoinBlocked:true,rechargedButtonsEnabled:true,legacyZeroReadyReasonVisible:true,leaveAllowed:true,errors});
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await h.dispose();}
