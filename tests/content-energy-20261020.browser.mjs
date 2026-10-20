import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
const out=process.env.ENERGY_QA_OUTPUT;
assert(out);await fs.mkdir(out,{recursive:true});
const h=await cooperativeMiniflare(),f=await legionFixture({withMercenary:true}),reports=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
 const p=await f.configure();p.mode='ON';await f.call('admin/legion-hunt',{policy:p},{method:'PATCH'});f.setUser(f.player);f.clock.now=Date.now();
 for(const width of [1440,390])for(const content of ['coop','legion'])for(const empty of [false,true]){
  const maximum=content==='coop'?3:10,at=Date.now(),energy={version:1,current:empty?0:maximum,maximum,updatedAt:at};
  if(content==='coop')await h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:['coop_energy_v1:2',JSON.stringify(energy)]}]);
  else await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('legion_hunt_owner_session_v1:2',JSON.stringify({energy})).run();
  const page=await browser.newPage({viewport:{width,height:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==h.origin)return route.abort();
   if(u.pathname==='/energy-qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/legion-hunt-entry-v2.css"><style>body{margin:0;background:#091018;color:#eee;font-family:Arial,sans-serif}#qa{max-width:1440px;margin:auto}</style><main id="qa"></main></html>'});
   if(u.pathname.startsWith('/api/legion-hunt/')){
    f.clock.now=Date.now();const r=await f.call(u.pathname.slice(5),route.request().postData()?JSON.parse(route.request().postData()):undefined);
    return route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)});
   }
   return route.continue();
  });
  await page.goto(h.origin+'/energy-qa.html');
  await page.evaluate(async content=>{
   localStorage.setItem('cnine_card_api_token','local-qa-2');
   if(content==='coop')window.energyQa=await (await import('/raid/cooperative/live.mjs')).mountCooperative(document.getElementById('qa'));
   else (await import('/js/legion-hunt-entry-v1.mjs')).openLegionHunt();
  },content);
  const selector=content==='coop'?'[data-reward-summary]':'.legion-entries';
  await page.waitForFunction(({selector,maximum})=>document.querySelector(selector)?.textContent.includes(' / '+maximum),{selector,maximum});
  const summary=await page.locator(selector).textContent();assert(summary.includes('행동력'));assert(summary.includes('3시간마다 1회'));assert(!summary.includes('자정'));
  if(empty)assert(summary.includes('00 /')||summary.includes('0 /'));
  if(content==='legion')assert.equal(await page.locator('[data-hunt-enter]').isDisabled(),empty);
  await page.waitForFunction(()=>[...document.images].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  const bounds=await page.locator(selector).boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:path.join(out,`${content}-${width}-${empty?'empty':'full'}.png`),fullPage:true});
  reports.push({content,width,empty,summary,overflow,errors});
  await page.evaluate(()=>window.energyQa?.destroy());await page.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await f.close();await h.dispose();}
