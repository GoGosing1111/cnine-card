import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {AREA_CUTIN_PROFILES} from '../shared/mercenary-area-cutins-v1.mjs';
const root=process.cwd(),out=process.env.SSS_ENTRY_OUT||'C:/Users/User/Downloads/upload/cnine-card/operations/sss-area-cutins-20261028/entry',publicBase=process.env.SSS_PUBLIC_BASE||'';
fs.mkdirSync(out,{recursive:true});
const fixtures=JSON.parse(fs.readFileSync('preview/sss-area-cutscenes-20261028/fixtures.json')),cards=fixtures.payloads['V-975'].cards;
const roots=[root,'C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site','C:/Users/User/Downloads/upload/cnine-card'].map(p=>path.resolve(p));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg','.ico':'image/x-icon'};
const missing=[],publicFiles=new Map(),reports=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);if(r.status>=400)missing.push(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 for(const base of roots){let file=path.resolve(base,'.'+decodeURIComponent(url.pathname));if(file!==base&&!file.startsWith(base+path.sep))continue;if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);return;}}
 missing.push(url.pathname);res.writeHead(404).end();
 }catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const width of (publicBase?[390]:[1440,390])){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/?screen=pvp',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'컷신 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');await ensureFeatureResources('battleV2');if(!document.getElementById('modal'))document.body.insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');document.querySelector('[data-miracle-close]')?.click();});
  assert((await page.evaluate(()=>ProjectVPixiBattle.runtimeVersion)).endsWith('-sss-area-cutin-once-20261028-v1'));
  for(const mode of ['PVP','HUNT']){
   const code='V-975',profile=AREA_CUTIN_PROFILES.find(p=>p.code===code),mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};
   const data=mode==='HUNT'?structuredClone(fixtures.payloads[code]):{mode:'PVP',battleV2:createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:77})};
   data.battleV2.result.timeline=[];delete data.battleV2.result.final;
   if(mode==='HUNT')await page.addScriptTag({url:base+'/preview/sustained-hunt-v2/battle.bundle.js'});
   await page.evaluate(async({data,cards,mode})=>{
    window.cnineCardCatalog=()=>cards;const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
    api.mountForBattle=async(...args)=>(engine=await original(...args));
    try{const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:'컷신 검수',opponentName:'검수 상대'});
     const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode,playerName:'컷신 검수'});
     await engine.deployCards({instant:true,force:true});window.entryQa={engine,renderer,hp:[],cutins:0};
    }finally{api.mountForBattle=original;}
   },{data,cards,mode});
   const report=await page.evaluate(async({profile,mode})=>{
    const e=entryQa.engine,actor=e.mercenaries.find(a=>a.team==='ALLY'),original=e.syncTargetHp,tl=e.timeline;
    e.syncTargetHp=function(t,hp,...rest){if(hp<99)entryQa.hp.push(t.id);return original.call(this,t,hp,...rest);};
    e.timeline=function(...args){if(e.activeMercenaryAreaCutin)entryQa.cutins++;return tl.apply(this,args);};
    if(mode==='HUNT'){
     const skill=profile.skills[0],targets=e.enemies;
     const event=hp=>({type:profile.event,actorId:actor.id,battleMode:'PVE',skillId:skill.id,visualMode:skill.visualMode,hits:targets.map(t=>({targetId:t.id,damage:10,targetHpAfter:t.serverMaxHp*hp,targetMaxHp:t.serverMaxHp,targetShieldAfter:0}))});
     // Use the actual main renderer's playback loop and timeout path.
     e.battleData.battleV2.result.timeline.push(event(.8),event(.6));
     await entryQa.renderer.play();
    }else{await e.normalAttack(0,{attacker:actor,target:e.enemies[0],damage:1,targetHp:80,onImpact:()=>{entryQa.basicHit=(entryQa.basicHit||0)+1;}});}
    return {mode,allies:e.allies.length,enemies:e.enemies.length,hp:entryQa.hp.length,cutins:entryQa.cutins,basicHit:entryQa.basicHit||0,dialogue:document.querySelector('.jinmu-dialogue-rail')?.dataset.theme||null,overlay:!!e.activeMercenaryAreaCutin,error:!!document.querySelector('.is-v3-error'),version:ProjectVPixiBattle.runtimeVersion};
   },{profile,mode});
   assert.equal(report.allies,5);assert(!report.error);assert(!report.overlay);
   if(mode==='HUNT'){assert.equal(report.cutins,1);assert.equal(report.hp,24);assert.equal(report.dialogue,profile.dialogue.theme);}
   else{assert.equal(report.cutins,0);assert.equal(report.basicHit,1);assert.equal(report.dialogue,null);}
   await page.screenshot({path:path.join(out,(publicBase?'public-':'local-')+width+'-'+mode+'.png')});
   reports.push({width,...report});console.log('PASS main entry '+width+' '+mode);
   await page.evaluate(async()=>{entryQa.renderer.destroy();await ProjectVPixiBattle.whenReleased();});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,(publicBase?'public':'local')+'-entry.json'),JSON.stringify({ok:true,reports,publicBase,publicAssets:publicFiles.size,productionAccountWrites:0},null,2));
}catch(error){fs.writeFileSync(path.join(out,(publicBase?'public':'local')+'-failure.json'),JSON.stringify({error:error.stack,missing,reports},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
