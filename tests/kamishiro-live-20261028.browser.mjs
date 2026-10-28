import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const field=process.env.QA_FIELD||'PVP';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/kamishiro-live-20261028'),reproduce=process.env.QA_REPRODUCE==='1',publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const payload=code=>{const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};if(field==='HUNT')return createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'카미시로 검수'},seed:7919,limitMs:15000}).payload;return {battleV2:createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:77})};};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],publicFiles=new Map();const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/api/mercenary-codex'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})));}
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){try{const rel=path.relative(root,file).replaceAll('\\','/');const bytes=execFileSync('git',['show','HEAD:'+rel],{cwd:root,windowsHide:true,maxBuffer:64e6,stdio:['ignore','pipe','ignore']});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(bytes);}catch{}}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of (process.env.QA_WIDTHS?.split(',').map(Number)||(publicBase?[390]:[1440,390]))){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/?screen=pvp',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'전투 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');await ensureFeatureResources('battleV2');if(!document.getElementById('modal'))document.body.insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');document.querySelector('[data-miracle-close]')?.click();});
  if(field==='HUNT')await page.addScriptTag({url:base+'/preview/sustained-hunt-v2/battle.bundle.js'});
  assert.match(await page.evaluate(()=>ProjectVPixiBattle.runtimeVersion),/kamishiro-live-20261028-v1$/);
  for(const code of (process.env.QA_CODES?.split(',')||['V-969'])){
   const data=payload(code);
   await page.evaluate(async({data,deck,field})=>{
    window.cnineCardCatalog=()=>deck;const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
    api.mountForBattle=async(...args)=>(engine=await original(...args));
    try{
     const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'카미시로 검수',opponentName:'검수 상대'});
     const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode:field,playerName:'카미시로 검수'});
     await engine.deployCards({instant:true,force:true});window.bc={engine,renderer};
    }finally{api.mountForBattle=original;}
   },{data,deck,field});
   await page.waitForFunction(count=>bc.engine.kamishiroStates?.size===count,field==='HUNT'?1:2,{timeout:30000});
   const setup=await page.evaluate(()=>({allies:bc.engine.allies.length,enemies:bc.engine.enemies.length,actors:[...bc.engine.kamishiroStates.values()].map(s=>({side:s.actor.team,facing:s.actor.view.scale.x,d:s.fx.diagnostics()}))}));
   assert.equal(setup.allies,5);assert.equal(setup.enemies,field==='HUNT'?12:5);assert.equal(setup.actors.length,field==='HUNT'?1:2);
   for(const s of setup.actors){assert.equal(s.d.bodyRegistration.renderedReference,310);assert(s.d.bodyRegistration.uniform);assert.equal(s.d.idleBodyFixed,true);assert(s.side==='ALLY'?s.facing>0:s.facing<0);assert.equal(s.d.mode,'idle');}
   await page.screenshot({path:path.join(out,field+'-'+width+'-'+code+'-idle.png')});
   const outcomes=[];
   for(const side of (field==='HUNT'?['ALLY']:['ALLY','ENEMY'])){
    for(const skill of (field==='HUNT'?limitedDeploymentSnapshot(code).skills:[])){
     const result=await page.evaluate(async({side,skill})=>{
      const e=bc.engine,s=[...e.kamishiroStates.values()].find(s=>s.actor.team===side),targets=(side==='ALLY'?e.enemies:e.allies).slice(0,skill.targetCount);
      const event={type:'MERCENARY_KAMISHIRO_AREA',battleMode:'PVE',actorId:s.actor.id,skillId:skill.id,hits:targets.map(t=>({targetId:t.id,damage:10,absorbed:0,targetHpAfter:t.serverMaxHp*.9,targetMaxHp:t.serverMaxHp,targetShieldAfter:0,targetMaxShield:0}))};
      const original=e.syncTargetHp,applied=[],samples=[];e.syncTargetHp=function(t,v){applied.push({id:t.id,at:performance.now()});return original.call(this,t,v);};
      const begin=performance.now(),timer=setInterval(()=>{const d=s.fx.diagnostics();samples.push({time:d.time,pose:d.pose,contacts:d.contacts,registration:d.bodyRegistration});},25);
      try{await e.playMercenaryEvent(event);}finally{clearInterval(timer);e.syncTargetHp=original;}
      return {side,skill:skill.id,elapsed:performance.now()-begin,applied:applied.map(a=>({...a,at:a.at-begin})),samples,last:e.lastMercenaryPlayback,end:s.fx.diagnostics()};
     },{side,skill});
     assert.equal(result.last.code,code);assert.equal(result.last.mode,skill.visualMode);assert.equal(result.last.playbackRate,3.75);assert.equal(result.last.damageApplications,12);assert.equal(result.applied.length,12);assert.equal(new Set(result.applied.map(a=>a.id)).size,12);assert.equal(result.end.mode,'idle');assert.equal(result.end.activeEffects,0);
     assert(result.samples.every(s=>s.registration.uniform&&Math.abs(s.registration.renderedReference-310)<1e-6));
     assert(result.samples.every(s=>Number.isFinite(s.time)));
     assert(Math.abs(result.elapsed-result.last.durationSeconds/3.75*1000)<800,'3.75x playback '+result.elapsed);outcomes.push(result);
     await page.evaluate(({side,skill})=>{const e=bc.engine,s=[...e.kamishiroStates.values()].find(s=>s.actor.team===side),targets=(side==='ALLY'?e.enemies:e.allies).slice(0,skill.targetCount);s.fx.begin(skill.visualMode,targets);s.fx.render(s.fx.plan.peak);},{side,skill});
     await page.screenshot({path:path.join(out,field+'-'+width+'-'+code+'-'+side+'-'+skill.id+'.png')});await page.evaluate(()=>{for(const s of bc.engine.kamishiroStates.values())s.fx.cancel();});
    }
    for(let basicIndex=0;basicIndex<3;basicIndex++){
     const basic=await page.evaluate(async side=>{const e=bc.engine,a=e.mercenaries.find(a=>a.team===side),t=(side==='ALLY'?e.enemies:e.allies)[0],s=e.kamishiroStates.get(a),home={x:a.baseX,y:a.baseY};let count=0;
      const begin=performance.now();await e.normalAttack(0,{attacker:a,target:t,damage:1,targetHp:80,onImpact:()=>count++});const last=e.lastMercenaryPlayback,elapsed=performance.now()-begin,returned={x:a.root.x,y:a.root.y};
      s.fx.begin(last.mode,[t]);s.fx.render(s.fx.plan.hits[0].at);const f=s.fx,w=f.weaponContainer,m=f.spec.weapon,g=w.toGlobal({x:0,y:0}),tip=w.toGlobal({x:m.tip.x-m.grip.x,y:m.tip.y-m.grip.y}),p=e.effectLayer.toGlobal(f.targetPoint(t)),dx=tip.x-g.x,dy=tip.y-g.y,u=Math.max(0,Math.min(1,((p.x-g.x)*dx+(p.y-g.y)*dy)/(dx*dx+dy*dy))),distance=Math.hypot(p.x-g.x-u*dx,p.y-g.y-u*dy);
      return {count,last,elapsed,home,returned,travel:f.travelState,reach:{distance,length:Math.hypot(dx,dy)},copies:f.diagnostics().characterCopies};},side);
     assert.equal(basic.count,1);assert.equal(basic.last.eventType,'ATTACK');assert.equal(basic.last.mode,['cleave','rise','thrust'][basicIndex]);assert.equal(basic.travel.progress,1);assert(Math.abs(basic.travel.position.x-basic.home.x)>40);assert.equal(basic.copies,0);assert.deepEqual(basic.returned,basic.home);assert(basic.reach.distance<basic.reach.length*.12,'Direct blade contact '+JSON.stringify(basic));assert(Math.abs(basic.elapsed-basic.last.durationSeconds/3.75*1000)<800);
     outcomes.push({...basic,side,kind:'basic'});await page.screenshot({path:path.join(out,field+'-'+width+'-'+code+'-'+side+'-'+basic.last.mode+'.png')});await page.evaluate(()=>{for(const s of bc.engine.kamishiroStates.values()){s.fx.cancel();s.fx.startAmbient();}});
    }
   }
   const lifecycle=await page.evaluate(async()=>{
    const e=bc.engine,s=[...e.kamishiroStates.values()][0],targets=e.enemies.slice(0,3);s.fx.begin('ruin',targets);s.fx.render(1.7);e.cancelTimelines();const stopped=s.fx.diagnostics();s.actor.setHp(0);const dead=s.fx.layer.children.some(c=>c.visible);s.actor.setHp(100);await e.setVisible(false);await e.setVisible(true);const revived=s.fx.diagnostics();e.reducedMotion=true;await e.normalAttack(0,{attacker:s.actor,target:targets[0],damage:1,targetHp:70});e.reducedMotion=false;
    const until=performance.now()+2000;while(e.simpleTimelines.size&&performance.now()<until)await new Promise(r=>setTimeout(r,25));return {stopped,dead,revived,timelines:e.simpleTimelines.size};
   });assert.equal(lifecycle.stopped.activeEffects,0);assert.equal(lifecycle.dead,false);assert.equal(lifecycle.revived.mode,'idle');assert.equal(lifecycle.timelines,field==='HUNT'?1:2);
   reports.push({field,width,code,setup,outcomes,lifecycle});console.log(width+' '+code+' PASS');
   await page.evaluate(async()=>{bc.renderer.destroy();await ProjectVPixiBattle.whenReleased();});
  }
  await page.goto(base+'/mercenary-codex/?view=limited&q=카미시로&rank=SSS#V-969',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('inspection')?.textContent.includes('카미시로'),{timeout:20000});
  if(width<=760)await page.locator('.roster-row[data-code="V-969"]').click();
  await page.locator('#inspection .combat-details > summary').click();
  const codex=await page.locator('#inspection').innerText();assert(codex.includes('3,000,000'));for(const name of ['흑염참','혈선역참','암영돌파','적월멸검','흑경난무'])assert(codex.includes(name),name);
  await page.screenshot({path:path.join(out,'codex-'+width+'.png'),fullPage:true});reports.push({width,codex});
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,(publicBase?'public-':'local-')+field+'-battle.json'),JSON.stringify({ok:true,source:publicBase||'local',reports,productionTransactions:0},null,2));
}catch(e){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({error:e.stack,missing,reports},null,2));throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
