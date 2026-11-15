import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {saveRegionPolicy} from '../functions/_legion_regions.js';
import {legionRegionDefaults} from '../shared/legion-regions-v1.mjs';
import {ardenRows,cases,snapshotFor} from '../scripts/measure-equipment-defense-20261115.mjs';
import {equipmentGrowthFromRows} from '../functions/_equipment_growth.js';
import {ARDEN_ITEMS} from '../scripts/ops/arden-equipment-live-20261011.mjs';

const root=path.resolve(import.meta.dirname,'..'),project='C:/Users/User/Downloads/upload/cnine-card',out=path.join(root,'docs/qa/equipment-defense-sets-20261115');
const staged=path.join(project,'operations/equipment-polish-buff-20261114/staged');
const baseline='845243a3b',oldFiles=['mercenary-codex/equipment/index.html','mercenary-codex/equipment/app.mjs','mercenary-codex/equipment/ui.mjs','shared/equipment-growth-text-v1.mjs','js/character-loadout-v2.js'];
const old=new Map(oldFiles.map(f=>[f,execFileSync('git',['show',baseline+':'+f],{cwd:root,windowsHide:true,maxBuffer:15e6})]));
let variant='after',hunt;
const armory=await ascendantEquipmentFixture();
for(const mode of ['PVE','PVP'])for(const item of UNIQUE_MERCENARY_EQUIPMENT.filter(i=>i.tier===1))await armory.equip(mode,item);
const errors=[],missing=[],api=[],cache=new Map(),report=process.env.DEFENSE_QA_RESUME?JSON.parse(fs.readFileSync(path.join(out,'browser-partial.json'),'utf8')).report:[];
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const read=relative=>{if(variant==='before'&&old.has(relative))return old.get(relative);if(cache.has(relative))return cache.get(relative);let bytes;for(const base of [root,staged,project]){try{bytes=fs.readFileSync(path.join(base,relative));break;}catch{}}if(!bytes)bytes=execFileSync('git',['show','HEAD:'+relative],{cwd:root,windowsHide:true,maxBuffer:40e6,stdio:['ignore','pipe','pipe']});cache.set(relative,bytes);return bytes;};
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1'),send=(body,type='application/json',status=200)=>res.writeHead(status,{'content-type':type,'cache-control':u.pathname.startsWith('/api/')?'no-store':'public,max-age=3600'}).end(body);
 const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks);
 if(u.pathname.startsWith('/api/')){
  const start=performance.now();let result,status;
  if(u.pathname.startsWith('/api/legion-hunt/')){const r=await hunt.call(u.pathname.slice(5),bytes.length?JSON.parse(bytes):undefined,{method:req.method,query:u.search});result=r.body;status=r.status;}
  else {const request=new Request('http://'+req.headers.host+u.pathname+u.search,{method:req.method,headers:{...req.headers,origin:'http://'+req.headers.host},...(bytes.length?{body:bytes}:{})});const r=await handleMercenaryAccount({path:u.pathname.slice(5),request,env:armory.env,deps:armory.deps});if(!r)return send('{}','application/json',404);status=r.status;result=await r.json();}
  api.push({variant,path:u.pathname,ms:performance.now()-start,status,...(status>=400?{error:result}: {})});if(status>=400)console.log(JSON.stringify({api:u.pathname,status,result}));return send(JSON.stringify(result),'application/json',status);
 }
 if(u.pathname==='/character-fixture.js'){
  const runtime=variant==='after'?equipmentGrowthFromRows(ardenRows,7):{summary:'',sets:[]};
  const arden=ARDEN_ITEMS.map((i,n)=>({...i,instanceId:500+n}));
  return send(read('preview/live-character-loadout-v2-v1/preview.js').toString().replace("assetBase: '../../'","assetBase: '/' ").replace('  const wait = (ms)',`  for(const i of ${JSON.stringify(arden)}){fixture.instances.push(item(i.instanceId,i.code,i.name,i.slot,'MYTHIC',i.image,200000,180000,20000,i.subtype));fixture.loadout[i.slot]=i.instanceId;}\n  fixture.bonuses.pveEquipmentRuntime=${JSON.stringify(runtime)};\n  const wait = (ms)`),'text/javascript');
 }
 if(u.pathname==='/character-qa')return send('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/character-loadout-v2.css"><div id="characterLoadoutV2" class="character-loadout-v2-root"></div><script src="/js/character-loadout-v2.js"></script><script src="/character-fixture.js"></script></html>','text/html; charset=utf-8');
 let relative=decodeURIComponent(u.pathname).replace(/^\//,'');if(!relative||relative.endsWith('/'))relative+='index.html';assert(!relative.includes('..'));
 return send(read(relative),types[path.extname(relative)]||'application/octet-stream');
}catch(e){missing.push({path:req.url,message:e.message.slice(0,180)});res.writeHead(404).end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const frameStats=async(page,ms=1600)=>page.evaluate(ms=>new Promise(resolve=>{const frames=[];let first,last;function frame(t){first??=t;if(last)frames.push(t-last);last=t;if(t-first<ms)requestAnimationFrame(frame);else{frames.sort((a,b)=>a-b);resolve({count:frames.length,p95:frames[Math.floor(frames.length*.95)],max:Math.max(...frames),over50:frames.filter(x=>x>50).length});}}requestAnimationFrame(frame);}),ms);
try{
 for(const profile of [{name:'pc',width:1440,engine:chromium},{name:'android-emulated',width:390,engine:chromium},{name:'iphone-webkit-emulated',width:390,engine:webkit}]){
  const browser=await profile.engine.launch({headless:true,...(profile.engine===chromium?{channel:'chrome',args:['--mute-audio','--enable-unsafe-swiftshader']}:{})});
  try{for(variant of ['before','after']){
   if(process.env.DEFENSE_QA_CHARACTER_ONLY?variant==='before':report.some(r=>r.profile===profile.name&&r.variant===variant))continue;
   const context=await browser.newContext({viewport:{width:profile.width,height:profile.width===390?844:960},isMobile:profile.width===390,hasTouch:profile.width===390,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push({profile:profile.name,variant,message:e.message}));
   page.on('dialog',d=>d.accept());
   await context.addInitScript(()=>{if(location.protocol.startsWith('http')){localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');}});
   if(process.env.DEFENSE_QA_CHARACTER_ONLY){await page.goto(base+'/character-qa');await page.waitForSelector('.clv2-active-growth');assert.match(await page.locator('.clv2-active-growth').innerText(),/아르덴 4\/4.*방어 세트 완성/);await page.screenshot({path:path.join(out,'arden-'+profile.name+'.png'),fullPage:true});await context.close();continue;}
   const row={profile:profile.name,variant,condition:'Windows headless; mobile emulation; localhost actual API handlers with in-memory accounts; no live writes'};
   for(const entry of ['cold','reentry']){const begin=performance.now();await page.goto(base+'/mercenary-codex/equipment/');await page.waitForSelector('html[data-ready="true"]');row['armory'+entry+'Ms']=performance.now()-begin;if(entry==='cold'){row.armoryFrames=await frameStats(page);await page.goto('about:blank');}}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(variant==='after'){
    assert.match(await page.locator('#setEffects').innerText(),/유니크 1단계/);assert.match(await page.locator('#setEffects').innerText(),/피해감소 30%/);
    await page.locator('[data-mode="PVP"]').click();assert(!await page.locator('.defense-total').count());await page.locator('[data-mode="PVE"]').click();
    await page.screenshot({path:path.join(out,'armory-'+profile.name+'.png'),fullPage:true});
    const weapon=await page.locator('.equip-slot[data-slot="WEAPON"]').getAttribute('aria-label');assert(weapon.includes('별가름'));
    await page.locator('[data-view="unique"]').click();await page.locator('[data-item="MERC_UQ_11_WEAPON"]').click();assert.match(await page.locator('#inspection').innerText(),/같은 세트 5부위/);
    if(await page.locator('#gearDialog').isVisible())await page.locator('[data-close="gearDialog"]').click();
    await page.goto(base+'/character-qa');await page.waitForSelector('.clv2-active-growth');assert.match(await page.locator('.clv2-active-growth').innerText(),/아르덴 4\/4.*방어 세트 완성/);await page.screenshot({path:path.join(out,'arden-'+profile.name+'.png'),fullPage:true});
   }
   hunt=await legionFixture({regions:true});hunt.deps.now=()=>Date.now();await seedRegionalCatalog(hunt);await saveRegionPolicy(hunt.env,hunt.owner,legionRegionDefaults());
   const snapshot=snapshotFor(cases.find(c=>c[0]==='unique1')[1],true),deck=hunt.getDeck();
   if(variant==='before'){for(const runtime of [snapshot.characterBonus.pveEquipmentRuntime,snapshot.mercenary.equipment]){delete runtime.effects.defensePercent;delete runtime.effects.pveGuardPercent;}}
   hunt.setDeck({...deck,ids:snapshot.cards.map(c=>c.id),cards:snapshot.cards,characterBonus:{...deck.characterBonus,pve:snapshot.cardSupportBonus+300000,pveEquipmentRuntime:snapshot.characterBonus.pveEquipmentRuntime}});hunt.setMercenary(snapshot.mercenary);
   for(const entry of ['cold','reentry']){
    const begin=performance.now();await page.goto(base+'/pve/legion-hunt/');await page.waitForFunction(()=>window.HuntPreviewV2&&window.ProjectVPixiBattle);
    await page.evaluate(()=>{const api=ProjectVPixiBattle;for(const key of ['mountForBattle','resetSession']){const old=api[key];api[key]=async(...args)=>window.qaEngine=await old(...args);}window.postMessage({type:'legion-hunt-enter',difficulty:'normal',regionId:'coast'},location.origin);});
    await page.waitForFunction(()=>window.HuntPreviewV2?.diagnostics().playing||!document.querySelector('#hunt-interruption')?.hidden,null,{timeout:60000});assert(await page.evaluate(()=>HuntPreviewV2.diagnostics().playing),await page.locator('#hunt-message').textContent());row['hunt'+entry+'Ms']=performance.now()-begin;
    row['huntFrames'+entry]=await frameStats(page,2200);
    if(variant==='after'&&entry==='cold')await page.screenshot({path:path.join(out,'hunt-'+profile.name+'.png')});
    await page.locator('#hunt-stop').click();await page.waitForFunction(()=>!HuntPreviewV2.diagnostics().playing);
    row.exit=await page.evaluate(()=>{const before=HuntPreviewV2.diagnostics();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));const after=HuntPreviewV2.diagnostics();return {playing:before.playing,runCancelled:before.engine?.hunt?.run?.cancelled,canvasesAfterExit:after.canvasCount,engineAfterExit:!!after.engine};});assert.equal(row.exit.canvasesAfterExit,0);assert.equal(row.exit.engineAfterExit,false);await page.goto('about:blank');
   }
   await hunt.close();hunt=null;await context.close();report.push(row);fs.writeFileSync(path.join(out,'browser-partial.json'),JSON.stringify({report,api,errors,missing},null,2));console.log(JSON.stringify({...row,exit:row.exit}));
  }}finally{await browser.close();}
 }
 fs.writeFileSync(path.join(out,process.env.DEFENSE_QA_CHARACTER_ONLY?'character-browser.json':'browser.json'),JSON.stringify({report,api,errors,missing},null,2));assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
}finally{if(!process.env.DEFENSE_QA_CHARACTER_ONLY)fs.writeFileSync(path.join(out,'browser-partial.json'),JSON.stringify({report,api,errors,missing},null,2));if(hunt)await hunt.close();await armory.close();await new Promise(r=>server.close(r));}
