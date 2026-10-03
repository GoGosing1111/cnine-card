import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {fixture} from './helpers/cooperative-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'room-list-screenshots');await fs.mkdir(out,{recursive:true});
console.log('Room list UI evidence:',out);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const clients=[],errors=[],checks=[];
async function open(id,width,height){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
 await context.addInitScript(({id,cards})=>{
  localStorage.setItem('cnine_card_api_token','local-qa-'+id);
  localStorage.setItem('cnine_card_user_v10',JSON.stringify({id,serverUserId:id,nickname:'검수 '+id,role:id===1?'OWNER':'USER',coin:12345678,cardShards:2000,masterStars:1000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:Object.fromEntries(cards.map(c=>[c.id,13])),history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true}));
  localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
 },{id,cards:fixture.cardsByLevel[13]});
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push({id,message:e.stack}));
 await page.goto(h.origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
 await page.locator('#pveCoopTab').click();await page.locator('[data-create]').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('[data-room-list]')?.getAttribute('aria-busy')==='false');
 clients.push({id,page,context});return page;
}
async function refresh(page){await page.locator('[data-refresh-rooms]').click();await page.waitForFunction(()=>document.querySelector('[data-room-list]')?.getAttribute('aria-busy')==='false');}
async function capture(page,name){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
 await page.locator('[data-entry]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
}
try{
 const host=await open(1,1440,1000),desktop=await open(2,1440,1000),mobile=await open(3,390,844);
 assert.equal(await mobile.locator('#coop-code').count(),0);assert.equal(await desktop.locator('[data-copy]').count(),0);
 await capture(desktop,'01-empty-desktop');await capture(mobile,'02-empty-mobile');
 await host.locator('[data-difficulty=HARD]').click();await host.locator('[data-create]').click();await host.locator('[data-room]').waitFor({state:'visible'});
 const id=(await h.request(1,'current')).state.id;
 // Other screens discover the host automatically, without sharing a code.
 await desktop.locator(`[data-join-room="${id}"]`).waitFor({state:'visible',timeout:16000});
 await mobile.locator('[data-room-filter]').selectOption('NORMAL');await mobile.waitForFunction(()=>document.querySelector('[data-room-list]')?.getAttribute('aria-busy')==='false');
 assert.equal(await mobile.locator('[data-lobby]').count(),0);
 await mobile.locator('[data-room-filter]').selectOption('HARD');await mobile.locator(`[data-join-room="${id}"]`).waitFor({state:'visible'});
 await capture(desktop,'03-populated-desktop');await capture(mobile,'04-populated-mobile');
 await desktop.locator(`[data-join-room="${id}"]`).click();await desktop.locator('[data-room]').waitFor({state:'visible'});
 await refresh(mobile);assert.match(await mobile.locator(`[data-lobby="${id}"] .coop-lobby-capacity`).textContent(),/2\s*\/\s*3명/);
 await mobile.locator(`[data-join-room="${id}"]`).click();await mobile.locator('[data-room]').waitFor({state:'visible'});
 assert.match(await mobile.locator('[data-count]').textContent(),/3 \/ 3/);checks.push('automatic discovery, difficulty filter, PC/mobile direct join, three members');
 await mobile.locator('[data-leave]').click();await mobile.locator('[data-entry]').waitFor({state:'visible'});
 await desktop.locator('[data-leave]').click();await desktop.locator('[data-entry]').waitFor({state:'visible'});
 await refresh(mobile);await host.locator('[data-leave]').click();await host.locator('[data-entry]').waitFor({state:'visible'});
 // A room can close after the last list response: the join must fail safely and refresh.
 await mobile.locator(`[data-join-room="${id}"]`).click();await mobile.locator('[data-alert]').waitFor({state:'visible'});
 await mobile.waitForFunction(()=>document.querySelectorAll('[data-lobby]').length===0);assert.equal((await h.request(3,'current')).state,null);
 checks.push('disbanded room stale click is rejected and list recovers');
 await desktop.route('**/api/coop/rooms*',r=>r.fulfill({status:503,json:{ok:false,error:'목록 연결 확인 중',code:'COOP_UNAVAILABLE'}}));
 await refresh(desktop);await desktop.locator('[data-room-list-message]').waitFor({state:'visible'});
 await desktop.unroute('**/api/coop/rooms*');await refresh(desktop);assert.equal(await desktop.locator('[data-room-list-message]').isVisible(),false);
 checks.push('list failure preserves controls and refresh recovers');
 await capture(mobile,'05-return-mobile');assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({origin:h.origin,errors,checks,viewports:['1440x1000','390x844']},null,2));
 console.log('PASS:',checks.join('; '));
}catch(e){for(const {id,page}of clients)await page.screenshot({path:path.join(out,'failure-'+id+'.png'),fullPage:true}).catch(()=>{});console.error('Browser errors:',errors);throw e;}
finally{await browser.close();await h.dispose();}
