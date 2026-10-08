import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {OVERHEAD} from '../preview/mercenary-crimson-silver-knight-battle-v1/skill.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'preview/valter-pve-motion-20261009');
fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-996'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'발테르'},seed:7919,limitMs:15000});
const areaEvent=hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_VALTER_AREA'&&e.hits.length===12);
assert.ok(areaEvent);
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-996',cardId:'V-996',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
function html(mode){return baseHtml.replace(/<title>.*?<\/title>/,'<title>발테르 전투 검수</title>')
 .replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode==='area'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`)
 .replace(/<body>[\s\S]*<\/body>/,`<body><header><small>PROJECT V / SSS LIMITED</small><h1>발테르 · ${mode==='area'?'종결 집행':'대검 내려찍기'}</h1><p>칼 모션 2.5배 · ${mode==='area'?'PVE 적 진영 광역 타격':'PVP 기본 공격'}</p></header><nav class="toolbar"><span id="health">V3 전장 준비 중</span></nav><main id="lab-modal"></main></body>`);}
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:mode==='area'?'HUNT':'PVP',playerName:'발테르',opponentName:mode==='area'?'몬스터 군단':'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:mode==='area'?'HUNT':'PVP',playerName:'발테르'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 document.getElementById('health').textContent='SSS LIMITED · 실제 V3 전투';prepared.phase.textContent=mode==='area'?'PVE · 종결 집행':'PVP · 대검 내려찍기';
 window.ValterQA={engine,renderer,event:data.event,mode,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html(mode));}
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode==='area'?areaPayload:pvpPayload,event:mode==='area'?areaEvent:null});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])for(const mode of ['basic','area']){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
  await page.goto(base+'/qa.html?mode='+mode);await page.waitForFunction(()=>window.ValterQA?.ready||window.qaError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(({contact})=>{
   const q=window.ValterQA,e=q.engine,a=e.mercenaries.find(a=>a.cardId==='V-996');q.actor=a;q.damageCalls=[];q.hpCalls=[];
   const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,data)=>{q.damageCalls.push({id:t.id,...data});return show(t,data);};
   const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{const result=sync(t,h);q.hpCalls.push({id:t.id,input:h,hp:t.hp});return result;};
   const timeline=e.timeline.bind(e);e.timeline=(build,cleanup,rate,options)=>timeline(tl=>{
    if(!options?.owners?.includes(a))return build(tl);
    q.timeline=tl;q.spec={rate,releaseAt:options.releaseAt};
    const call=tl.call.bind(tl);tl.call=(fn,args,at)=>call(()=>{fn();if(Math.abs(at-contact)<.0001){q.contact={time:tl.time(),duration:tl.duration(),scale:tl.timeScale(),hpCalls:[...q.hpCalls],damageCalls:[...q.damageCalls],fx:e.limitedStates.get(a).knight.diagnostics()};tl.pause();}},args,at);
    build(tl);tl.call=call;
   },cleanup,rate,options);
   if(q.mode==='area'){e.skillChipPlayback?.remember(q.event);q.promise=e.playEvents([q.event],{timedInternal:true});}
   else{const target=e.enemies[0];q.target=target;q.promise=e.normalAttack(0,{attacker:a,target,damage:23,targetHp:77});}
   q.promise.catch(error=>{q.error=error.stack;});
  },{contact:OVERHEAD.contact/2.5});
  await page.waitForFunction(()=>window.ValterQA.contact||window.ValterQA.error,null,{timeout:15000});
  const contact=await page.evaluate(()=>({contact:window.ValterQA.contact,spec:window.ValterQA.spec,error:window.ValterQA.error,overflow:document.documentElement.scrollWidth>innerWidth+1}));
  assert.equal(contact.error,undefined);assert.equal(contact.overflow,false);assert.equal(contact.spec.rate,null);
  assert.ok(Math.abs(contact.contact.duration-(mode==='area'?5.55:4.05)/2.5)<1e-6);assert.equal(contact.contact.scale,1);
  assert.equal(contact.contact.fx.mode,mode==='area'?'ultimate':'attack');assert.ok(contact.contact.fx.visibleSprites>0);
  assert.equal(contact.contact.damageCalls.length,mode==='area'?areaEvent.hits.filter(h=>!h.dodge).length:1);
  if(mode==='area')for(const h of areaEvent.hits)assert.ok(contact.contact.hpCalls.some(c=>c.id===h.targetId&&Math.abs(c.input-h.targetHpAfter/h.targetMaxHp*100)<1e-7));
  await page.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});
  await page.evaluate(()=>{window.ValterQA.timeline.play();});await page.waitForFunction(()=>!window.ValterQA.engine.limitedStates.get(window.ValterQA.actor).busy,null,{timeout:10000});
  const after=await page.evaluate(()=>{const q=window.ValterQA,s=q.engine.limitedStates.get(q.actor);return {last:q.engine.lastMercenaryPlayback,ambient:!!s.ambient,atStation:Math.abs(q.actor.root.x-q.actor.baseX)<1&&Math.abs(q.actor.root.y-q.actor.baseY)<1,damageCalls:q.damageCalls.length};});
  assert.equal(after.ambient,true);assert.equal(after.atStation,true);assert.equal(after.damageCalls,contact.contact.damageCalls.length);assert.equal(after.last.playbackRate,2.5);
  checks.push({label,mode,contact:contact.contact,spec:contact.spec,after});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({source:'canonical production V3/PVE bundles; actual twelve-target server PVE event',checks,errors},null,2));
 console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
