import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
// Local isolated fixtures only. No production account, economy, or CMS writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.LEONEL_QA_OUTPUT||path.join(root,'docs/qa/leonel-20261018');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:true}),checks=[],errors=[];
await f.p('INSERT INTO users(id,nickname) VALUES(1,?)','핑크빛유두').run();
await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(1,?,1,0,?,?)','V-978','2026-10-15','2026-10-15').run();
const user={id:1,role:'OWNER'};
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-978'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'레오넬'},seed:7919,limitMs:15000});
const areaEvent=structuredClone(hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_LEONEL_AREA'&&e.hits.length===12));assert(areaEvent);
// Give the isolated visual targets enough HP to survive two casts. The copied
// server damage remains unchanged; no production enemy or reward is changed.
for(const hit of areaEvent.hits){hit.targetMaxHp=1e15;hit.targetHpAfter=1e15-(hit.damage||0);}
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-978',cardId:'V-978',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const enemyPayload=structuredClone(pvpPayload);enemyPayload.battleV2.teams.A.mercenaries=[];enemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-978'}];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),field=mode==='area'?'HUNT':'PVP',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'레오넬',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'레오넬'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 window.LeonelQA={engine,renderer,event:data.event,mode,ready:true};document.getElementById('health').textContent='실제 V3 전투 연결 완료';
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode==='area'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>SSS LIMITED · DESIGNATED ACCOUNT</small><h1>레오넬 · ${mode==='area'?'검극 · 전선 단절':'백은일섬'}</h1><p>기본 전투력 2,300,000 · 획득 잠금</p></header><nav class="toolbar"><span id="health">V3 전장 연결 중</span></nav><main id="lab-modal"></main></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode==='area'?areaPayload:mode==='enemy'?enemyPayload:pvpPayload,event:mode==='area'?areaEvent:null});
 if(url.pathname==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}));
 if(url.pathname==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(f.env,user));
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
  if(url.pathname==='/api/mercenaries/v3/loadout')return json(res,await saveMercenaryLoadout(f.env,user,await request.json()));
  return json(res,{items:[],visible:false,enabled:false});
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  for(const mode of (process.argv.includes('--codex-only')?[]:['basic','skill','enemy','area'])){
   const p=await browser.newPage({viewport,serviceWorkers:'block'});p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));p.on('console',e=>{if(e.type()==='error')errors.push(label+' '+mode+': '+e.text().slice(0,500));});
   await p.goto(base+'/qa/battle?mode='+mode);await p.waitForFunction(()=>window.LeonelQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await p.evaluate(()=>window.qaError),undefined);
   const baseline=await p.evaluate(()=>{
    const q=window.LeonelQA,e=q.engine,a=e.mercenaries[0],s=e.leonelStates.get(a);q.actor=a;q.hpCalls=[];q.damageCalls=[];
    if(q.mode==='skill')s.basicCount=2;
    s.ambient?.instance.pause();let maxError=0;
    for(let i=0;i<12;i++){
     const t=(i+.25)/3,ground={x:a.root.x,groundY:a.root.y};s.fx.updateAmbient(t,ground);
     const foot=a.root.parent.toGlobal({x:ground.x,y:ground.groundY});
     for(const [key,sprite]of (s.fx.whiteRig?[]:[['aura',s.fx.aura],['pressure',s.fx.backgroundAura]])){
      const f=s.fx.manifest.effects[key].frames[i],pt=sprite.toGlobal({x:f.groundAnchor.x-sprite.anchor.x*sprite.texture.width,y:f.groundAnchor.y-sprite.anchor.y*sprite.texture.height});
      maxError=Math.max(maxError,Math.hypot(pt.x-foot.x,pt.y-foot.y));
     }
     if(s.fx.whiteRig){const pt=s.fx.aura.toGlobal({x:0,y:0});maxError=Math.max(maxError,Math.hypot(pt.x-foot.x,pt.y-foot.y));}
    }
    s.fx.updateAmbient(0,{x:a.root.x,groundY:a.root.y});s.ambient?.instance.resume();
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,d)=>{q.damageCalls.push(t.id);return show(t,d);};
    const timeline=e.timeline.bind(e),contact=q.mode==='area'?2.55:q.mode==='skill'?.8:.28;
    e.timeline=(build,cleanup,rate,options)=>timeline(t=>{build(t);if(options?.owners?.includes(a)){q.timeline=t;if(q.mode==='area')t.call(()=>{q.cinematic=true;t.pause();},[],.6);t.call(()=>{q.contact=true;t.pause();},[],contact);}},cleanup,rate,options);
    q.promise=q.mode==='area'?e.playMercenaryEvent(q.event):e.normalAttack(0,{attacker:a,target:(a.team==='ALLY'?e.enemies:e.allies)[0],damage:23,targetHp:77});
    Promise.resolve(q.promise).catch(error=>q.error=error.stack);
    return {maxError,bodyHeight:s.fx.bodyHeight,referenceHeight:s.fx.manifest.motion.idle.referenceHeight};
   });
   assert(baseline.maxError<1e-6);assert.equal(baseline.bodyHeight,333);assert.equal(baseline.referenceHeight,610);
   if(mode==='area'){
    await p.waitForFunction(()=>window.LeonelQA.cinematic||window.LeonelQA.error,null,{timeout:20000});
    assert.equal(await p.evaluate(()=>window.LeonelQA.engine.leonelStates.get(window.LeonelQA.actor).fx.screenLayer.visible),true);
    await p.screenshot({path:path.join(out,label+'-cutin.png'),fullPage:true});await p.evaluate(()=>{window.LeonelQA.timeline.resume();});
   }
   await p.waitForFunction(()=>window.LeonelQA.contact||window.LeonelQA.error,null,{timeout:20000});
   const result=await p.evaluate(()=>{const q=window.LeonelQA,fx=q.engine.leonelStates.get(q.actor).fx;return {error:q.error,hpCalls:q.hpCalls,damageCalls:q.damageCalls,fx:fx.diagnostics(),direction:q.actor.view.scale.x,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(result.error,undefined);assert.equal(result.overflow,false);assert.equal(result.fx.auraVisible,true);assert.equal(result.fx.motionRate,2);assert.equal(result.fx.effectRate,1);assert.equal(result.fx.liveEnabled,true);
   assert.equal(result.hpCalls.length,mode==='area'?12:1);assert.equal(new Set(result.hpCalls.map(r=>r.id)).size,result.hpCalls.length);assert.equal(result.damageCalls.length,mode==='area'?12:1);
   assert.equal(Math.sign(result.direction),mode==='enemy'?-1:1);assert.equal(result.fx.damageAuthority,'SERVER_ONLY');
   assert.equal(result.fx.continuousWhiteFX,true);assert.equal(result.fx.neonEnabled,true);assert.equal(result.fx.swordAuraVisible,true);
   await p.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});
   if(mode==='area'){
    assert.equal(result.fx.dialogue.visible,true);assert(result.fx.activeFrames.some(f=>f.key==='ultimate'));
    await p.evaluate(()=>{window.LeonelQA.timeline.resume();});await p.waitForFunction(()=>window.LeonelQA.engine.lastMercenaryPlayback?.mode==='ultimate');
    assert.equal(await p.evaluate(()=>window.LeonelQA.hpCalls.length),12);
    await p.evaluate(()=>{const q=window.LeonelQA;q.hpCalls=[];q.damageCalls=[];q.cinematic=false;q.contact=false;q.engine.lastMercenaryPlayback=null;q.promise=q.engine.playMercenaryEvent(q.event);});
    await p.waitForFunction(()=>window.LeonelQA.cinematic);assert.equal(await p.evaluate(()=>window.LeonelQA.engine.leonelStates.get(window.LeonelQA.actor).fx.screenLayer.visible),false);
    await p.evaluate(()=>{window.LeonelQA.timeline.resume();});await p.waitForFunction(()=>window.LeonelQA.contact);
    assert.equal(await p.evaluate(()=>window.LeonelQA.hpCalls.length),12);
   }
   const cancelled=await p.evaluate(()=>{const q=window.LeonelQA;q.engine.cancelTimelines();const s=q.engine.leonelStates.get(q.actor);return {stopped:s.stopped,ambient:!!s.ambient,pool:s.fx.pool.some(p=>p.visible),cinematic:s.fx.screenLayer.visible,hpCalls:q.hpCalls.length};});
   assert.deepEqual(cancelled,{stopped:true,ambient:false,pool:false,cinematic:false,hpCalls:mode==='area'?12:1});checks.push({label,mode,baseline,...result,cancelled});
   const resumed=await p.evaluate(async()=>{const q=window.LeonelQA,e=q.engine;await e.setVisible(true);const s=e.leonelStates.get(q.actor);const result={ambient:!!s.ambient,aura:s.fx.aura.visible};e.clearMercenaryActors();return {...result,cleared:e.leonelStates.size===0,effects:e.effectLayer.children.filter(c=>c.label==='LeonelSwordFX').length,cinematics:e.app.stage.children.filter(c=>c.label==='LeonelAwakeningCutIn').length};});
   assert.deepEqual(resumed,{ambient:true,aura:true,cleared:true,effects:0,cinematics:0});await p.close();console.log(label+' '+mode+' PASS');
  }
 }
 for(const [label,viewport]of (process.argv.includes('--core-only')?[]:[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])){
  const p=await browser.newPage({viewport,serviceWorkers:'block'});p.on('pageerror',e=>errors.push(label+' codex: '+e.message));
  await p.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,nickname:'핑크빛유두'}));});
  await p.goto(base+'/mercenary-codex/?view=owned#V-978');await p.locator('[data-code="V-978"]').click();
  assert((await p.locator('.combat-panel').innerText()).includes('획득 잠금'));
  assert((await p.locator('.card-frame').getAttribute('src')).endsWith('/limited-20261002/frame-valter-slim-v3.png'));
  for(const mode of ['PVE','PVP']){
   await p.locator('[data-loadout-mode="'+mode+'"]').first().click();
   if(await p.locator('[data-equip="V-978"]').first().isDisabled()){await p.locator('[data-unequip]').first().click();await p.waitForFunction(()=>!document.querySelector('[data-equip="V-978"]')?.disabled);}
   await p.locator('[data-equip="V-978"]').first().click();await p.waitForFunction(()=>document.querySelector('#loadoutName').textContent.endsWith('레오넬'));
  }
  await p.reload();await p.locator('[data-code="V-978"]').click();await p.waitForFunction(()=>document.querySelector('#loadoutName').textContent.endsWith('레오넬'));
  await p.locator('[data-code="V-978"] img').evaluate(img=>img.decode());
  assert(await p.locator('[data-code="V-978"] img').evaluate(img=>img.naturalWidth>0));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:path.join(out,label+'-loadout.png'),fullPage:true});
  const state=await mercenaryAccountState(f.env,user);assert.equal(state.loadouts.PVE.mercenaryCode,'V-978');assert.equal(state.loadouts.PVP.mercenaryCode,'V-978');checks.push({label,mode:'loadout',pve:true,pvp:true,persisted:true});await p.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,process.argv.includes('--codex-only')?'codex-report.json':'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
