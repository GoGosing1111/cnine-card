import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
// Local isolated fixtures only. No production account, economy, or CMS writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {MODES,sample} from '../preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs';
import {sampleBody} from '../preview/mercenary-cyan-knight-battle-20261020-v1/source/BodyMotion.mjs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const roundFloats=value=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='number'?Number(item.toFixed(9)):item));
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.ZERO_QA_OUTPUT||path.join(root,'docs/qa/zero-20261020');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:true}),checks=[],errors=[];
await f.p('INSERT INTO users(id,nickname) VALUES(1,?)','핑크빛유두').run();
const user={id:1,role:'OWNER'};
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-976'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'제로'},seed:7919,limitMs:15000});
const areaEvent=structuredClone(hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_ZERO_AREA'&&e.hits.length===12));assert(areaEvent);
// Give the isolated visual targets enough HP to survive two casts. The copied
// server damage remains unchanged; no production enemy or reward is changed.
for(const hit of areaEvent.hits){hit.targetMaxHp=1e15;hit.targetHpAfter=1e15-(hit.damage||0);}
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-976',cardId:'V-976',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const enemyPayload=structuredClone(pvpPayload);enemyPayload.battleV2.teams.A.mercenaries=[];enemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-976'}];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),field=['array','zenith'].includes(mode)?'HUNT':'PVP',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'제로',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'제로'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 window.ZeroQA={engine,renderer,event:data.event,mode,ready:true};document.getElementById('health').textContent='실제 V3 전투 연결 완료';
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${['array','zenith'].includes(mode)?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>SSS LIMITED · DESIGNATED ACCOUNT</small><h1>제로 · ${['array','zenith'].includes(mode)?'검극 · 전선 단절':'백은일섬'}</h1><p>기본 전투력 2,300,000 · 획득 잠금</p></header><nav class="toolbar"><span id="health">V3 전장 연결 중</span></nav><main id="lab-modal"></main></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:['array','zenith'].includes(mode)?areaPayload:mode==='enemy'?enemyPayload:pvpPayload,event:['array','zenith'].includes(mode)?areaEvent:null});
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
  for(const mode of (process.argv.includes('--codex-only')||process.argv.includes('--remaining')&&label==='desktop'?[]:['horizon','flurry','meteor','enemy','array','zenith'])){
   const p=await browser.newPage({viewport,serviceWorkers:'block'});p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
   await p.goto(base+'/qa/battle?mode='+mode);await p.waitForFunction(()=>window.ZeroQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await p.evaluate(()=>window.qaError),undefined);
   const actualMode=mode==='enemy'?'horizon':mode;
   const bodyChecks=await p.evaluate(({mode,duration})=>{
    const e=window.ZeroQA.engine,a=e.mercenaries[0],s=e.zeroStates.get(a),fx=s.fx;s.ambient?.instance.pause();
    a.animationController.setState('IDLE');
    const idle=[0,.3,.6,1.2,1.8,2.4,4.8].map(t=>{fx.updateIdle(t);return {pose:fx.bodyState.pose,texture:fx.unit.bodySprite.texture===fx.assets.motion.idle[0],scale:{x:a.mainSprite.scale.x,y:a.mainSprite.scale.y},y:a.mainSprite.y,idleTween:!!a.animationController.timeline};});
    const targets=(a.team==='ALLY'?e.enemies:e.allies).filter(t=>!t.root.destroyed);fx.begin(mode,targets);
    const samples=[];
    for(let i=0;i<=Math.floor(duration*30);i++){
     const t=i/30;fx.clock.time=t;fx.render(t);
     samples.push({t,pose:fx.bodyState.pose,bodyTime:fx.bodyState.time,effects:fx.state.effects,phantoms:fx.state.phantoms,
      bodyTexture:fx.unit.bodySprite.texture===fx.assets.motion[fx.bodyState.pose.bank][fx.bodyState.pose.index],
      effectTextures:fx.state.effects.every((f,i)=>fx.pool[i].texture===fx.assets.effects[f.key][f.frame]),rates:[fx.diagnostics().motionPlaybackRate,fx.diagnostics().effectPlaybackRate]});
    }
    fx.cancel();return {idle,samples};
   },{mode:actualMode,duration:MODES[actualMode].duration});
   for(const frame of bodyChecks.idle){assert.equal(frame.pose.bank,'idle');assert.equal(frame.pose.index,0);assert.equal(frame.texture,true);assert.equal(frame.idleTween,false);assert.deepEqual(frame.scale,bodyChecks.idle[0].scale);assert.equal(frame.y,bodyChecks.idle[0].y);}
   for(const frame of bodyChecks.samples){
    const effects=sample(actualMode,frame.t),body=sampleBody(actualMode,frame.t);
    assert.deepEqual(frame.effects,effects.effects);assert.deepEqual(roundFloats(frame.phantoms),roundFloats(effects.phantoms));
    assert.deepEqual(frame.pose,body.pose);assert.equal(frame.bodyTime,body.time);assert.equal(frame.bodyTexture,true);assert.equal(frame.effectTextures,true);assert.deepEqual(frame.rates,[2,1]);
   }
   if(mode==='horizon')await p.screenshot({path:path.join(out,label+'-calm-idle.png'),fullPage:true});
   const baseline=await p.evaluate(()=>{
    const q=window.ZeroQA,e=q.engine,a=e.mercenaries[0],s=e.zeroStates.get(a);q.actor=a;q.hpCalls=[];q.damageCalls=[];
    s.ambient?.instance.pause();s.basicCount=Math.max(0,['horizon','flurry','meteor'].indexOf(q.mode));
    const camera={x:e.stage.x,y:e.stage.y,sx:e.stage.scale.x,sy:e.stage.scale.y};
    const actorScale={x:a.root.scale.x,y:a.root.scale.y};
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,d)=>{q.damageCalls.push(t.id);return show(t,d);};
    const timeline=e.timeline.bind(e),contact=q.mode==='array'?3.6:q.mode==='zenith'?2.65:q.mode==='flurry'?1.72:q.mode==='meteor'?.64:.55;
    e.timeline=(build,cleanup,rate,options)=>timeline(t=>{build(t);if(options?.owners?.includes(a)){q.timeline=t;q.timelineRate=rate;t.call(()=>{q.contact=true;t.pause();},[],contact+.012);}},cleanup,rate,options);
    q.baseline={camera,actorScale};
    return {height:a.art.bodyHeight,backdrop:s.fx.manifest.backdrop.id,behind:s.fx.backdrop.diagnostics().behindBody};
   });
   assert.equal(baseline.height,360);assert.equal(baseline.backdrop,'ZERO_BLADE_WINGS_V1');assert.equal(baseline.behind,true);
   await p.evaluate(()=>{
    const q=window.ZeroQA,e=q.engine,a=q.actor;
    if(q.mode==='array'||q.mode==='zenith'){
     if(q.mode==='zenith'){q.event.skillId='MS-975';q.event.skillName='창천 종단';}
     q.promise=e.playMercenaryEvent(q.event).then(v=>q.done=v);
    }else{const target=(a.team==='ALLY'?e.enemies:e.allies)[0];q.promise=e.normalAttack(0,{attacker:a,target,damage:100,targetHp:99,targetShield:0}).then(v=>q.done=v);}
   });
   await p.waitForFunction(()=>window.ZeroQA.contact,null,{timeout:20000});
   const result=await p.evaluate(()=>{const q=window.ZeroQA,e=q.engine,a=q.actor,s=e.zeroStates.get(a);return {timelineRate:q.timelineRate,mode:s.fx.mode,hpCalls:q.hpCalls.length,unique:new Set(q.hpCalls.map(h=>h.id)).size,camera:{x:e.stage.x,y:e.stage.y,sx:e.stage.scale.x,sy:e.stage.scale.y},actorScale:{x:a.root.scale.x,y:a.root.scale.y},baseline:q.baseline,groundError:s.fx.groundError,bladeContact:s.fx.collision,zoom:s.fx.zoom,backdrop:s.fx.backdrop.diagnostics()};});
   const count=['array','zenith'].includes(mode)?12:1;assert.equal(result.hpCalls,count);assert.equal(result.unique,count);assert.equal(result.zoom,false);assert.equal(result.timelineRate,1);assert.deepEqual(result.actorScale,result.baseline.actorScale);assert.deepEqual(result.camera,result.baseline.camera);assert(result.groundError<1e-6);
   await p.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});
   const cancelled=await p.evaluate(()=>{const q=window.ZeroQA,e=q.engine;e.cancelTimelines();const s=e.zeroStates.get(q.actor);return {stopped:s.stopped,ambient:!!s.ambient,effects:s.fx.pool.some(p=>p.visible),swords:s.fx.swordPool.some(p=>p.visible),damage:q.hpCalls.length};});
   assert.deepEqual(cancelled,{stopped:true,ambient:false,effects:false,swords:false,damage:count});
   const cleared=await p.evaluate(async()=>{const e=window.ZeroQA.engine;await e.setVisible(true);const s=e.zeroStates.get(window.ZeroQA.actor),ambient=!!s.ambient;e.clearMercenaryActors();return {ambient,states:e.zeroStates.size,disposed:s.fx.disposed,appearance:s.fx.appearance.destroyed,backdrop:s.fx.backdrop.destroyed};});assert.deepEqual(cleared,{ambient:true,states:0,disposed:true,appearance:true,backdrop:true});
   checks.push({label,mode,bodyFramesChecked:bodyChecks.samples.length,idleFrames:bodyChecks.idle,baseline,result,cancelled,cleared});await p.close();console.log(label+' '+mode+' PASS');
  }
  if(process.argv.includes('--battle-only'))continue;
  const p=await browser.newPage({viewport,serviceWorkers:'block'});p.on('pageerror',e=>errors.push(label+' codex: '+e.message));await p.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,nickname:'검수'}));});
  await p.goto(base+'/mercenary-codex/?view=limited&q=제로#V-976');await p.locator('[data-code="V-976"]').click();await p.locator('.combat-panel').waitFor();
  const text=await p.locator('.combat-panel').innerText();assert.match(text,/획득 불가/);assert.match(text,/2,300,000/);assert.equal(await p.locator('.skill-list > *').count(),5);for(const name of ['청광 횡단','섬광 연참','용궤 검격','천검 포위','창천 종단'])assert.match(text,new RegExp(name));
  assert.equal(await p.locator('[data-equip="V-976"]').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.locator('[data-code="V-976"] img').evaluate(img=>img.decode());await p.screenshot({path:path.join(out,label+'-codex.png'),fullPage:true});checks.push({label,mode:'codex',unowned:true,locked:true,overflow:false});await p.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,process.argv.includes('--codex-only')?'codex-report.json':'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
