import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
const out=process.env.ENERGY_QA_OUTPUT;assert(out);await fs.mkdir(out,{recursive:true});
const h=await cooperativeMiniflare(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
 await h.db.batch([{sql:"UPDATE users SET role='OWNER' WHERE id=1"},{sql:'INSERT INTO app_meta(key,value) VALUES(?,?)',args:['coop_energy_v1:1',JSON.stringify({version:1,current:0,maximum:3,updatedAt:Date.now()})]}]);
 const room=await h.request(2,'create',{clientId:'owner-browser-peer',requestId:crypto.randomUUID(),difficulty:'NORMAL'});assert.equal(room.status,200);
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  await page.context().grantPermissions(['local-network-access'],{origin:h.origin});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!==h.origin)return route.abort();
   if(u.pathname==='/owner-qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#091018;color:#eee;font-family:Arial,sans-serif}main{max-width:1440px;margin:auto}</style><main id="qa"></main></html>'});
   return route.continue();
  });
  await page.goto(h.origin+'/owner-qa.html');
  await page.evaluate(async()=>{localStorage.setItem('cnine_card_api_token','local-qa-1');window.ownerQa=await (await import('/raid/cooperative/live.mjs')).mountCooperative(document.getElementById('qa'));});
  await page.locator(`[data-join-room="${room.roomId}"]`).waitFor();
  assert.equal(await page.locator('[data-create]').isEnabled(),true);assert.equal(await page.locator(`[data-join-room="${room.roomId}"]`).isEnabled(),true);
  assert.match(await page.locator('[data-reward-summary]').textContent(),/OWNER · 행동력 소모 없이 입장 가능/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,'owner-entry-'+width+'.png'),fullPage:true});
  await page.locator('[data-create]').click();await page.locator('[data-room]').waitFor({state:'visible'});
  assert.equal((await h.request(1,'feature')).energy.current,0);
  await page.locator('[data-leave]').click();await page.locator('[data-entry]').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);reports.push({width,zeroEnergyCreate:true,zeroEnergyJoinEnabled:true,ownerLabel:true,energyUnchanged:true,errors});
  await page.evaluate(()=>window.ownerQa.destroy());await page.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();await h.dispose();}
