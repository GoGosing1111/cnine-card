import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_JOIN_QA_OUTPUT||'../monster-defense-join-qa');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],failed=[],checks=[];
async function open(user,width){
 const context=await browser.newContext({viewport:{width,height:width<700?844:1000},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);
 await context.addInitScript(id=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_battle_sound','OFF');},user);
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
 await page.goto(h.origin+'/defense/');await page.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().roster.mercenaries>0);
 await page.locator('#find-rooms').click();return page;
}
async function choose(page){
 await page.locator('[data-search]:enabled').waitFor();
 const loadout=defenseOwnedLoadout();
 for(const code of loadout.mercenaries)await page.locator(`[data-choice="${code}"]`).click();
 await page.locator('[data-kind="CARD"]').click();await page.locator(`[data-choice="${loadout.card}"]`).click();
}
async function shot(page,name){
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode().catch(()=>{})));});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1)),'horizontal fit');
 await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
}
try{
 assert.equal((await h.api(1,'admin/defense/settings',{settings:{...h.settings,testUserIds:[2,3,4]},requestId:crypto.randomUUID()})).status,200);
 const host=await h.api(1,'defense/create',{difficulty:'NORMAL',capacity:3,loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()});assert.equal(host.status,200);
 const desktop=await open(2,1440),join=desktop.locator(`[data-room-join="${host.roomId}"]`);await join.waitFor();
 assert.deepEqual(await desktop.evaluate(()=>CoopDefenseReview.diagnostics().roster.loadout),{mercenaries:[],card:''});
 assert.equal(await join.isEnabled(),true,'unconfigured squad must be able to click Join');
 await shot(desktop,'01-desktop-join-empty-formation');
 let requests=0;desktop.on('request',r=>{if(new URL(r.url()).pathname==='/api/defense/join')requests++;});
 await join.click();await desktop.locator('[data-search]:enabled').waitFor();assert.equal(await desktop.locator('[data-apply]').isDisabled(),true);
 await desktop.locator('[data-choice="V-004"]').click();await desktop.locator('[data-formation-cancel]').click();
 await desktop.waitForFunction(id=>!document.querySelector(`[data-room-join="${id}"]`).disabled,host.roomId);
 assert.equal(requests,0,'cancel must not send a join');assert.equal((await h.room(host.roomId)).players.length,1);
 assert.equal(await join.evaluate(e=>e===document.activeElement),true,'cancel restores the chosen room button');
 await join.focus();await desktop.keyboard.press('Enter');await desktop.locator('[data-search]:enabled').waitFor();await desktop.keyboard.press('Escape');
 await desktop.waitForFunction(id=>!document.querySelector(`[data-room-join="${id}"]`).disabled,host.roomId);assert.equal(requests,0,'Escape must not send a join');
 await join.click();await choose(desktop);await shot(desktop,'02-desktop-formation');await desktop.locator('[data-apply]').click();
 await desktop.locator('#waiting-room').waitFor({state:'visible'});assert.equal(requests,1,'apply continues exactly one selected-room join');
 assert.equal(await desktop.evaluate(()=>CoopDefenseReview.diagnostics().roomId),host.roomId);
 assert.deepEqual((await h.room(host.roomId)).players.find(p=>p.id==='2').loadout,defenseOwnedLoadout());
 await desktop.locator('#leave-waiting').click();await desktop.locator('#lobby').waitFor({state:'visible'});await desktop.locator('#find-rooms').click();await join.click();
 await desktop.locator('#waiting-room').waitFor({state:'visible'});assert.equal(requests,2,'saved squad joins directly');assert.equal(await desktop.locator('.defense-formation').isVisible(),false);
 await desktop.locator('#edit-formation').click();await desktop.locator('[data-search]:enabled').waitFor();await desktop.locator('[data-formation-cancel]').click();assert.equal(requests,2,'later formation edits cannot repeat the earlier join');
 checks.push('1440px: empty selection enables Join; cancel/Escape discard draft with no request; Enter works; apply joins the selected room once; saved formation joins directly; later formation edits do not repeat the join');

 const mobile=await open(3,390),mobileJoin=mobile.locator(`[data-room-join="${host.roomId}"]`);await mobileJoin.waitFor();await shot(mobile,'03-mobile-join-empty-formation');
 await mobileJoin.tap();await choose(mobile);await shot(mobile,'04-mobile-formation');
 // A room can fill while the player is choosing. Keep the server rejection visible and retryable.
 await mobile.route('**/api/defense/join',r=>r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:'방 정원이 가득 찼습니다.'})}));
 await mobile.locator('[data-apply]').tap();await mobile.locator('[data-rooms-message]:visible').waitFor();assert.match(await mobile.locator('[data-rooms-message]').textContent(),/정원/);assert.equal(await mobileJoin.isEnabled(),true);
 await shot(mobile,'05-mobile-stale-room-error');await mobile.unroute('**/api/defense/join');await mobileJoin.tap();await mobile.locator('#waiting-room').waitFor({state:'visible'});
 assert.equal(await mobile.evaluate(()=>CoopDefenseReview.diagnostics().roomId),host.roomId);assert.equal((await h.room(host.roomId)).players.length,3);await shot(mobile,'06-mobile-joined');
 const observer=await open(4,320),full=observer.locator(`[data-room-join="${host.roomId}"]`);await full.waitFor();assert.equal(await full.isDisabled(),true);await shot(observer,'07-full-room-320');
 checks.push('390px touch: Join opens formation, apply retains server-error feedback, retry joins; 320px full-room entry stays disabled; all dialogs fit horizontally');
 await desktop.locator('#ready').click();await mobile.locator('#ready').tap();assert.equal((await h.ready(host)).status,200);
 await desktop.waitForFunction(()=>CoopDefenseReview.snapshot().players.every(p=>p.ready));
 assert.equal((await h.live(host,'command',{requestId:crypto.randomUUID(),command:{type:'START'}})).status,200);
 for(const page of [desktop,mobile]){await page.waitForFunction(()=>CoopDefenseReview.diagnostics().engine?.rendererCount===1,null,{timeout:60000});await page.locator('#loading').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>CoopDefenseReview.snapshot().units.length),9);}
 checks.push('Rebuilt production bundle: three ready squads enter the shared V3 battle on desktop/mobile with one renderer and nine selected units');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,checks,errors,failed,liveWrites:0},null,2));console.log(JSON.stringify({ok:true,checks,out}));
}catch(error){for(const [i,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:path.join(out,`failure-${i}.png`),fullPage:true});throw error;}
finally{for(const context of contexts)await context.close();await browser.close();await h.dispose();}
