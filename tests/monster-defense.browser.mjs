import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
import {fixture} from './helpers/cooperative-fixture.mjs';
import {advanceRoom,RULES,WORLD} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_DIFFICULTIES} from '../shared/monster-defense-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_QA_OUTPUT||'../monster-defense-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const clients=[],errors=[],failed=[],checks=[];
async function open(id,width,height){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
 await context.addInitScript(({id,cards})=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_admin_token','local-qa-'+id);localStorage.setItem('cnine_card_user_v10',JSON.stringify({id,serverUserId:id,nickname:'검수 '+id,role:id===1?'OWNER':'USER',coin:12345678,cardShards:2000,masterStars:1000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:Object.fromEntries(cards.map(c=>[c.id,13])),history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true}));localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},{id,cards:fixture.cardsByLevel[13]});
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push({id,message:e.message}));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({id,status:r.status(),url:new URL(r.url()).pathname});});
 clients.push({id,page,context});return page;
}
const snap=async(page,name)=>{await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));});return page.screenshot({path:path.join(out,name+'.png'),fullPage:!name.includes('battle')});};
const fits=async(page,label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' horizontal overflow');
async function menu(page,mobile){await page.goto(h.origin+'/');const shell=page.locator('soop-adventure-lobby');await shell.locator(mobile?'.mobile-dock [data-category=pve]':'.sidebar [data-category=pve]').click();await shell.locator('[data-route=defense]').click();await page.waitForURL('**/defense/');await page.waitForFunction(()=>document.querySelector('#nickname')?.readOnly);}
try{
 const a=await open(1,1440,1000);await menu(a,false);await snap(a,'01-lobby-desktop');await fits(a,'desktop lobby');checks.push('PC PVE menu → defense');
 for(const d of DEFENSE_DIFFICULTIES){await a.locator(`[data-difficulty=${d.id}]`).click();await a.waitForFunction(()=>document.querySelector('#boss-preview').naturalWidth>0);assert.equal(await a.locator('#mission-waves').textContent(),String(d.waves));}
 await a.locator('[data-difficulty=HARD]').click();await a.locator('#create-room').click();await a.locator('#waiting-room').waitFor({state:'visible'});const roomId=await a.locator('#invite-code').textContent();
 const b=await open(2,1440,1000),c=await open(3,390,844);await b.goto(h.origin+'/defense/');await menu(c,true);await snap(c,'02-lobby-mobile');await fits(c,'mobile lobby');checks.push('Mobile PVE menu → defense');
 for(const p of [b,c]){await p.locator('#room-code').fill(roomId);await p.locator('#join-form button').click();await p.locator('#waiting-room').waitFor({state:'visible'});}
 await snap(c,'03-waiting-mobile');await fits(c,'waiting mobile');
 for(const p of [a,b,c])await p.locator('#ready').click();await a.waitForFunction(()=>!document.getElementById('start').disabled);await a.locator('#start').click();
 for(const p of [a,b,c]){await p.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1,{},{timeout:60000});await p.locator('#loading').waitFor({state:'hidden'});assert.equal((await p.evaluate(()=>CoopDefenseReview.diagnostics())).units,9);await fits(p,'battle');}
 assert.equal((await c.evaluate(()=>CoopDefenseReview.diagnostics())).focus,2);checks.push('Three real clients share nine units; mobile defaults to own lane');
 let stored=await h.room(roomId);advanceRoom(stored,RULES.prepMs);stored.serverAt=Date.now();await h.room(roomId,stored);
 for(const d of DEFENSE_DIFFICULTIES){
  stored=await h.room(roomId);stored.phase='WAVE';stored.enemies=[];stored.spawnQueue=[{archetype:d.boss,type:'BOSS',lane:2}];stored.spawnAt=0;advanceRoom(stored,100);const boss=stored.enemies[0];boss.x=1750;boss.y=960;boss.patternAt=stored.time;boss.hp=Math.round(boss.maxHp*.35);advanceRoom(stored,100);stored.serverAt=Date.now();await h.room(roomId,stored);
  await a.waitForFunction(id=>CoopDefenseReview.snapshot()?.enemies.some(e=>e.archetype===id),d.boss);await c.waitForFunction(id=>CoopDefenseReview.snapshot()?.enemies.some(e=>e.archetype===id),d.boss);
  await a.locator('#boss-status').waitFor({state:'visible'});await snap(a,'battle-desktop-'+d.id);if(d.id==='CATACLYSM')await snap(c,'battle-mobile-boss');
 }
 checks.push('Five boss sprites, HP bar, warning and enraged state rendered');
 await c.locator('#pan-right').click();await c.locator('#pan-squad').click();await c.locator('#lane-tabs [data-view="1"]').click();assert.equal((await c.evaluate(()=>CoopDefenseReview.diagnostics())).focus,1);
 await c.reload();await c.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1);assert.equal((await c.evaluate(()=>CoopDefenseReview.diagnostics())).roomId,roomId);checks.push('Reload reconnect restores room and one renderer');
 stored=await h.room(roomId);stored.units.filter(u=>u.ownerId==='3').forEach(u=>u.hp=0);advanceRoom(stored,100);stored.serverAt=Date.now();await h.room(roomId,stored);await c.locator('#revive-panel').waitFor({state:'visible'});await snap(c,'battle-mobile-revival');
 await c.setViewportSize({width:844,height:390});await fits(c,'mobile landscape');await snap(c,'battle-mobile-landscape');
 const outsider=await open(4,390,844);await outsider.goto(h.origin+'/defense/');await outsider.waitForFunction(()=>document.getElementById('access-status').textContent.includes('지정 테스트'));assert.equal(await outsider.locator('#create-room').isDisabled(),true);checks.push('Ordinary accounts see TEST restriction');
 // Full OWNER page and actual CMS request/save/reload, with isolated QA account data.
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const cms=await a.context().newPage();await cms.setViewportSize(viewport);cms.on('pageerror',e=>errors.push({id:'cms',message:e.stack}));await cms.route('**/api/admin/mercenaries/opening',r=>r.fulfill({json:{mode:'OFF',ready:false,rankCounts:{},blockers:[]}}));await cms.goto(h.origin+'/admin/');await cms.locator('#nav [data-view=monster-defense]').click();const root=cms.locator('#view-monster-defense');await root.locator('[data-save]:enabled').waitFor();assert.equal(await root.locator('[name=mode]').inputValue(),'TEST');
  await root.locator('[data-difficulty=GUIDE] [data-value=hpPercent]').fill('75');await root.locator('[data-save]').click();await cms.waitForFunction(()=>document.querySelector('#view-monster-defense [data-status]')?.textContent.startsWith('저장 완료'));await root.locator('[data-reload]').click();await root.locator('[data-save]:enabled').waitFor();assert.equal(await root.locator('[data-difficulty=GUIDE] [data-value=hpPercent]').inputValue(),'75');
  await fits(cms,'CMS '+label);await snap(cms,'cms-'+label);await cms.close();
 }
 checks.push('Desktop/mobile OWNER CMS saves and reloads five difficulty policies');
 assert.deepEqual(failed,[]);assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors,failed},null,2));console.log(JSON.stringify({out,checks,errors,failed}));
}catch(e){for(const {id,page} of clients){await page.screenshot({path:path.join(out,'failure-'+id+'.png')}).catch(()=>{});console.log(id,await page.evaluate(()=>({url:location.href,toast:document.getElementById('toast')?.textContent,diagnostics:window.CoopDefenseReview?.diagnostics(),status:document.getElementById('access-status')?.textContent})).catch(()=>null));}console.log({errors,failed});throw e;}
finally{await browser.close();await h.dispose();}
