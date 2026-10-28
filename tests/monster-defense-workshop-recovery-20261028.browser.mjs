import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
import {advanceRoom} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {growthTier} from '../shared/monster-defense-growth-v2.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.DEFENSE_QA_OUT||'../monster-defense-workshop-recovery-qa');await fs.mkdir(out,{recursive:true});
const h=await monsterDefenseFixture(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const checks=[],errors=[],assets=new Map(),posts=[];
const session=await h.api(1,'defense/create',{capacity:2,practice:true,difficulty:'NORMAL',loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()});assert.equal(session.status,200);
await h.ready(session);assert.equal((await h.live(session,'command',{requestId:crypto.randomUUID(),command:{type:'START'}})).status,200);
async function prep(){const r=await h.room(session.roomId);r.players.forEach(p=>{p.bot=false;p.growth.readyWave=-1;});r.phase='PREP';r.wave=27;r.spawnQueue=[];r.enemies=[];r.phaseUntil=r.time+600000;r.prepStartedAt=r.time;r.players[0].credits=1800;r.growthPolicy.tiers.forEach(t=>t.chance=100);r.seq++;r.serverAt=Date.now();await h.room(session.roomId,r);return r;}
async function nextWave(){const r=await h.room(session.roomId);r.phaseUntil=r.time+1;advanceRoom(r,100);r.serverAt=Date.now();await h.room(session.roomId,r);assert.equal(r.phase,'WAVE');return r;}
async function screenshot(p,name){await p.screenshot({path:path.join(out,name+'.png')});}
try{
 for(const [label,width,height]of [['pc',1517,1061],['mobile',390,844]]){
  await prep();const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});let late=false,dropped=false;
  await context.addInitScript(()=>{
   localStorage.setItem('cnine_card_api_token','local-qa-1');
   const original=requestAnimationFrame.bind(window),queued=[];window.qaFreezeFrames=false;
   window.requestAnimationFrame=fn=>original(t=>window.qaFreezeFrames?queued.push(fn):fn(t));
   window.qaResumeFrames=()=>{window.qaFreezeFrames=false;for(const fn of queued.splice(0))original(fn);};
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==h.origin)return route.abort();
   if(url.pathname==='/api/defense/live/command'){
    const payload=route.request().postDataJSON();posts.push(payload);
    if(late&&payload.command.type==='FORGE'&&!dropped){dropped=true;const result=await route.fetch();assert.equal(result.status(),200);await nextWave();return route.abort('failed');}
    return route.continue();
   }
   if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/__qa/'))return route.continue();
   const response=await route.fetch();if(response.status()!==404)return route.fulfill({response});
   const file=decodeURIComponent(url.pathname).slice(1);assert(!file.includes('..'));
   try{if(!assets.has(file))assets.set(file,execFileSync('git',['show','HEAD:'+file],{cwd:root,windowsHide:true,maxBuffer:40e6,stdio:['ignore','pipe','ignore']}));
    const type={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)];return route.fulfill({body:assets.get(file),contentType:type||'application/octet-stream'});
   }catch{return route.fulfill({response});}
  });
  const p=await context.newPage();p.on('pageerror',e=>errors.push({label,message:e.message,stack:e.stack}));await p.goto(h.origin+'/defense/');
  await p.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1,null,{timeout:60000});
  if(!await p.locator('.dw').isVisible())await p.locator('#upgrade').click();
  await p.locator('[data-action=forge]:enabled').waitFor();await p.locator('[data-branch=VITAL]').click();await screenshot(p,label+'-forge');
  assert.equal(await p.locator('.dw').evaluate(d=>d.scrollWidth>d.clientWidth+1),false,'workshop horizontal overflow');
  const initial=await h.room(session.roomId),before=initial.players[0].growth.attemptSeq;
  const firstCost=growthTier(initial.growthPolicy,initial.players[0].growth.levels.VITAL+1).cost;
  await p.evaluate(()=>window.qaFreezeFrames=true);await p.locator('[data-action=forge]').click();
  await p.waitForFunction(()=>document.querySelector('.dw-forge-result')?.textContent.includes('반응로 가동 중'),null,{polling:50,timeout:5000});
  await p.waitForFunction(()=>document.querySelector('.dw-forge-result')?.textContent.includes('강화 결과'),null,{polling:50,timeout:5000});
  assert.equal(await p.locator('[data-action=forge]').isEnabled(),true);await screenshot(p,label+'-fallback-result');await p.evaluate(()=>window.qaResumeFrames());
  let r=await h.room(session.roomId);assert.equal(r.players[0].growth.attemptSeq,before+1);assert.equal(r.players[0].credits,1800-firstCost);checks.push(label+': paused animation settles the persisted result within 3 seconds, one '+firstCost+'P charge');
  const secondCost=growthTier(r.growthPolicy,r.players[0].growth.levels.VITAL+1).cost;
  await p.evaluate(()=>window.qaFreezeFrames=true);await p.locator('[data-action=forge]').click();await p.waitForFunction(()=>document.querySelector('.dw-forge-result')?.textContent.includes('반응로 가동 중'),null,{polling:50,timeout:5000});
  await nextWave();await p.locator('.dw').waitFor({state:'hidden',timeout:2500});await p.evaluate(()=>window.qaResumeFrames());await screenshot(p,label+'-next-wave');
  r=await h.room(session.roomId);assert.equal(r.players[0].growth.attemptSeq,before+2);assert.equal(r.players[0].credits,1800-firstCost-secondCost);checks.push(label+': wave 28 closes the stalled workshop immediately and combat remains visible');
  r=await prep();const thirdCost=growthTier(r.growthPolicy,r.players[0].growth.levels.VITAL+1).cost;await p.waitForFunction(()=>CoopDefenseReview.snapshot().phase==='PREP');await p.locator('#upgrade').click();late=true;
  const postStart=posts.length;await p.locator('[data-action=forge]').click();await p.locator('.dw').waitFor({state:'hidden',timeout:5000});
  await p.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('강화 성공'),null,{timeout:5000});
  await p.waitForTimeout(600);r=await h.room(session.roomId);assert.equal(r.players[0].growth.attemptSeq,before+3);assert.equal(r.players[0].credits,1800-thirdCost);
  const retry=posts.slice(postStart).filter(x=>x.command.type==='FORGE');assert.equal(retry.length,2);assert.equal(retry[0].requestId,retry[1].requestId);checks.push(label+': lost response retries the same ID; first receipt arriving in combat closes the dialog, one charge');
  await screenshot(p,label+'-late-receipt');await p.reload();await p.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.rendererCount===1,null,{timeout:60000});assert.equal(await p.locator('.dw').isVisible(),false);assert.equal((await h.room(session.roomId)).players[0].growth.attemptSeq,before+3);checks.push(label+': reload resumes the same room without another forge');
  await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors,fixture:h.temp,staticFallbackFiles:assets.size,productionAccountWrites:0},null,2)+'\n');console.log(JSON.stringify({out,checks,errors}));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,checks,errors},null,2));for(const [i,p]of browser.contexts().flatMap(c=>c.pages()).entries())await screenshot(p,'failure-'+i).catch(()=>{});throw error;}
finally{await browser.close();await h.mf.dispose();}
