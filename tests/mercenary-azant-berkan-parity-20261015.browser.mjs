import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=path.join(root,'docs/qa/azant-berkan-parity-20261015');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false}),user={...f.user,role:'USER'};
await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)','V-056','2026-10-14','2026-10-14').run();
await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:'V-056',revision:0});
const mercenary=await loadMercenaryBattleSnapshot(f.env,user,'PVE');
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const pvp=createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:7919});
const volley=pvp.result.timeline.find(e=>e.type==='MERCENARY_AZANT_VOLLEY'&&e.actorId.startsWith('A:'));
const enemyVolley=pvp.result.timeline.find(e=>e.type==='MERCENARY_AZANT_VOLLEY'&&e.actorId.startsWith('B:'));assert.ok(volley&&enemyVolley);
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'아잔트'},seed:7919,limitMs:15000});
const area=hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_AZANT_AREA'&&e.hits.length===12);assert.ok(area);
const pveVolley=hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_AZANT_VOLLEY');assert.ok(pveVolley);
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:structuredClone(pvp)};pvpPayload.battleV2.result.timeline=[];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const html=mode=>baseHtml.replace(/<title>.*?<\/title>/,'<title>아잔트 전투 검수</title>').replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${['area','pve-volley'].includes(mode)?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>PROJECT V / SSS</small><h1>아잔트</h1><p>${mode==='area'?'청옥 강림':'결정창 포격'}</p></header><main id="lab-modal"></main></body>`);
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:['area','pve-volley'].includes(mode)?'HUNT':'PVP',playerName:'아잔트',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:['area','pve-volley'].includes(mode)?'HUNT':'PVP',playerName:'아잔트'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 window.AzantQA={engine,renderer,event:data.event,mode,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname.startsWith('/api/')){
  if(url.pathname==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
  if(url.pathname==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(f.env,user));
  if(url.pathname==='/api/mercenaries/v3/loadout'){let data='';for await(const part of req)data+=part;try{return json(res,await saveMercenaryLoadout(f.env,user,JSON.parse(data)));}catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});return res.end(JSON.stringify({error:e.message,code:e.code}));}}
  return json(res,{visible:false,enabled:false,items:[],user:{id:7,nickname:'검수 계정'}});
 }
 if(url.pathname==='/qa.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html(mode));}
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:['area','pve-volley'].includes(mode)?areaPayload:pvpPayload,event:mode==='area'?area:mode==='pve-volley'?pveVolley:volley});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])for(const mode of ['volley','pve-volley','area']){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
  await page.goto(base+'/qa.html?mode='+mode);await page.waitForFunction(()=>window.AzantQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined,JSON.stringify(errors));
  await page.evaluate(({mode})=>{
   const q=window.AzantQA,e=q.engine,a=e.combatantById(q.event.actorId);q.actor=a;q.damageCalls=[];q.hpCalls=[];q.idle=[];
   const s=e.azantStates.get(a);for(const t of [0,1.5,3,4.5]){s.fx.render(t);q.idle.push({x:a.root.x,y:a.root.y,sx:a.fullBodySprite.scale.x,sy:a.fullBodySprite.scale.y,texture:a.fullBodySprite.texture.uid,pose:s.fx.sample.pose,aura:s.fx.auraFrame});}
   q.station={x:a.baseX,y:a.baseY};
   const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,data)=>{q.damageCalls.push({id:t.id,...data});return show(t,data);};const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{const out=sync(t,h);q.hpCalls.push({id:t.id,hp:h});return out;};
   const contact=(mode==='area'?4.1:1.45)/1.625,timeline=e.timeline.bind(e);e.timeline=(build,cleanup,rate,options)=>timeline(tl=>{if(!options?.owners?.includes(a))return build(tl);q.timeline=tl;const call=tl.call.bind(tl);tl.call=(fn,args,at)=>call(()=>{fn();if(Math.abs(at-contact)<.0001){q.contact={time:tl.time(),damageCalls:[...q.damageCalls],hpCalls:[...q.hpCalls],fx:s.fx.diagnostics(),x:a.root.x,y:a.root.y,direction:a.view.scale.x};tl.pause();}},args,at);build(tl);tl.call=call;},cleanup,rate,options);
   if(mode==='basic'){const target=e.combatantById(q.event.targetId);q.promise=e.normalAttack(0,{attacker:a,target,damage:23,targetHp:77});}else q.promise=e.playEvents([q.event],{timedInternal:true});q.promise.catch(error=>q.error=error.stack);
  },{mode});
  await page.waitForFunction(()=>window.AzantQA.contact||window.AzantQA.error,null,{timeout:20000});
  const at=await page.evaluate(()=>{const q=window.AzantQA;return {contact:q.contact,idle:q.idle,error:q.error,station:q.station,event:q.event,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.equal(at.error,undefined);assert.equal(at.overflow,false);assert.equal(at.contact.damageCalls.length,mode==='basic'?1:at.event.hits.filter(h=>!h.dodge).length);
  assert.equal(at.contact.x,at.station.x);assert.equal(at.contact.y,at.station.y);assert.equal(at.contact.direction,mode==='enemy'?-1:1);assert.ok(at.contact.fx.visibleSprites>0);assert.ok(at.contact.fx.contacts.every(c=>Number.isFinite(c.at)&&Number.isFinite(c.to.x)&&Number.isFinite(c.to.y)));
  for(const row of at.idle){assert.equal(row.x,at.station.x);assert.equal(row.y,at.station.y);assert.deepEqual(row.pose,{key:'idle',frame:0});assert.equal(row.texture,at.idle[0].texture);assert.equal(row.sx,row.sy);}assert.ok(new Set(at.idle.map(i=>i.aura)).size>1);
  if(mode!=='basic')for(const hit of at.event.hits)assert.equal(at.contact.hpCalls.filter(c=>c.id===hit.targetId).length,1);
  await page.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});await page.evaluate(()=>{window.AzantQA.timeline.play();});
  await page.waitForFunction(()=>!window.AzantQA.engine.azantStates.get(window.AzantQA.actor).busy,null,{timeout:15000});
  const after=await page.evaluate(()=>{const q=window.AzantQA;return {last:q.engine.lastMercenaryPlayback,count:q.damageCalls.length,atStation:q.actor.root.x===q.actor.baseX&&q.actor.root.y===q.actor.baseY};});assert.equal(after.count,at.contact.damageCalls.length);assert.equal(after.atStation,true);
  // Interrupt before the first authoritative contact, then release all actors.
  const cancelled=await page.evaluate(async()=>{const q=window.AzantQA,e=q.engine,a=q.actor;e.timeline=q.engine.timeline;const before=q.damageCalls.length,target=e.combatantById(q.event.targetId),p=e.normalAttack(0,{attacker:a,target,damage:99,targetHp:1});await new Promise(r=>setTimeout(r,50));e.cancelTimelines();await p;const count=q.damageCalls.length;e.clearMercenaryActors();return {before,count,states:e.azantStates.size,layers:e.effectLayer.children.filter(c=>c.label==='SapphireFX').length};});assert.equal(cancelled.count,cancelled.before);assert.equal(cancelled.states,0);assert.equal(cancelled.layers,0);
  checks.push({label,mode,contact:at.contact,idle:at.idle,after,cancelled});console.log('PASS',label,mode);await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({source:'canonical production V3/PVE bundles; authoritative server events; isolated account API',checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const cb of cleanup)await cb();}
