import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
import {advanceRoom} from '../preview/coop-defense-v1/source/defense-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_RANGE_QA_OUTPUT||'../monster-defense-range-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],failed=[];
await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_battle_sound','OFF');});
await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;const urls=new Set([...document.querySelectorAll('*')].filter(e=>e.getClientRects().length).flatMap(e=>[...getComputedStyle(e).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1])));await Promise.all([...urls].map(src=>{const image=new Image();image.src=src;return image.decode().catch(()=>{});}));});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
try{
 const options=await h.api(1,'defense/options'),loadout={mercenaries:['STRIKER','HEALER'].map(role=>options.mercenaries.find(m=>m.role===role).code),card:options.cards[0].code};
 const session=await h.api(1,'defense/create',{capacity:3,practice:true,difficulty:'NORMAL',loadout,requestId:crypto.randomUUID()});assert.equal(session.status,200);
 await h.ready(session);await h.live(session,'command',{requestId:crypto.randomUUID(),command:{type:'START'}});
 await page.goto(h.origin+'/defense/');await page.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1,null,{timeout:60000});await page.locator('#loading').waitFor({state:'hidden'});
 let room=await h.room(session.roomId);room.phase='WAVE';room.wave=2;room.enemies=[];room.spawnQueue=[{archetype:'VEIL',type:'RANGED',lane:0}];room.spawnAt=room.time;
 advanceRoom(room,100);const enemy=room.enemies[0],front=room.units.find(u=>u.ownerId===session.playerId&&u.slot===0);
 enemy.x=front.x+enemy.range-1;enemy.y=front.y;room.time=600000;room.serverAt=Date.now();await h.room(session.roomId,room);
 await page.waitForFunction(()=>{const s=CoopDefenseReview.snapshot();return s.phase==='WAVE'&&s.wave===2&&s.enemies.length===1;});await shot('01-range-gap-desktop');
 const before=await page.evaluate(()=>CoopDefenseReview.snapshot());
 await page.waitForFunction(x=>CoopDefenseReview.snapshot().enemies[0]?.x<x-15,before.enemies[0].x);const moving=await page.evaluate(()=>CoopDefenseReview.snapshot());
 assert.ok((await h.room(session.roomId)).events.some(e=>e.type==='ENEMY_HIT'));assert.equal(moving.players[0].stats.damage,0);
 await page.setViewportSize({width:390,height:844});await shot('02-advancing-mobile');
 for(let i=0;i<12;i++){room=await h.room(session.roomId);if(room.phase!=='WAVE')break;room.serverAt=Date.now()-5000;await h.room(session.roomId,room);await h.live(session,'state');}
 await page.waitForFunction(()=>{const s=CoopDefenseReview.snapshot();return s.phase==='PREP'&&s.wave===2;});await page.locator('dialog.dw[open]').waitFor();await shot('03-point-draw-mobile');
 const cleared=await page.evaluate(()=>CoopDefenseReview.snapshot());assert.equal(cleared.enemies.length,0);assert.ok(cleared.players[0].stats.damage>0);assert.equal(cleared.coreHp,cleared.coreMaxHp);
 assert.equal(cleared.players[0].growth.draws.filter(d=>d.wave===2).length,1);await page.locator('[data-action="reveal"]').click();await page.locator('[data-action="continue"]').waitFor();
 await page.setViewportSize({width:1440,height:1000});await shot('04-point-result-desktop');
 const settled=cleared.players.map(p=>p.growth.draws);await page.reload();await page.waitForFunction(()=>window.CoopDefenseReview?.snapshot()?.wave===2);
 const restored=await page.evaluate(()=>CoopDefenseReview.snapshot());assert.deepEqual(restored.players.map(p=>p.growth.draws),settled);assert.equal(restored.players[0].credits,cleared.players[0].credits);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,loadout,checks:['Saved 10-minute wave resumes without skills','Sniper fires while approaching melee range','Desktop and 390px combat render','Natural kill opens wave 2 point draw','Reveal and reload retain exactly one draw per squad'],before:{time:before.time,x:before.enemies[0].x},moving:{time:moving.time,x:moving.enemies[0].x},cleared:{time:cleared.time,phase:cleared.phase,coreHp:cleared.coreHp},errors,failed},null,2));
 console.log(JSON.stringify({ok:true,out,clearTime:cleared.time,errors,failed}));
}catch(error){await shot('failure');throw error;}
finally{await context.close();await browser.close();await h.dispose();}
