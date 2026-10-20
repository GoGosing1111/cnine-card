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
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.PRIME_QA_OUTPUT||path.join(root,'docs/qa/prime-requiem-20261021');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:true}),checks=[],errors=[];
await f.p('INSERT INTO users(id,nickname) VALUES(1,?)','핑크빛유두').run();
const user={id:1,role:'OWNER'};
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-975'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'프라임 레퀴엠'},seed:7919,limitMs:15000});
const areaEvent=structuredClone(hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_PRIME_REQUIEM_AREA'&&e.hits.length===12));assert(areaEvent);
// Give the isolated visual targets enough HP to survive two casts. The copied
// server damage remains unchanged; no production enemy or reward is changed.
for(const hit of areaEvent.hits){hit.targetMaxHp=1e15;hit.targetHpAfter=1e15-(hit.damage||0);}
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-975',cardId:'V-975',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const enemyPayload=structuredClone(pvpPayload);enemyPayload.battleV2.teams.A.mercenaries=[];enemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-975'}];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),field=mode!=='enemy'?'HUNT':'PVP',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'프라임 레퀴엠',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'프라임 레퀴엠'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 window.PrimeQA={engine,renderer,event:data.event,mode,ready:true};document.getElementById('health').textContent='실제 V3 전투 연결 완료';
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode!=='enemy'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>SSS LIMITED · DESIGNATED ACCOUNT</small><h1>프라임 레퀴엠 · ${mode!=='enemy'?'적월의 광전사':'붉은 검격'}</h1><p>기본 전투력 2,300,000 · 획득 잠금</p></header><nav class="toolbar"><span id="health">V3 전장 연결 중</span></nav><main id="lab-modal"></main></body>`));
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
  for(const mode of (process.argv.includes('--codex-only')||process.argv.includes('--remaining')&&label==='desktop')?[]:label==='mobile'?['area']:['area','enemy','single']){
   const p=await browser.newPage({viewport,serviceWorkers:'block'});p.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
   await p.goto(base+'/qa/battle?mode='+mode);await p.waitForFunction(()=>window.PrimeQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await p.evaluate(()=>window.qaError),undefined);
   await p.waitForFunction(()=>window.PrimeQA?.engine.primeStates?.size>0,null,{timeout:60000});
   const idle=await p.evaluate(()=>{
    const q=window.PrimeQA,e=q.engine,a=e.mercenaries[0],s=e.primeStates.get(a);q.actor=a;s.ambient?.instance.pause();
    s.fx.updateIdle(1.9);q.hpCalls=[];q.damageCalls=[];
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,d)=>{q.damageCalls.push(t.id);return show(t,d);};
    const timeline=e.timeline.bind(e);e.timeline=(build,cleanup,rate,options)=>timeline(t=>{build(t);if(options?.owners?.includes(a))q.activeTimeline=t;},cleanup,rate,options);
    return {d:s.fx.diagnostics(),camera:{x:e.stage.x,y:e.stage.y,sx:e.stage.scale.x,sy:e.stage.scale.y},actorScale:{x:a.root.scale.x,y:a.root.scale.y},facing:a.view.scale.x};
   });
   assert.equal(idle.d.pose,0);assert.equal(idle.d.auraAsset,'fx-idle-shattered-moon-v7');assert.equal(idle.d.neonRim,'SOURCE_ALPHA_CONTOUR');assert.equal(idle.d.cameraZoom,false);
   await p.screenshot({path:path.join(out,label+'-'+mode+'-idle.png'),fullPage:true});
   const skills=mode==='enemy'?['basic','basic','basic']:mode==='single'?['MS-963','MS-964','MS-965','MS-966']:['basic','basic','basic','MS-963','MS-964','MS-965','MS-966'];
   const outcomes=[];
   for(const skill of skills){
    const result=await p.evaluate(async({skill,mode})=>{
     const q=window.PrimeQA,e=q.engine,a=q.actor,s=e.primeStates.get(a);q.hpCalls=[];q.damageCalls=[];
     const targets=(a.team==='ALLY'?e.enemies:e.allies).filter(t=>!t.root.destroyed);
     let done;
     if(skill==='basic')done=await e.normalAttack(0,{attacker:a,target:targets[0],damage:100,targetHp:99,targetShield:0});
     else{const event=structuredClone(q.event);event.skillId=skill;if(mode==='single')event.hits=event.hits.slice(0,1);done=await e.playMercenaryEvent(event);}
     s.ambient?.instance.pause();
     return {done,hpCalls:q.hpCalls.length,unique:new Set(q.hpCalls.map(h=>h.id)).size,playback:e.lastMercenaryPlayback,
      pose:s.fx.state.pose,scaleX:a.fullBodySprite.scale.x,scaleY:a.fullBodySprite.scale.y,expected:s.fx.bodyHeight/s.fx.manifest.sheets['motion-user-eight-v2'].bodyPixels,
      returned:Math.hypot(a.root.x-a.baseX,a.root.y-a.baseY),effects:s.fx.pool.filter(p=>p.visible).length,
      camera:{x:e.stage.x,y:e.stage.y,sx:e.stage.scale.x,sy:e.stage.scale.y},actorScale:{x:a.root.scale.x,y:a.root.scale.y}};
    },{skill,mode});
    const count=skill==='basic'||mode==='single'?1:12;
    assert.equal(result.hpCalls,count);assert.equal(result.unique,count);assert.equal(result.playback.playbackRate,2);assert.equal(result.playback.authoritative,true);assert.equal(result.pose,0);assert.equal(result.effects,0);assert(result.returned<1e-6);assert.equal(result.scaleX,result.scaleY);assert.equal(result.scaleX,result.expected);assert.deepEqual(result.camera,idle.camera);assert.deepEqual(result.actorScale,idle.actorScale);
    outcomes.push({skill,...result});
   }
   // Inspect the strongest approved impact without synthesizing HP changes.
   const contact=await p.evaluate(()=>{const q=window.PrimeQA,e=q.engine,s=e.primeStates.get(q.actor),targets=(q.actor.team==='ALLY'?e.enemies:e.allies).slice(0,q.mode==='single'?1:12);s.ambient?.instance.pause();s.fx.begin('blood-moonfall',targets);s.fx.clock.time=3.65;s.fx.render(3.65);return s.fx.diagnostics();});
   assert(contact.visibleEffects>0);await p.screenshot({path:path.join(out,label+'-'+mode+'-impact.png'),fullPage:true});
   const cancel=await p.evaluate(async()=>{const q=window.PrimeQA,e=q.engine,s=e.primeStates.get(q.actor);e.cancelTimelines();const stopped=s.stopped,ambient=!!s.ambient,effects=s.fx.pool.some(p=>p.visible);await e.setVisible(true);const resumed=!!s.ambient;e.clearMercenaryActors();return {stopped,ambient,effects,resumed,states:e.primeStates.size,destroyed:s.fx.destroyed};});
   assert.deepEqual(cancel,{stopped:true,ambient:false,effects:false,resumed:true,states:0,destroyed:true});
   checks.push({label,mode,idle,outcomes,contact,cancel});await p.close();console.log(label+' '+mode+' PASS');
  }
  if(process.argv.includes('--battle-only'))continue;
  const p=await browser.newPage({viewport,serviceWorkers:'block'});p.on('pageerror',e=>errors.push(label+' codex: '+e.message));await p.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,nickname:'검수'}));});
  await p.goto(base+'/mercenary-codex/?view=limited&q='+encodeURIComponent('프라임')+'#V-975');await p.locator('[data-code="V-975"]').click();await p.locator('.combat-panel').waitFor();
  const text=await p.locator('.combat-panel').innerText();assert.match(text,/획득 불가/);assert.match(text,/2,300,000/);assert.equal(await p.locator('.skill-list > *').count(),7);
  assert.equal(await p.locator('[data-equip="V-975"]').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.locator('[data-code="V-975"] img').evaluate(img=>img.decode());await p.screenshot({path:path.join(out,label+'-codex.png'),fullPage:true});checks.push({label,mode:'codex',unowned:true,locked:true,overflow:false});await p.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
