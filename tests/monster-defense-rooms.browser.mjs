import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_ROOMS_QA_OUTPUT||'../monster-defense-rooms-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],failed=[],checks=[];
async function open(user,width,height){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);
 await context.addInitScript(({user,loadout})=>{localStorage.setItem('cnine_card_api_token','local-qa-'+user);localStorage.setItem('cnine_defense_loadout_v1:'+user,JSON.stringify(loadout));localStorage.setItem('cnine_battle_sound','OFF');},{user,loadout:defenseOwnedLoadout()});
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
 await page.goto(h.origin+'/defense/');await page.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().roster.mercenaries>0);return page;
}
async function shot(page,name){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode().catch(()=>{})));});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1)),'horizontal fit');}
const id=page=>page.evaluate(()=>CoopDefenseReview.diagnostics().roomId);
const enter=async(page,room)=>{await page.locator('#find-rooms').click();await page.locator(`[data-room-join="${room}"]`).click();await page.locator('#waiting-room').waitFor({state:'visible'});};
try{
 const a=await open(1,1440,1000);assert.equal(await a.locator('#room-code,#invite-code,#copy-invite,#join-form').count(),0);
 await a.locator('#find-rooms').click();await a.locator('.rooms-empty').waitFor();await shot(a,'01-empty-desktop');await a.keyboard.press('Escape');assert.equal(await a.locator('#find-rooms').evaluate(e=>e===document.activeElement),true);
 await a.locator('[data-capacity="2"]').click();await a.locator('#create-room').click();await a.locator('#waiting-room').waitFor({state:'visible'});const roomA=await id(a);
 const b=await open(2,390,844);await b.locator('[data-difficulty="HARD"]').click();await b.locator('#create-room').click();await b.locator('#waiting-room').waitFor({state:'visible'});const roomB=await id(b);
 const c=await open(3,1440,1000);await c.locator('#find-rooms').click();await c.waitForFunction(()=>document.querySelectorAll('[data-room-join]').length===2);await shot(c,'02-public-rooms-desktop');
 await c.route('**/api/defense/join',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:'이미 시작한 방입니다.'})}));
 await c.locator(`[data-room-join="${roomA}"]`).click();await c.locator('[data-rooms-message]:visible').waitFor();assert.match(await c.locator('[data-rooms-message]').textContent(),/이미 시작/);await c.unroute('**/api/defense/join');await c.locator('[data-rooms-refresh]').click();await c.locator('[data-rooms-message]').waitFor({state:'hidden'});
 await c.setViewportSize({width:390,height:844});await shot(c,'03-public-rooms-mobile');await c.setViewportSize({width:320,height:740});await shot(c,'04-public-rooms-320');
 await c.locator('[data-rooms-difficulty]').selectOption('HARD');await c.waitForFunction(id=>document.querySelectorAll('[data-room-join]').length===1&&document.querySelector('[data-room-join]').dataset.roomJoin===id,roomB);await c.locator('[data-rooms-difficulty]').selectOption('');await c.waitForFunction(()=>document.querySelectorAll('[data-room-join]').length===2);
 await b.locator('#leave-waiting').click();await b.locator('#lobby').waitFor({state:'visible'});await enter(b,roomA);
 await c.waitForFunction(id=>document.querySelectorAll('[data-room-join]').length===1&&document.querySelector(`[data-room-join="${id}"]`)?.disabled,roomA,{timeout:16000});await shot(c,'05-full-room-320');
 await c.locator('[data-rooms-available]').click();await c.locator('.rooms-empty').waitFor();await c.locator('[data-rooms-create]').click();await c.locator('#waiting-room').waitFor({state:'visible'});const roomC=await id(c);
 await a.locator('#leave-waiting').click();await a.locator('#lobby').waitFor({state:'visible'});await b.waitForFunction(()=>document.querySelector('#room-host').textContent==='지원 분대의 방어대');await a.locator('#find-rooms').click();await a.waitForFunction(()=>document.querySelectorAll('[data-room-join]').length===2);await shot(a,'06-host-transfer');await a.locator(`[data-room-join="${roomC}"]`).click();await a.locator('#waiting-room').waitFor({state:'visible'});
 await b.locator('#leave-waiting').click();await b.locator('#lobby').waitFor({state:'visible'});await enter(b,roomC);await shot(b,'07-waiting-mobile');
 for(const p of [a,b,c])await p.locator('#ready').click();await c.waitForFunction(()=>!document.querySelector('#start').disabled);await c.locator('#start').click();await c.locator('#battle').waitFor({state:'visible'});assert.deepEqual((await h.api(1,'defense/rooms')).rooms,[]);
 checks.push('Desktop, 390px and 320px room lists; no invite controls; difficulty/available filters; automatic refresh; full-room block; visible stale-join error and recovery; host transfer; create from list; list join; three ready squads start and disappear from list; Escape/focus restoration');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,checks,errors,failed,rooms:[roomA,roomB,roomC]},null,2));console.log(JSON.stringify({ok:true,checks,out}));
}catch(error){for(const [i,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:path.join(out,`failure-${i}.png`),fullPage:true});throw error;}
finally{for(const context of contexts)await context.close();await browser.close();await h.dispose();}
