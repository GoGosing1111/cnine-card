import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {MERCENARY_DIALOGUE_PROFILES as profiles} from '../preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js';

const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.DIALOGUE_QA_OUTPUT;
assert(out,'Set DIALOGUE_QA_OUTPUT outside the checkout');fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const samples={};
for(const code of ['V-996','V-999']){
 const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};
 const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:profiles[code].name},seed:7919,limitMs:15000});
 const event=hunt.payload.battleV2.result.timeline.find(e=>e.type===`MERCENARY_${code==='V-996'?'VALTER':'HELIOS'}_AREA`&&e.hits.length===12);
 assert.ok(event,code+' server ultimate event');
 const payload=structuredClone(hunt.payload);payload.battleV2.result.timeline=[];
 const merc={...mercenary,id:'A:MERCENARY:'+code,cardId:code,hp:100,maxHp:100,shield:0,maxShield:0};
 samples[code]={payload,event,pvp:{previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}}};
}
const huntHtml=fs.readFileSync(path.join(root,'pve/legion-hunt/index.html'),'utf8');
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
function html(mode){
 if(mode==='pve')return huntHtml.replace(/<script defer src="\/preview\/sustained-hunt-v2\/app\.js[^\"]*"><\/script>/,'').replace(/<script defer src="\/js\/jokgak-city-v1\.js[^\"]*"><\/script>/,'').replace('</head>','<script defer src="/qa-boot.js"></script></head>');
 return baseHtml.replace('<script defer src="preview.bundle.js"></script>','<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script defer src="/qa-boot.js"></script>').replace(/<body>[\s\S]*<\/body>/,'<body><main id="lab-modal"></main></body>');
}
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const params=new URLSearchParams(location.search),code=params.get('code'),mode=params.get('mode'),data=await fetch('/qa-data?'+params).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('hunt-modal')||document.getElementById('lab-modal'),field=mode==='pve'?'HUNT':'PVP',prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:data.name,opponentName:'몬스터 군단'});
 const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:data.name});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 if(document.getElementById('hunt-boss-hud')){document.getElementById('hunt-boss-hud').hidden=false;document.getElementById('boss-name').textContent='태고의 수호자';document.getElementById('boss-percent').textContent='100%';}
 const actor=engine.mercenaries.find(a=>a.cardId===code),dialogue=code==='V-996'?engine.limitedStates.get(actor).dialogue:engine.heliosStates.get(actor).fx.dialogue;
 window.DialogueQA={engine,renderer,actor,dialogue,event:data.event,code,mode,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),code=url.searchParams.get('code'),mode=url.searchParams.get('mode');
 const send=(type,data)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);};
 if(url.pathname==='/qa.html')return send('text/html; charset=utf-8',html(mode));
 if(url.pathname==='/qa-boot.js')return send('text/javascript',boot);
 if(url.pathname==='/qa-data')return send('application/json',JSON.stringify({deck,name:profiles[code].name,payload:mode==='pve'?samples[code].payload:samples[code].pvp,event:samples[code].event}));
 if(url.pathname.startsWith('/api/'))return send('application/json','{"enabled":false,"items":[]}');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(const code of ['V-996','V-999'])for(const mode of ['pve','pvp']){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(base+'/qa.html?code='+code+'&mode='+mode);await page.waitForFunction(()=>window.DialogueQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(()=>{
   const q=DialogueQA,e=q.engine;q.damage=[];const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(target,data)=>{q.damage.push(target.id);return show(target,data);};
   const timeline=e.timeline.bind(e);e.timeline=(build,cleanup,rate,options)=>timeline(tl=>{build(tl);if(options?.owners?.includes(q.actor)){q.timeline=tl;q.timing={releaseAt:options.releaseAt,duration:tl.duration()};tl.call(()=>{q.capture=true;tl.pause();},[],.04);}},cleanup,rate,options);
   q.promise=q.mode==='pve'?e.playEvents([q.event],{timedInternal:true}):e.normalAttack(0,{attacker:q.actor,target:e.enemies[0],damage:23,targetHp:77});q.promise.then(()=>q.done=true).catch(error=>q.error=error.stack);
  });
  await page.waitForFunction(()=>DialogueQA.capture||DialogueQA.error,null,{timeout:15000});assert.equal(await page.evaluate(()=>DialogueQA.error),undefined);
  const initial=await page.evaluate(()=>{
   const q=DialogueQA,node=document.querySelector('.jinmu-dialogue-rail'),box=e=>e?.getBoundingClientRect().toJSON(),rect=box(node);
   const overlap=e=>{const r=box(e);return rect&&r.width&&r.height&&r.left<rect.right&&r.right>rect.left&&r.top<rect.bottom&&r.bottom>rect.top;};
   return {dialogue:q.dialogue.diagnostics(),count:document.querySelectorAll('.jinmu-dialogue-rail').length,rect,canvas:box(q.engine.host),faceOpacity:node?getComputedStyle(node.querySelector('.jinmu-dialogue-face>i')).opacity:null,overlaps:[...document.querySelectorAll('button,select,.battle-v3-header,.boss-hud,.hunt-readout,.hunt-command')].filter(overlap).map(e=>e.id||e.className),overflow:document.documentElement.scrollWidth>innerWidth+1,timing:q.timing};
  });
  assert.equal(initial.overflow,false);assert.equal(initial.count,mode==='pve'?1:0);
  if(mode==='pve'){
   assert.equal(initial.dialogue.castIndex,1);assert.equal(initial.faceOpacity,'1');assert.equal(initial.dialogue.speaker,code);assert.equal(initial.dialogue.fullIllustration,false);assert.deepEqual(initial.overlaps,[]);assert(initial.rect.bottom<=initial.canvas.top+1);
   await page.screenshot({path:path.join(out,`${viewport.width}-${code}-battle.png`),fullPage:true});
   await page.locator('.jinmu-dialogue-rail').screenshot({path:path.join(out,`${viewport.width}-${code}-line-1.png`)});
   const lines=[initial.dialogue.line];
   for(let i=2;i<=3;i++){
    const state=await page.evaluate(()=>{const q=DialogueQA;q.dialogue.end();q.dialogue.begin();return {line:q.dialogue.line.textContent,canvas:q.engine.host.getBoundingClientRect().toJSON()};});
    lines.push(state.line);assert.equal(state.canvas.height,initial.canvas.height);
    await page.locator('.jinmu-dialogue-rail').screenshot({path:path.join(out,`${viewport.width}-${code}-line-${i}.png`)});
   }
   assert.deepEqual(lines,profiles[code].lines.map(line=>'“'+line+'”'));
   const again=await page.evaluate(()=>{DialogueQA.dialogue.begin();return DialogueQA.dialogue.line.textContent;});assert.equal(again,lines[0]);
  }else assert.equal(initial.dialogue.visible,false);
  await page.evaluate(()=>{DialogueQA.timeline.play();});await page.waitForFunction(()=>{const q=DialogueQA,s=q.code==='V-996'?q.engine.limitedStates.get(q.actor):q.engine.heliosStates.get(q.actor);return q.error||q.done&&!s.busy;},null,{timeout:15000});assert.equal(await page.evaluate(()=>DialogueQA.error),undefined);
  const finish=await page.evaluate(()=>{const q=DialogueQA,r={damage:q.damage,dialogue:q.dialogue.diagnostics(),last:q.engine.lastMercenaryPlayback};q.engine.clearMercenaryActors();r.remaining=document.querySelectorAll('.jinmu-dialogue-rail').length;r.reserved=!!document.querySelector('.has-jinmu-dialogue');return r;});
  assert.equal(finish.damage.length,mode==='pve'?samples[code].event.hits.filter(h=>!h.dodge).length:1);assert.equal(new Set(finish.damage).size,finish.damage.length);assert.equal(finish.dialogue.active,false);assert.equal(finish.remaining,0);assert.equal(finish.reserved,false);
  assert.equal(finish.last.playbackRate,code==='V-996'?2.5:2.6);
  checks.push({width:viewport.width,code,mode,initial,finish});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,errors:errors.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
