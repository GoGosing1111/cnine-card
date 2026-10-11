import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {MODES} from '../preview/mercenary-golden-dragon-battle-v1/skill.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';

const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'docs/qa/jinmu-live-20261012');
fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-989'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'천룡검황 진무'},seed:7919,limitMs:15000});
const areaEvent=hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_JINMU_AREA'&&e.hits.length===12);
assert.ok(areaEvent);
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-989',cardId:'V-989',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const pvpEnemyPayload=structuredClone(pvpPayload);pvpEnemyPayload.battleV2.teams.A.mercenaries=[];pvpEnemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-989'}];
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false});
await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)','V-989','2026-10-12','2026-10-12').run();
await f.p('INSERT INTO users(id,nickname) VALUES(1,?)','핑크빛유두').run();
await f.p('UPDATE user_mercenary_cards_v1 SET user_id=1 WHERE mercenary_code=?','V-989').run();
const user={id:1,role:'OWNER'};
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
function html(mode){return baseHtml.replace(/<title>.*?<\/title>/,'<title>천룡검황 진무 전투 검수</title>')
 .replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode==='area'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`)
 .replace(/<body>[\s\S]*<\/body>/,`<body><header><small>PROJECT V / SSS LIMITED</small><h1>천룡검황 진무 · ${mode==='area'?'천룡강림':'금룡일섬'}</h1><p>칼 모션 2.6배 · ${mode==='area'?'PVE 적 진영 광역 타격':'PVP 기본 공격'}</p></header><nav class="toolbar"><span id="health">V3 전장 준비 중</span></nav><main id="lab-modal"></main></body>`);}
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:mode==='area'?'HUNT':'PVP',playerName:'천룡검황 진무',opponentName:mode==='area'?'몬스터 군단':'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:mode==='area'?'HUNT':'PVP',playerName:'천룡검황 진무'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 document.getElementById('health').textContent='SSS LIMITED · 실제 V3 전투';prepared.phase.textContent=mode==='area'?'PVE · 천룡강림':'PVP · 금룡일섬';
 window.JinmuQA={engine,renderer,event:data.event,mode,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname.startsWith('/api/')){
  if(url.pathname==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
  if(url.pathname==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(f.env,user));
  if(url.pathname==='/api/mercenaries/v3/loadout'){let data='';for await(const part of req)data+=part;try{return json(res,await saveMercenaryLoadout(f.env,user,JSON.parse(data)));}catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});return res.end(JSON.stringify({error:e.message,code:e.code}));}}
  return json(res,{visible:false,enabled:false,items:[],user:{id:1,nickname:'핑크빛유두'}});
 }
 if(url.pathname==='/qa.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html(mode));}
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode==='area'?areaPayload:mode==='enemy'?pvpEnemyPayload:pvpPayload,event:mode==='area'?areaEvent:null});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])for(const mode of ['basic','enemy','area']){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
  await page.goto(base+'/qa.html?mode='+mode);await page.waitForFunction(()=>window.JinmuQA?.ready||window.qaError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(({contact})=>{
   const q=window.JinmuQA,e=q.engine,a=e.mercenaries.find(a=>a.cardId==='V-989');q.actor=a;q.damageCalls=[];q.hpCalls=[];
   const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,data)=>{q.damageCalls.push({id:t.id,...data});return show(t,data);};
   const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{const result=sync(t,h);q.hpCalls.push({id:t.id,input:h,hp:t.hp});return result;};
   const timeline=e.timeline.bind(e);e.timeline=(build,cleanup,rate,options)=>timeline(tl=>{
    if(!options?.owners?.includes(a))return build(tl);
    q.timeline=tl;q.spec={rate,releaseAt:options.releaseAt};
    const call=tl.call.bind(tl);tl.call=(fn,args,at)=>call(()=>{fn();if(Math.abs(at-contact)<.0001){q.contact={time:tl.time(),duration:tl.duration(),scale:tl.timeScale(),hpCalls:[...q.hpCalls],damageCalls:[...q.damageCalls],fx:e.jinmuStates.get(a).fx.diagnostics()};tl.pause();}},args,at);
    build(tl);tl.call=call;
   },cleanup,rate,options);
   if(q.mode==='area'){e.skillChipPlayback?.remember(q.event);q.promise=e.playEvents([q.event],{timedInternal:true});}
   else{const target=(a.team==='ALLY'?e.enemies:e.allies)[0];q.target=target;q.promise=e.normalAttack(0,{attacker:a,target,damage:23,targetHp:77});}
   q.promise.catch(error=>{q.error=error.stack;});
  },{contact:(mode==='area'?MODES.ultimate.contacts[0]:MODES.attack.contacts[0])/2.6});
  await page.waitForFunction(()=>window.JinmuQA.contact||window.JinmuQA.error,null,{timeout:15000});
  const contact=await page.evaluate(()=>({contact:window.JinmuQA.contact,spec:window.JinmuQA.spec,error:window.JinmuQA.error,overflow:document.documentElement.scrollWidth>innerWidth+1}));
  assert.equal(contact.error,undefined);assert.equal(contact.overflow,false);assert.equal(contact.spec.rate,null);
  assert.ok(Math.abs(contact.contact.duration-(mode==='area'?MODES.ultimate.duration:MODES.attack.duration)/2.6)<1e-6);assert.equal(contact.contact.scale,1);
  assert.equal(contact.contact.fx.mode,mode==='area'?'ultimate':'attack');assert.ok(contact.contact.fx.visibleSprites>0);
  assert.equal(contact.contact.damageCalls.length,mode==='area'?areaEvent.hits.filter(h=>!h.dodge).length:1);
  if(mode==='area')for(const h of areaEvent.hits)assert.ok(contact.contact.hpCalls.some(c=>c.id===h.targetId&&Math.abs(c.input-h.targetHpAfter/h.targetMaxHp*100)<1e-7));
  await page.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});
  await page.evaluate(()=>{window.JinmuQA.timeline.play();});await page.waitForFunction(()=>!window.JinmuQA.engine.jinmuStates.get(window.JinmuQA.actor).busy,null,{timeout:10000});
  const after=await page.evaluate(()=>{const q=window.JinmuQA,s=q.engine.jinmuStates.get(q.actor);return {last:q.engine.lastMercenaryPlayback,busy:s.busy,visibleEffects:s.fx.pool.filter(p=>p.visible).length,auraAlphas:[...s.fx.auraSprites,...s.fx.dragonSprites].map(p=>p.alpha),atStation:Math.abs(q.actor.root.x-q.actor.baseX)<1&&Math.abs(q.actor.root.y-q.actor.baseY)<1,damageCalls:q.damageCalls.length};});
  assert.equal(after.busy,false);assert(after.auraAlphas.every(a=>a===1));assert.equal(after.visibleEffects,0);assert.equal(after.atStation,true);assert.equal(after.damageCalls,contact.contact.damageCalls.length);assert.equal(after.last.playbackRate,2.6);
  assert.equal(contact.contact.fx.auraVisible,true);assert.equal(contact.contact.fx.damageAuthority,'SERVER_ONLY');checks.push({label,mode,contact:contact.contact,spec:contact.spec,after});await page.close();
 }
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+' codex: '+e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,nickname:'핑크빛유두'}));});
  await page.goto(base+'/mercenary-codex/?view=owned#V-989');await page.locator('[data-code="V-989"]').click();
  for(const mode of ['PVE','PVP']){
   await page.locator('[data-loadout-mode="'+mode+'"]').click();
   if(await page.locator('[data-equip="V-989"]').isDisabled()){await page.locator('[data-unequip]').click();await page.waitForFunction(()=>!document.querySelector('[data-equip="V-989"]')?.disabled);}
   await page.locator('[data-equip="V-989"]').click();
   await page.waitForFunction(()=>document.querySelector('#loadoutName').textContent.endsWith('천룡검황 진무'));
  }
  await page.reload();await page.locator('[data-code="V-989"]').click();await page.waitForFunction(()=>document.querySelector('#loadoutName').textContent.endsWith('천룡검황 진무'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('#limitedCount').textContent(),'9');await page.screenshot({path:path.join(out,label+'-loadout.png'),fullPage:true});
  const state=await mercenaryAccountState(f.env,user);assert.equal(state.loadouts.PVE.mercenaryCode,'V-989');assert.equal(state.loadouts.PVP.mercenaryCode,'V-989');checks.push({label,mode:'loadout',pve:true,pvp:true,persisted:true});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({source:'canonical production V3/PVE bundles; actual twelve-target server PVE event',checks,errors},null,2));
 console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const cb of cleanup)await cb();}
