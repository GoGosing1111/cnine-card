// Actual released theatre renderer and local account handler; no production writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {fillLegionMapDrafts} from '../scripts/ops/legion-map-drafts-20261018.mjs';
import {legionRegionDefaults,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {legionBalanceSnapshot,profiles} from '../scripts/measure-legion-regions-20261008.mjs';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {emptyPetDraft} from '../shared/pet-cms-v1.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=process.env.LEGION_STALL_QA_DIR;
assert(out&&!path.resolve(out).startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const baseline=process.env.LEGION_STALL_BASELINE==='1';
const baselineSource='caf475f60679b543c1f4c20d1c3b21b34b23e7c2';
const oldApp=baseline?execFileSync('git',['show',baselineSource+':preview/sustained-hunt-v2/app.js'],{encoding:'utf8',cwd:root}):null;
const oldBundle=baseline?execFileSync('git',['show',baselineSource+':preview/sustained-hunt-v2/battle.bundle.js'],{encoding:'utf8',cwd:root,maxBuffer:30000000}):null;
const f=await legionFixture();await seedRegionalCatalog(f);await f.configure(3);
const {body}=await f.call('admin/legion-hunt');body.policy.mode='ON';await f.call('admin/legion-hunt',{policy:body.policy},{method:'PATCH'});
const regional=fillLegionMapDrafts(body.policy,legionRegionDefaults()).policy;regional.mode='ON';
await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(LEGION_REGIONS_KEY,JSON.stringify(regional)).run();
const snapshot=legionBalanceSnapshot(profiles[3]);snapshot.mercenary=candidate('V-055');
const petArt=PET_ART_CATALOG.find(p=>p.code==='PET-MOON-FOX');
snapshot.pet={magnet:true,definition:{...emptyPetDraft(petArt.code),name:petArt.name,enabled:true,battleSprite:petArt.sourceArt,buffs:[{type:'ATTACK_PERCENT',percent:0}]}};
let lastPayload,shift=0;
f.deps.createSession=options=>{try{const s=createHuntSession({...options,snapshot,seed:7919});lastPayload=s.payload;return s;}catch(error){console.error(error.stack);throw error;}};
f.setUser(f.player);
const requests=[],mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');
 if(url.pathname.startsWith('/api/')){
  let raw='';for await(const chunk of req)raw+=chunk;
  f.clock.now=Date.now()+shift;
  const result=await f.call(url.pathname.slice(5),req.method==='GET'?undefined:JSON.parse(raw||'{}'));
  requests.push({path:url.pathname,status:result?.status});res.writeHead(result?.status||200,{'content-type':'application/json'});return res.end(JSON.stringify(result?.body||{}));
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
 if(file===path.join(root,'preview/sustained-hunt-v2/app.js'))return res.end((oldApp||fs.readFileSync(file,'utf8')).replace('  window.HuntPreviewV2=',"  Object.defineProperty(window,'qaEngine',{get:()=>engine});\n  window.HuntPreviewV2="));
 if(oldBundle&&file===path.join(root,'preview/sustained-hunt-v2/battle.bundle.js'))return res.end(oldBundle);
 fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report=[];
try{
 for(const width of baseline?[1440]:[1440,390]){
  shift=0;const errors=[],page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});
  page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),new URL(r.url()).pathname);});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(origin+'/pve/legion-hunt/',{waitUntil:'networkidle'});
  await page.evaluate(()=>{
   window.postMessage({type:'legion-hunt-enter',difficulty:'nightmare',regionId:'theatre'},location.origin);
  });
  await page.waitForFunction(()=>HuntPreviewV2.diagnostics().playing||!document.querySelector('#hunt-interruption').hidden,null,{timeout:30000});
  await page.waitForTimeout(1500);
  console.log('ENGINE',JSON.stringify(await page.evaluate(()=>({keys:Object.keys(window.qaEngine||{}).filter(k=>/hunt|play|skill/i.test(k)),hunt:qaEngine?.huntRun,phase:!!qaEngine?.skillChipPlayback,hidden:document.hidden,background:qaEngine?.huntBackground}))));
  await page.waitForFunction(()=>!!window.qaEngine?.skillChipPlayback?.timeline||!document.querySelector('#hunt-interruption').hidden,null,{timeout:45000}).catch(async error=>{
   console.log('SETUP',JSON.stringify(await page.evaluate(()=>({message:document.querySelector('#hunt-message').textContent,keys:Object.keys(window.qaEngine||{}).filter(k=>/hunt|play|skill/i.test(k)),hunt:qaEngine?.huntRun,phase:qaEngine?.skillChipPlayback?.diagnostics(),visible:qaEngine?.visible,background:qaEngine?.huntBackground,engine:!!window.qaEngine}))),requests);
   await page.screenshot({path:path.join(out,width+'-setup-error.png')});throw error;
  });
  assert(await page.evaluate(()=>!!window.qaEngine?.skillChipPlayback?.timeline),(await page.locator('#hunt-message').textContent())+' '+JSON.stringify(requests));
  const eventCount=lastPayload.battleV2.result.timeline.length;
  console.log('START',width,eventCount,lastPayload.battleV2.result.timeline.at(-1));
  shift=420000;
  await page.evaluate(()=>{
   const assets=ProjectVPixiBattle.fxRuntime.Assets,load=assets.load.bind(assets);
   // Inject a never-returning item texture, after character/background loading.
   assets.load=(url,...rest)=>typeof url==='string'&&/vehicle-part-frame/.test(url)?new Promise(resolve=>{window.stalledImage=true;window.releaseImage=()=>load(url,...rest).then(resolve);}):load(url,...rest);
   const p=qaEngine.skillChipPlayback;p.clock.time=qaEngine.huntPlaybackPlan.boss.combatAtMs/1000;p.pump();
  });
  await page.waitForFunction(()=>qaEngine.huntRun.bossEntered&&!!qaEngine.skillChipPlayback?.timeline,null,{timeout:15000});
  await page.screenshot({path:path.join(out,width+'-boss.png')});
  // Run the canonical post-boss events fast for QA; this does not alter payload,
  // damage, entry policy or the production 1x setting.
  await page.evaluate(()=>{qaEngine.skillChipPlayback.timeline.parent.timeScale(30);});
  await page.waitForFunction(()=>HuntPreviewV2.diagnostics().ending||document.querySelector('#hunt-result').open||!document.querySelector('#hunt-interruption').hidden,null,{timeout:45000});
  if(baseline){
   await page.waitForTimeout(1200);assert(await page.evaluate(()=>window.stalledImage));
   assert.equal(await page.evaluate(()=>document.querySelector('#hunt-result').open),false);
   assert.equal(requests.some(r=>r.path.endsWith('/finish')),false);
  }else{
   await page.waitForFunction(()=>document.querySelector('#hunt-result').open,null,{timeout:15000});
   assert(await page.evaluate(()=>window.stalledImage));
   assert.equal(await page.locator('#result-title').textContent(),'사냥 클리어');
  }
  const state=await page.evaluate(()=>({diagnostics:HuntPreviewV2.diagnostics(),message:document.querySelector('#hunt-message').textContent,time:document.querySelector('#hunt-time').textContent,result:document.querySelector('#hunt-result').open,overflow:document.documentElement.scrollWidth>innerWidth+1}));
  assert.equal(state.overflow,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,width+'-result.png')});
  if(!baseline){
   // Some browsers emit visibilitychange after a non-BFCache pagehide. A
   // disposed scene must not be resumed or have its destroyed actors reset.
   await page.evaluate(()=>{
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('freeze'));
    document.dispatchEvent(new Event('resume'));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false}));
   });
   assert.equal(await page.evaluate(()=>!!qaEngine),false);
  }
  await page.close();
  if(!baseline)assert.deepEqual(errors,[]);
  report.push({width,baseline,state,errors,requests:requests.splice(0)});
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.length,baseline,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));await f.close();}
