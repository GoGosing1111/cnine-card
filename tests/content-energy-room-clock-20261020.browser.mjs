import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';

const out=process.env.ENERGY_QA_OUTPUT;assert(out);await fs.mkdir(out,{recursive:true});
const h=await cooperativeMiniflare(),reports=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
 for(const width of [1440,390]){
  const current=width===1440?2:0,energy={version:1,current,maximum:3,updatedAt:Date.now()};
  await h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:['coop_energy_v1:2',JSON.stringify(energy)]}]);
  const page=await browser.newPage({viewport:{width,height:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  await page.context().grantPermissions(['local-network-access'],{origin:h.origin});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!==h.origin)return route.abort();
   if(u.pathname==='/energy-room-qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#091018;color:#eee;font-family:Arial,sans-serif}#qa{max-width:1440px;margin:auto}</style><main id="qa"></main></html>'});
   return route.continue();
  });
  await page.goto(h.origin+'/energy-room-qa.html');
  await page.evaluate(async()=>{
   localStorage.setItem('cnine_card_api_token','local-qa-2');
   window.energyQa=await (await import('/raid/cooperative/live.mjs')).mountCooperative(document.getElementById('qa'));
  });
  const check=async label=>{
   const message=await page.locator('[data-alert]').textContent();
   // Closing a lobby can leave its connection notice until the next room opens.
   if(label==='leave')assert.doesNotMatch(message,/Invalid content energy|전황을 다시/);
   else assert.equal(await page.locator('[data-alert]').isVisible(),false,label+': '+message);
   assert.match(await page.locator('[data-reward-summary]').textContent(),new RegExp('행동력 '+current+' / 3'));
   assert.equal(errors.length,0,errors.join('\n'));
  };
  await page.locator('[data-create]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-room]').hidden,{},{timeout:10000});
  await check('create');
  await page.waitForFunction(()=>window.energyQa.diagnostics().clock.samples>=3,{},{timeout:12000});
  await check('websocket clock samples');
  await page.locator('[data-leave]').click();
  await page.waitForFunction(()=>!window.energyQa.diagnostics().state);
  await check('leave');
  const hostClient='energy-clock-host-'+width;
  const created=await h.request(1,'create',{clientId:hostClient,requestId:crypto.randomUUID(),difficulty:'NORMAL'});assert.equal(created.status,200);
  await page.waitForFunction(()=>!document.querySelector('[data-refresh-rooms]').disabled);
  await page.locator('[data-refresh-rooms]').click();
  await page.locator(`[data-join-room="${created.roomId}"]`).click();
  await page.waitForFunction(()=>!document.querySelector('[data-room]').hidden);
  await check('join');
  assert.equal((await h.request(3,'join',{clientId:'energy-clock-third-'+width,requestId:crypto.randomUUID(),roomId:created.roomId})).status,200);
  await page.waitForFunction(()=>document.querySelector('[data-count]').textContent.includes('3 / 3'));
  await check('member update');
  assert.equal((await h.request(2,'feature')).energy.current,current,'room create/join do not spend energy');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  await page.screenshot({path:path.join(out,'coop-room-'+width+'.png'),fullPage:true});
  reports.push({width,current,roomCreated:true,roomJoined:true,memberUpdate:true,clock:await page.evaluate(()=>window.energyQa.diagnostics().clock),overflow,errors});
  await page.locator('[data-leave]').click();
  await page.waitForFunction(()=>!window.energyQa.diagnostics().state);
  await page.evaluate(()=>window.energyQa.destroy());await page.close();
  for(const [id,clientId] of [[1,hostClient],[3,'energy-clock-third-'+width]])assert.equal((await h.request(id,'leave',{clientId,requestId:crypto.randomUUID(),roomId:created.roomId})).status,200);
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await h.dispose();}
