import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {OVERHEAD,MODES,makePlan,sample,ACTIVE_MOTION_KEYS,OVERHEAD_MODES} from '../skill.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.VALTER_REVIEW_URL||'http://127.0.0.1:8851';
const scope='/preview/mercenary-crimson-silver-knight-battle-v1/';
const out=new URL('./qa/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={date:'2026-10-01',base,viewports:[],requestedAssets:[],errors:[]};
const assets=new Set();
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const u=new URL(r.url());if(u.origin===base&&['http:','https:'].includes(u.protocol))assets.add(u.pathname);if(r.status()>=400)errors.push(`${r.status()} ${u.pathname}`);});
  await page.goto(base+scope+'?v=17-valter-final',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.CrimsonKnightPreview?.diagnostics().ready,null,{timeout:25000});
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());
  assert.equal(await page.locator('h1').textContent(),'발테르');
  assert.equal(await page.evaluate(()=>window.CrimsonKnightPreview.manifest.name),'발테르');
  const art=await page.locator('.hero-art img').evaluate(img=>({url:new URL(img.currentSrc).pathname,width:img.naturalWidth,height:img.naturalHeight,filter:getComputedStyle(img).filter}));
  assert.equal(art.url,'/assets/ui/project-v/mercenaries/approved-20260930/crimson-silver-knight-source-art-approved-v8.png');
  assert.equal(art.width,1024);assert.equal(art.height,1536);assert.equal(art.filter,'none');
  await page.locator('.hero').screenshot({path:fileURLToPath(new URL(name+'-art.png',out))});
  const observations=[];
  for(const mode of Object.keys(MODES)){
   await page.selectOption('#mode',mode);
   const checkpoints=[0,...Array.from({length:13},(_,i)=>MODES[mode].duration*i/12),...(OVERHEAD_MODES.includes(mode)?[OVERHEAD.descent,OVERHEAD.contact,OVERHEAD.idle]:[])];
   const actual=await page.evaluate(times=>{const f=window.CrimsonKnightPreview.fx;return times.map(t=>{f.seek(t);return {time:t,pose:f.sample.pose,texture:f.merc.fullBodySprite.texture===f.assets.motion[f.sample.pose.key][f.sample.pose.frame],aura:f.diagnostics().aura.textureMatchesPose,visible:f.diagnostics().visibleSprites};});},checkpoints);
   for(const v of actual){assert.ok(ACTIVE_MOTION_KEYS.includes(v.pose.key));assert.deepEqual(v.pose,sample(makePlan({mode}),v.time).pose);assert.ok(v.texture&&v.aura);}
   if(OVERHEAD_MODES.includes(mode)){
    await page.evaluate(t=>window.CrimsonKnightPreview.fx.seek(t),OVERHEAD.contact);
    await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL(name+'-'+mode+'-impact.png',out))});
   }
   observations.push({mode,checkpoints:actual.length,frameAndAuraMatch:true});
  }
  await page.selectOption('#mode','ultimate');await page.check('#sound');
  await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx;f.seek(0);f.play();});
  await page.waitForFunction(()=>window.CrimsonKnightPreview.fx.audio.scheduled.length>0);
  const audio=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics().audio);
  assert.equal(audio.error,null);assert.equal(audio.scheduled.find(c=>c.key==='ultimate').contact,OVERHEAD.contact);assert.ok(audio.scheduled.every(c=>c.speed===1.2));
  await page.uncheck('#sound');await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());
  const at=await page.evaluate(()=>window.CrimsonKnightPreview.fx.time);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.CrimsonKnightPreview.fx.time),at);
  await page.click('#showcase');const start=Date.now();
  await page.waitForFunction(()=>window.CrimsonKnightPreview.showcase.completed,null,{timeout:35000});
  const complete=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());
  assert.equal(complete.pose.key,'idle');assert.equal(complete.pose.frame,0);assert.equal(complete.registeredTimelines,0);assert.equal(complete.visibleSprites,0);
  const seconds=(Date.now()-start)/1000;assert.ok(Math.abs(seconds-23)<1.5);
  await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL(name+'-idle.png',out))});
  await page.click('#showcase');await page.click('#cancel');
  const stop=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());assert.equal(stop.registeredTimelines,0);assert.equal(stop.pose.key,'idle');assert.equal(stop.showcase.active,false);
  await page.locator('details.frames summary').click();await page.locator('#sheets').scrollIntoViewIfNeeded();
  await page.evaluate(async()=>{for(const img of document.querySelectorAll('#sheets img')){img.loading='eager';await img.decode();}});
  const sheetCount=await page.evaluate(()=>window.CrimsonKnightPreview.manifest.activeMotionKeys.length+Object.keys(window.CrimsonKnightPreview.manifest.effects).length);
  assert.equal(await page.locator('#sheets figure').count(),sheetCount);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert.equal(overflow,false);
  assert.deepEqual(errors,[]);
  report.viewports.push({name,viewport,art,observations,audio:{error:audio.error,contact:OVERHEAD.contact,speed:1.2},showcaseSeconds:seconds,returnedToExactIdle:true,pauseAndCancel:true,overflow,errors});
  await page.evaluate(()=>window.CrimsonKnightPreview.dispose());await page.close();
 }
 report.requestedAssets=[...assets].sort();report.passed=true;
}catch(e){report.errors.push(e.stack);throw e;}
finally{await browser.close();await fs.writeFile(new URL('review-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,viewports:report.viewports.map(v=>({name:v.name,modes:v.observations.length,showcaseSeconds:v.showcaseSeconds})),requestedAssets:assets.size,errors:report.errors}));
