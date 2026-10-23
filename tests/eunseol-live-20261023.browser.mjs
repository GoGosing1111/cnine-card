// Local isolated fixtures in the actual main battle modal. No account/CMS writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {eunseolDeploymentSnapshot,EUNSEOL_AREA_SKILL} from '../shared/mercenary-eunseol-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.EUNSEOL_QA_OUTPUT||path.join(root,'docs/qa/eunseol-live-20261023');
fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],missing=[];
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...eunseolDeploymentSnapshot(),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'은설'},seed:7919,limitMs:15000});
const areaEvent=structuredClone(hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_EUNSEOL_AREA'&&e.hits.length===12));
assert(areaEvent,'authoritative Eunseol 12-target area receipt');
for(const hit of areaEvent.hits){hit.targetMaxHp=1e15;hit.targetHpAfter=1e15-(hit.damage||0);}
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'B:MERCENARY:V-973',cardId:'V-973',hp:100,maxHp:100,shield:0,maxShield:0};
const enemyPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck,mercenaries:[merc]}},result:{timeline:[]}}};
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(window.ensureFeatureResources){await window.ensureFeatureResources('battleV2');if(mode!=='enemy')await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/preview/sustained-hunt-v2/battle.bundle.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
 if(!document.getElementById('modal'))document.getElementById('app').insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');
 const data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('modal'),field=mode==='enemy'?'PVP':'HUNT',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'은설',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'은설'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 document.querySelector('#app .login-wrap')?.remove();
 window.EunseolQA={engine,renderer,event:data.event,mode,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  const bundle=mode==='enemy'?'/preview/project-v-v3/project-v-pixi-battle.bundle.js':'/preview/sustained-hunt-v2/battle.bundle.js';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  return res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head><base href="/">').replace('</body>',`<script defer src="${bundle}"></script><script defer src="/qa-boot.js"></script></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode==='enemy'?enemyPayload:areaPayload,event:mode==='enemy'?null:areaEvent});
 if(url.pathname.startsWith('/api/'))return json(res,{items:[],visible:false,enabled:false});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  for(const mode of label==='desktop'?['area','enemy','single']:['area']){
   console.log(label,mode);const p=await browser.newPage({viewport,serviceWorkers:'block'});
   p.on('pageerror',e=>{errors.push(label+' '+mode+': '+e.stack);console.error(e.stack);});
   p.on('response',r=>{if(r.status()===404&&r.url().includes('/eunseol-20261023/'))missing.push(r.url());});
   await p.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
   await p.goto(base+'/qa/battle?mode='+mode);
   await p.waitForFunction(()=>window.EunseolQA?.ready||window.qaError,null,{timeout:60000});
   assert.equal(await p.evaluate(()=>window.qaError),undefined);
   await p.waitForFunction(()=>window.EunseolQA?.engine.eunseolStates?.size>0,null,{timeout:60000});
   assert(await p.locator('.battle-v3-live-shell').isVisible());
   const idle=await p.evaluate(async()=>{
    const q=window.EunseolQA,e=q.engine,a=e.mercenaries[0],s=e.eunseolStates.get(a);q.actor=a;q.hpCalls=[];
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const snapshot=()=>({x:a.root.x,y:a.root.y,viewX:a.view.x,viewY:a.view.y,angle:a.view.rotation,sx:a.fullBodySprite.scale.x,sy:a.fullBodySprite.scale.y,texture:a.fullBodySprite.texture.uid,frame:s.fx.pose.frame});
    const before=snapshot();await new Promise(r=>setTimeout(r,750));return {before,after:snapshot(),d:s.fx.diagnostics(),facing:a.view.scale.x,regularAllies:e.allies.length,regularEnemies:e.enemies.length};
   });
   assert.deepEqual(idle.before,idle.after);assert.equal(idle.d.pose.key,'idle');assert.equal(idle.d.pose.frame,0);
   assert.equal(idle.d.bodyRegistration.physicalBodyHeight,285);assert.equal(idle.d.idleControllerTimeline,false);
   assert.equal(Math.sign(idle.facing),mode==='enemy'?-1:1);
   await p.screenshot({path:path.join(out,label+'-'+mode+'-idle.png'),fullPage:true});
   const outcomes=[];
   for(const visualMode of mode==='enemy'?['basic']:['basic','moon','tiger','domain']){
    const result=await p.evaluate(async({visualMode,mode})=>{
     const q=window.EunseolQA,e=q.engine,a=q.actor,s=e.eunseolStates.get(a);q.hpCalls=[];
     const targets=(a.team==='ALLY'?e.enemies:e.allies).filter(t=>!t.root.destroyed);let done;const started=performance.now();
     if(visualMode==='basic')done=await e.normalAttack(0,{attacker:a,target:targets[0],damage:100,targetHp:99,targetShield:0});
     else{const event=structuredClone(q.event);event.visualMode=visualMode;if(mode==='single')event.hits=event.hits.slice(0,1);event.hits.push({...event.hits[0]});done=await e.playMercenaryEvent(event);}
     return {done,elapsedMs:performance.now()-started,hpCalls:q.hpCalls.length,unique:new Set(q.hpCalls.map(h=>h.id)).size,last:e.lastMercenaryPlayback,
      pose:s.fx.pose,returned:Math.hypot(a.root.x-a.baseX,a.root.y-a.baseY),effects:[...s.fx.effects,...s.fx.impacts].filter(p=>p.visible).length,sx:a.fullBodySprite.scale.x,sy:a.fullBodySprite.scale.y};
    },{visualMode,mode});
    const count=visualMode==='basic'||mode==='single'?1:12;
    assert.equal(result.done,true);assert.equal(result.hpCalls,count);assert.equal(result.unique,count);assert.equal(result.last.damageApplications,count);
    assert.equal(result.last.authoritative,true);assert.equal(result.last.playbackRate,2);assert.equal(result.pose.key,'idle');assert.equal(result.pose.frame,0);
    assert.equal(result.effects,0);assert(result.returned<1e-6);assert.equal(result.sx,result.sy);
    assert(result.elapsedMs>=result.last.durationSeconds/2*1000-160,'2x timeline lower bound');assert(result.elapsedMs<result.last.durationSeconds/2*1000+1700,'2x timeline upper bound');
    outcomes.push({visualMode,...result});
   }
   const visual=[];
   for(const [visualMode,time]of mode==='enemy'?[['tiger',2.36]]:[['moon',1.12],['tiger',2.36],['domain',4.2]]){
    const d=await p.evaluate(({visualMode,time,mode})=>{
     const q=window.EunseolQA,e=q.engine,s=e.eunseolStates.get(q.actor);s.ambient?.instance.pause();
     s.fx.begin(visualMode,(q.actor.team==='ALLY'?e.enemies:e.allies).slice(0,mode==='single'?1:12));s.fx.render(time);return s.fx.diagnostics();
    },{visualMode,time,mode});
    assert(d.activeEffects>0);assert.equal(d.bodyRegistration.uniformScale,true);
    assert.equal(d.bodyFacing,mode==='enemy'?-1:1);await p.screenshot({path:path.join(out,label+'-'+mode+'-'+visualMode+'.png'),fullPage:true});visual.push({visualMode,d});
   }
   const lifecycle=await p.evaluate(async()=>{
    const q=window.EunseolQA,e=q.engine,a=q.actor,s=e.eunseolStates.get(a),target=(a.team==='ALLY'?e.enemies:e.allies)[0];
    s.fx.cancel();await e.setVisible(true);q.hpCalls=[];
    const pending=e.normalAttack(0,{attacker:a,target,damage:100,targetHp:99});await new Promise(r=>setTimeout(r,35));e.cancelTimelines();const cancelled=await pending;
    const atCancel={cancelled,hits:q.hpCalls.length,ambient:!!s.ambient,effects:[...s.fx.effects,...s.fx.impacts].some(p=>p.visible),pose:s.fx.pose.key};
    await e.setVisible(true);const resumed=!!s.ambient;
    q.hpCalls=[];const hiddenPending=e.normalAttack(0,{attacker:a,target,damage:100,targetHp:99});await new Promise(r=>setTimeout(r,35));await e.setVisible(false);const hiddenResult=await hiddenPending;
    const hidden={result:hiddenResult,hits:q.hpCalls.length};await e.setVisible(true);
    e.reducedMotion=true;q.hpCalls=[];const reducedResult=await e.normalAttack(0,{attacker:a,target,damage:100,targetHp:99});
    const reduced={result:reducedResult,hits:q.hpCalls.length,reduced:s.fx.reducedMotion,ambient:!!s.ambient,pose:s.fx.pose.key};
    e.reducedMotion=false;let poseWrites=0;const applyPose=s.fx.applyPose.bind(s.fx);s.fx.applyPose=(...args)=>{if(a.hp<=0)poseWrites++;return applyPose(...args);};
    const deathPending=e.normalAttack(0,{attacker:a,target,damage:100,targetHp:99});await new Promise(r=>setTimeout(r,45));a.setHp(0);
    const deadAt={x:a.root.x,y:a.root.y};await deathPending;
    const death={poseWrites,state:a.state,hp:a.hp,moved:Math.hypot(a.root.x-deadAt.x,a.root.y-deadAt.y),aura:s.fx.aura.visible,effects:[...s.fx.effects,...s.fx.impacts].some(p=>p.visible)};
    a.setHp(100);const revived={pose:s.fx.pose.key,ambient:!!s.ambient,hp:a.hp};s.fx.applyPose=applyPose;
    const previous=s;e.eunseolStates.delete(a);q.hpCalls=[];
    let cold=null;if(q.event){const event=structuredClone(q.event);event.visualMode='domain';const result=await e.playMercenaryEvent(event);cold={result,hits:q.hpCalls.length};}
    e.eunseolStates.set(a,previous);e.clearMercenaryActors();
    return {atCancel,resumed,hidden,reduced,death,revived,cold,states:e.eunseolStates.size,destroyed:s.fx.destroyed};
   });
   assert.deepEqual(lifecycle.atCancel,{cancelled:false,hits:0,ambient:false,effects:false,pose:'idle'});
   assert.equal(lifecycle.resumed,true);assert.equal(lifecycle.hidden.result,false);assert.equal(lifecycle.hidden.hits,0);
   assert.equal(lifecycle.reduced.result,true);assert.equal(lifecycle.reduced.hits,1);assert.equal(lifecycle.reduced.reduced,true);assert.equal(lifecycle.reduced.ambient,false);
   assert.equal(lifecycle.death.poseWrites,0);assert.equal(lifecycle.death.state,'DEAD');assert.equal(lifecycle.death.hp,0);assert.equal(lifecycle.death.moved,0);assert.equal(lifecycle.death.aura,false);assert.equal(lifecycle.death.effects,false);
   assert.equal(lifecycle.revived.pose,'idle');assert.equal(lifecycle.revived.ambient,true);assert.equal(lifecycle.revived.hp,100);
   if(lifecycle.cold){assert.equal(lifecycle.cold.result,true);assert.equal(lifecycle.cold.hits,12);}
   assert.equal(lifecycle.states,0);assert.equal(lifecycle.destroyed,true);
   checks.push({label,mode,idle,outcomes,visual,lifecycle});fs.writeFileSync(path.join(out,'battle-browser-checkpoint.json'),JSON.stringify({checks,errors,missing},null,2));
   await p.close();console.log(label,mode,'PASS');
  }
 }
 // Hold only optional atlases: the live entry must finish, then a late load
 // must leave an actor killed in the meantime in V3's DEAD presentation.
 const loadingPage=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 loadingPage.on('pageerror',e=>errors.push('late-load: '+e.stack));
 let releaseAtlases;const atlasGate=new Promise(resolve=>{releaseAtlases=resolve;});
 await loadingPage.route('**/eunseol-20261023/assets/atlases/**',async route=>{await atlasGate;await route.continue();});
 await loadingPage.goto(base+'/qa/battle?mode=enemy',{waitUntil:'domcontentloaded'});
 await loadingPage.waitForFunction(()=>window.EunseolQA?.ready||window.qaError,null,{timeout:60000});
 assert.equal(await loadingPage.evaluate(()=>window.qaError),undefined);
 const waiting=await loadingPage.evaluate(()=>{
  const q=window.EunseolQA,e=q.engine,a=e.mercenaries[0];q.actor=a;q.loading=e.eunseolLoads.get(a);q.initialTexture=a.fullBodySprite.texture.uid;a.setHp(0);
  return {pending:!!q.loading,hp:a.hp,state:a.state};
 });
 assert.equal(waiting.pending,true);releaseAtlases();
 const late=await loadingPage.evaluate(async()=>{
  const q=window.EunseolQA,e=q.engine,a=q.actor;await q.loading;
  const dead={registered:e.eunseolStates.has(a),hp:a.hp,state:a.state,sameTexture:a.fullBodySprite.texture.uid===q.initialTexture};
  a.setHp(100);await e.normalAttack(0,{attacker:a,target:e.allies[0],damage:1,targetHp:99});
  await e.eunseolLoads.get(a);return {dead,revivedReady:e.eunseolStates.has(a),revivedHp:a.hp};
 });
 assert.deepEqual(late.dead,{registered:false,hp:0,state:'DEAD',sameTexture:true});assert.equal(late.revivedReady,true);assert.equal(late.revivedHp,100);
 checks.push({label:'desktop',mode:'death-during-optional-load',waiting,late});await loadingPage.close();
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 fs.writeFileSync(path.join(out,'battle-browser-report.json'),JSON.stringify({status:'PASS',skillId:EUNSEOL_AREA_SKILL.id,checks,errors,missing},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
