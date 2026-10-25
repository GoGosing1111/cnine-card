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
const roundFloats=value=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='number'?Number(item.toFixed(9)):item));
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.GENERAL_JOK_QA_OUTPUT||path.join(root,'docs/qa/general-jok-live-20261023');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:true}),checks=[],errors=[];
await f.p('INSERT INTO users(id,nickname) VALUES(1,?)','핑크빛유두').run();
const user={id:1,role:'OWNER'};
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-974'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'제너럴 족'},seed:7919,limitMs:15000});
const areaEvent=structuredClone(hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_GENERAL_JOK_AREA'&&e.hits.length===12));assert(areaEvent);
// Give the isolated visual targets enough HP to survive two casts. The copied
// server damage remains unchanged; no production enemy or reward is changed.
for(const hit of areaEvent.hits){hit.targetMaxHp=1e15;hit.targetHpAfter=1e15-(hit.damage||0);}
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-974',cardId:'V-974',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const enemyPayload=structuredClone(pvpPayload);enemyPayload.battleV2.teams.A.mercenaries=[];enemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-974'}];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(window.ensureFeatureResources){
  await window.ensureFeatureResources('battleV2');
  if(mode!=='enemy')await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/preview/sustained-hunt-v2/battle.bundle.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
 }
 if(!document.getElementById('lab-modal')&&!document.getElementById('modal'))document.getElementById('app').insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');
 const data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal')||document.getElementById('modal'),field=mode!=='enemy'?'HUNT':'PVP',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'제너럴 족',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'제너럴 족'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 // The isolated account fixture mounts the real main modal without signing in.
 // Remove the unauthenticated overlay, whose z-index intentionally exceeds battles.
 document.querySelector('#app .login-wrap')?.remove();
 window.GeneralJokQA={engine,renderer,event:data.event,mode,ready:true};if(document.getElementById('health'))document.getElementById('health').textContent='실제 V3 전투 연결 완료';
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  if(process.argv.includes('--main')){
   const bundle=mode!=='enemy'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js';
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
   return res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head><base href="/">').replace('</body>',`<script defer src="${bundle}"></script><script defer src="/qa-boot.js"></script></body>`));
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode!=='enemy'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>SSS LIMITED · DESIGNATED ACCOUNT</small><h1>제너럴 족 · ${mode!=='enemy'?'적월의 광전사':'붉은 검격'}</h1><p>기본 전투력 2,700,000 · 획득 잠금</p></header><nav class="toolbar"><span id="health">V3 전장 연결 중</span></nav><main id="lab-modal"></main></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode!=='enemy'?areaPayload:mode==='enemy'?enemyPayload:pvpPayload,event:mode!=='enemy'?areaEvent:null});
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
  for(const mode of label==='desktop'?(process.argv.includes('--remaining')?[]:['area','enemy','single']):['area']){
   const p=await browser.newPage({viewport,serviceWorkers:'block'});
   p.on('pageerror',e=>{errors.push(label+' '+mode+': '+e.stack);if(errors.length<4)console.error(e.stack);});
   p.on('console',m=>{if(m.type()==='error'&&/shader|General Jok|generalJok|GENERAL_JOK/i.test(m.text()))errors.push(m.text());});
   await p.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
   await p.goto(base+'/qa/battle?mode='+mode);
   await p.waitForFunction(()=>window.GeneralJokQA?.ready||window.qaError,null,{timeout:60000});
   assert.equal(await p.evaluate(()=>window.qaError),undefined);
   await p.waitForFunction(()=>window.GeneralJokQA?.engine.generalJokStates?.size>0,null,{timeout:60000});
   assert(await p.locator('.battle-v3-live-shell').isVisible());
   const idle=await p.evaluate(()=>{
    const q=window.GeneralJokQA,e=q.engine,a=e.mercenaries[0],s=e.generalJokStates.get(a);q.actor=a;
    s.ambient?.instance.pause();s.fx.updateIdle(1.9);q.hpCalls=[];q.damageCalls=[];
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,d)=>{q.damageCalls.push(t.id);return show(t,d);};
    return {d:s.fx.diagnostics(),rootScale:a.root.scale.x,scene:e.scene,at:{x:a.root.x,y:a.root.y},facing:a.view.scale.x};
   });
   assert.equal(idle.d.pose,'ready');assert.equal(idle.d.flagWidth,540);assert.equal(idle.d.flagLayerCount,1);
   await p.screenshot({path:path.join(out,label+'-'+mode+'-idle.png'),fullPage:true});
   const skills=label==='mobile'?['basic','basic','MS-952']:mode==='enemy'?['basic','basic']:mode==='single'?['MS-952','MS-953']:['basic','basic','MS-952','MS-953','MS-954','MS-955','MS-956','MS-957'];
   const outcomes=[];
   for(const skill of skills){console.log(label,mode,skill);
    const result=await p.evaluate(async({skill,mode})=>{
     const q=window.GeneralJokQA,e=q.engine,a=q.actor,s=e.generalJokStates.get(a);q.hpCalls=[];q.damageCalls=[];
     const targets=(a.team==='ALLY'?e.enemies:e.allies).filter(t=>!t.root.destroyed);let done;
     if(skill==='basic')done=await e.normalAttack(0,{attacker:a,target:targets[0],damage:100,targetHp:99,targetShield:0});
     else{const event=structuredClone(q.event);event.skillId=skill;if(mode==='single')event.hits=event.hits.slice(0,1);done=await e.playMercenaryEvent(event);}
     s.ambient?.instance.pause();
     return {done,hpCalls:q.hpCalls.length,unique:new Set(q.hpCalls.map(h=>h.id)).size,playback:e.lastMercenaryPlayback,pose:s.fx.activePose,scaleX:a.fullBodySprite.scale.x,scaleY:a.fullBodySprite.scale.y,
      returned:Math.hypot(a.root.x-a.baseX,a.root.y-a.baseY),effects:s.fx.pool.filter(p=>p.visible).length,diagnostics:s.fx.diagnostics()};
    },{skill,mode});
    const count=skill==='basic'||mode==='single'?1:12;
    assert.equal(result.done,true);assert.equal(result.hpCalls,count);assert.equal(result.unique,count);
    assert.equal(result.playback.authoritative,true);assert.equal(result.playback.playbackRate,2);assert.equal(result.pose,'ready');assert.equal(result.effects,0);assert(result.returned<1e-6);assert.equal(result.scaleX,result.scaleY);
    outcomes.push({skill,...result});
   }
   const visual=[];
   for(const [skill,time]of [['critical',1.66],['ultimate',2.42],['artillery',3.32],['breaker',1.9]]){
    if(mode==='enemy'&&!['critical'].includes(skill))continue;
    const result=await p.evaluate(({skill,time})=>{
     const q=window.GeneralJokQA,e=q.engine,s=e.generalJokStates.get(q.actor),targets=(q.actor.team==='ALLY'?e.enemies:e.allies).slice(0,skill==='critical'||q.mode==='single'?1:12);
     s.ambient?.instance.pause();s.fx.begin(skill,targets);s.fx.clock.time=time;s.fx.render(time);
     return s.fx.diagnostics();
    },{skill,time});
    assert.equal(result.poolOverflow,0);assert.equal(result.flagLayerCount,1);assert(Math.abs(result.flagFollowsRecoilError)<1e-5);
    if(skill==='critical')assert.equal(result.monkeyVisible,true);
    if(skill==='ultimate'){assert.equal(result.shipVisible,true);assert.equal(result.navalShells.length,0);}
    if(skill==='artillery'){assert.equal(result.artilleryVisible,3);assert.equal(result.artilleryShells.length,0);}
    await p.screenshot({path:path.join(out,label+'-'+mode+'-'+skill+'.png'),fullPage:true});visual.push({skill,...result});
   }
   const cancel=await p.evaluate(async()=>{
    const q=window.GeneralJokQA,e=q.engine,s=e.generalJokStates.get(q.actor);e.cancelTimelines();
    const stopped=s.stopped,ambient=!!s.ambient,effects=s.fx.pool.some(p=>p.visible);
    await e.setVisible(true);const resumed=!!s.ambient;
    e.reducedMotion=true;s.fx.begin('critical',(q.actor.team==='ALLY'?e.enemies:e.allies).slice(0,1));s.fx.render(1.66);const reduced=s.fx.diagnostics();
    e.clearMercenaryActors();return {stopped,ambient,effects,resumed,states:e.generalJokStates.size,destroyed:s.fx.destroyed,reduced};
   });
   assert.equal(cancel.stopped,true);assert.equal(cancel.ambient,false);assert.equal(cancel.effects,false);assert.equal(cancel.resumed,true);assert.equal(cancel.states,0);assert.equal(cancel.destroyed,true);assert.equal(cancel.reduced.reducedMotion,true);
   checks.push({label,mode,idle,outcomes,visual,cancel});fs.writeFileSync(path.join(out,'browser-checkpoint.json'),JSON.stringify({checks,errors},null,2));await p.close();console.log(label+' '+mode+' PASS');
  }
  const p=await browser.newPage({viewport,serviceWorkers:'block'});p.on('pageerror',e=>errors.push(label+' codex: '+e.message));
  await p.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,nickname:'검수'}));});
  await p.goto(base+'/mercenary-codex/?view=limited&q='+encodeURIComponent('제너럴')+'#V-974');
  await p.locator('[data-code="V-974"]').click();await p.locator('.combat-details > summary').click();await p.locator('.combat-panel').waitFor();
  const text=await p.locator('.combat-panel').innerText();assert.match(text,/획득 불가/);assert.match(text,/2,700,000/);assert.equal(await p.locator('.skill-list > *').count(),8);
  assert.equal(await p.locator('[data-equip="V-974"]').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.locator('[data-code="V-974"] img').evaluate(img=>img.decode());await p.screenshot({path:path.join(out,label+'-codex.png'),fullPage:true});
  checks.push({label,mode:'codex',unowned:true,locked:true,overflow:false});await p.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
