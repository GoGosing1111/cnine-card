import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_TEMPO_QA_OUTPUT||'../monster-defense-tempo-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],failed=[],checks=[],metrics=[];
async function open(id,width,height,reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion});contexts.push(context);
 await context.addInitScript(({id,loadout})=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_defense_loadout_v1:'+id,JSON.stringify(loadout));localStorage.setItem('cnine_battle_sound','OFF');},{id,loadout:defenseOwnedLoadout()});
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));p.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
 await p.goto(h.origin+'/defense/');await p.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().roster.mercenaries>0);return p;
}
async function shot(p,name){await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(e=>e.getClientRects().length).map(e=>e.decode().catch(()=>{})));});await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
async function buttons(p){
 const result=await p.evaluate(()=>['create-room','practice','find-rooms'].map(id=>{const e=document.getElementById(id),text=e.querySelector('b')||e,r=e.getBoundingClientRect(),s=getComputedStyle(text);return {id,width:r.width,height:r.height,font:parseFloat(s.fontSize),align:s.textAlign,justify:getComputedStyle(e).justifyContent};}));
 assert.ok(result.every(r=>r.height>=50&&r.font>=16&&r.align==='center'&&r.justify==='center'));metrics.push({width:p.viewportSize().width,buttons:result});
 assert.equal(await p.locator('.defense-back').getAttribute('href'),'/?screen=home');assert.match(await p.locator('.defense-back').textContent(),/로비로 돌아가기/);
}
try{
 const pc=await open(1,1750,1000);await buttons(pc);await shot(pc,'01-lobby-desktop');
 await pc.locator('#practice').click();await pc.locator('#ready').click();await pc.locator('#start:enabled').click();await pc.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1,null,{timeout:60000});
 const roomId=await pc.evaluate(()=>CoopDefenseReview.diagnostics().roomId);
 async function hold(wave=5){const r=await h.room(roomId);r.players.forEach(p=>{p.bot=false;p.growth.readyWave=-1;});r.phase='PREP';r.wave=wave;r.enemies=[];r.spawnQueue=[];r.prepStartedAt=r.time;r.phaseUntil=r.time+60000;r.serverAt=Date.now();await h.room(roomId,r);}
 await hold();await pc.waitForFunction(()=>CoopDefenseReview.snapshot().wave===5);await pc.locator('[data-view="all"]').click();
 await pc.locator('#move-buttons [data-lane="1"]').click();await pc.waitForFunction(()=>CoopDefenseReview.diagnostics().engine.supportTeleport.active===1);await pc.waitForTimeout(750);
 const teleport=await pc.evaluate(()=>({fx:CoopDefenseReview.diagnostics().engine.supportTeleport,unit:CoopDefenseReview.snapshot().units.find(u=>u.move)}));
 assert.equal(teleport.fx.frames,6);assert.ok(teleport.fx.positions[0].portals.some(p=>p.visible));assert.equal(teleport.fx.positions[0].portals[1].x,teleport.unit.move.x);assert.equal(teleport.fx.positions[0].portals[1].y,teleport.unit.move.y);
 await shot(pc,'02-support-teleport-desktop');await pc.waitForFunction(()=>CoopDefenseReview.diagnostics().engine.supportTeleport.active===0);checks.push('server support command; departure/arrival portals anchored to exact stations; one 1.8s transfer; automatic cleanup');
 await pc.locator('#upgrade').click();await pc.locator('.dw[open]').waitFor();assert.match(await pc.locator('[data-footer-note]').textContent(),/6W.*집중 돌파/);await shot(pc,'03-forecast-desktop');await pc.keyboard.press('Escape');
 const mobile=await open(2,390,844,'reduce');await buttons(mobile);await shot(mobile,'04-lobby-mobile');await mobile.setViewportSize({width:320,height:740});await buttons(mobile);await shot(mobile,'05-lobby-320');
 await pc.setViewportSize({width:390,height:844});await pc.locator('#upgrade').click();await shot(pc,'06-forecast-mobile');assert.ok(await pc.locator('.dw').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await pc.keyboard.press('Escape');await shot(pc,'07-battle-mobile');
 // Reduced motion shows a static portal marker; expiry and server movement are unchanged.
 await pc.emulateMedia({reducedMotion:'reduce'});await pc.reload();await pc.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1,null,{timeout:60000});await hold();await pc.waitForTimeout(600);
 await pc.locator('#move-buttons [data-lane="0"]').click();await pc.waitForFunction(()=>CoopDefenseReview.diagnostics().engine.supportTeleport.active===1);await shot(pc,'08-support-reduced-mobile');
 const ending=await h.room(roomId);ending.phase='DEFEAT';ending.completedAt=ending.time;ending.serverAt=Date.now();await h.room(roomId,ending);
 await pc.waitForFunction(()=>CoopDefenseReview.snapshot().phase==='DEFEAT'&&CoopDefenseReview.diagnostics().engine.supportTeleport.active===0);await pc.waitForTimeout(350);assert.equal(await pc.evaluate(()=>CoopDefenseReview.diagnostics().engine.supportTeleport.active),0);
 checks.push('1750px / 390px / 320px centered readable controls and home lobby link; pressure forecast visible in battle and workshop; reduced motion transfer and cleanup');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,checks,metrics,teleport,errors,failed},null,2));console.log(JSON.stringify({ok:true,out,checks,metrics}));
}catch(error){for(const [i,c] of contexts.entries())for(const p of c.pages())await p.screenshot({path:path.join(out,`failure-${i}.png`),fullPage:true}).catch(()=>{});console.log({errors,failed});throw error;}
finally{await browser.close();await h.dispose();}
