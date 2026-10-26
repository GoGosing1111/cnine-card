import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
import {defenseDailyEntryKey,defenseEntryDay} from '../functions/_monster_defense_entry.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.QA_OUT||'docs/qa/monster-defense-daily-entry-20261026/browser'),publicBase=process.env.QA_PUBLIC_BASE||'',short=process.env.QA_SCOPE==='lobby';
await fs.mkdir(out,{recursive:true});if(publicBase)assert.equal(new URL(publicBase).hostname,'cnine-card.pages.dev');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),contexts=[],errors=[],checks=[],publicFiles=new Map();
async function open(user,width){
 const context=await browser.newContext({viewport:{width,height:width<700?844:1000},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);
 await context.addInitScript(({id,loadout})=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_defense_loadout_v1:'+id,JSON.stringify(loadout));},{id:user,loadout:defenseOwnedLoadout()});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==h.origin)return route.abort();if(!publicBase||url.pathname.startsWith('/api/')||url.pathname.startsWith('/__qa/'))return route.continue();const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key,{signal:AbortSignal.timeout(30000)});assert(r.ok,key);return {status:r.status,contentType:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());return route.fulfill(await publicFiles.get(key));});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(h.origin+'/defense/');await page.waitForFunction(()=>window.CoopDefenseReview);return page;
}
async function shot(page,name,locator){await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(locator)await locator.screenshot({path:path.join(out,name+'.png')});else await page.screenshot({path:path.join(out,name+'.png')});}
async function quota(id){return (await h.api(id,'defense/feature')).dailyEntry;}
try{
 const settings=(await h.api(1,'admin/defense/settings')).settings;settings.mode='ON';assert.equal((await h.api(1,'admin/defense/settings',{settings,requestId:crypto.randomUUID()})).status,200);
 for(const id of [2,3])await h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?)',args:[defenseDailyEntryKey(id),JSON.stringify({version:1,day:defenseEntryDay().day,used:short?3:2})]}]);
 const pc=await open(2,1440),mobile=await open(3,390);
 for(const page of [pc,mobile]){assert.match(await page.locator('#daily-entry-status').textContent(),new RegExp(short?'0 / 3':'1 / 3'));assert.equal(await page.locator('#create-room').isDisabled(),short);assert.equal(await page.locator('#find-rooms').isDisabled(),short);assert.equal(await page.locator('#practice').isDisabled(),false);}
 await shot(pc,'01-lobby-desktop');await shot(mobile,'02-lobby-mobile');checks.push('PC/mobile show shared daily quota and KST reset; exhausted real entry is disabled, practice remains free');
 if(!short){
  await pc.locator('[data-capacity="2"]').click();await pc.locator('#create-room').click();await pc.locator('#waiting-room').waitFor({state:'visible'});const roomId=await pc.evaluate(()=>CoopDefenseReview.diagnostics().roomId);
  await mobile.locator('#find-rooms').tap();await mobile.locator('[data-room-join="'+roomId+'"]').tap();await mobile.locator('#waiting-room').waitFor({state:'visible'});assert.equal((await quota(2)).remaining,1);
  await pc.locator('#ready').click();await mobile.locator('#ready').tap();await pc.locator('#start:enabled').waitFor();
  const startIds=[];let lost=false;
  await pc.route('**/api/defense/live/command*',async route=>{const body=route.request().postDataJSON();if(body?.command?.type==='START'){startIds.push(body.requestId);if(!lost){lost=true;await route.fetch();return route.abort('failed');}}return route.continue();});
  await pc.locator('#start').click();await pc.waitForFunction(()=>CoopDefenseReview.diagnostics().phase==='PREP'||CoopDefenseReview.diagnostics().phase==='WAVE');await mobile.waitForFunction(()=>CoopDefenseReview.diagnostics().phase==='PREP'||CoopDefenseReview.diagnostics().phase==='WAVE');assert.equal((await quota(2)).remaining,0);assert.equal((await quota(3)).remaining,0);assert.equal(startIds.length,2);assert.equal(startIds[0],startIds[1]);checks.push('lost successful START response retries the same request ID and charges each member once');
  // Simulate a revoked/expired room ticket despite a still-valid client expiry.
  const renewed=pc.waitForResponse(r=>new URL(r.url()).pathname==='/api/defense/session'&&r.status()===200);await fetch(h.origin+'/__qa/defense-drop-tickets/'+roomId);await renewed;await pc.waitForFunction(()=>CoopDefenseReview.diagnostics().connected&&CoopDefenseReview.diagnostics().screen==='battle');assert.equal((await quota(2)).remaining,0);
  const before=(await h.room(roomId)).time;await mobile.context().setOffline(true);await mobile.waitForTimeout(1800);assert((await h.room(roomId)).time>=before);await mobile.context().setOffline(false);
  await mobile.evaluate(()=>sessionStorage.clear());await mobile.reload();await mobile.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().screen==='battle');assert.equal(await mobile.evaluate(()=>CoopDefenseReview.diagnostics().roomId),roomId);assert.equal((await quota(3)).remaining,0);checks.push('expired tickets renew automatically; disconnect/reload without local session restores the same server room at zero remaining');
  const r=await h.room(roomId);r.phase='DEFEAT';r.coreHp=0;r.finishedAt=Date.now();await h.room(roomId,r);
  for(const page of [pc,mobile]){await page.locator('#result').waitFor({state:'visible'});assert.match(await page.locator('#result-entry-status').textContent(),/1회 사용.*24시간/);}
  await shot(mobile,'03-failed-result-insurance');await pc.locator('#return-lobby').click();await mobile.locator('#return-lobby').tap();
  for(const page of [pc,mobile]){await page.locator('#lobby').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('daily-entry-status').textContent.includes('0 / 3'));assert(await page.locator('#create-room').isDisabled());assert(await page.locator('#find-rooms').isDisabled());}
  await shot(pc,'04-zero-desktop',pc.locator('.deployment-dock'));await shot(mobile,'05-zero-mobile',mobile.locator('.deployment-dock'));checks.push('failure retains the debit; zero remaining blocks create/join buttons while showing reconnect/24-hour result insurance');
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify({status:'PASS',publicBase,publicFiles:publicFiles.size,checks,errors,operationalWrites:0},null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks:checks.length,out,publicFiles:publicFiles.size}));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:error.stack,errors,checks},null,2));for(const [i,c]of contexts.entries())for(const p of c.pages())await p.screenshot({path:path.join(out,'failure-'+i+'.png')}).catch(()=>{});throw error;}finally{await browser.close();await h.dispose();}
