import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {MERCENARY_DIALOGUE_PROFILES as profiles} from '../preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {COOP_ENCOUNTER} from '../shared/cooperative-battleground-v1.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.DIALOGUE_QA_OUTPUT;
assert(out,'Set DIALOGUE_QA_OUTPUT to a directory outside the repository');fs.mkdirSync(out,{recursive:true});
const squads=inputs.map((s,i)=>({...structuredClone(s),mercenary:{...limitedDeploymentSnapshot(['V-989','V-996','V-999'][i]),combat:fixture.combat}}));
const built=createCooperativeBattle({squads,difficulty:'HARD',seed:3375805316});
const event=built.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_JINMU_AREA');
assert(event,'The real cooperative server must emit Jinmu ultimate events');
const payload=structuredClone(built.payload);payload.battleV2.result.timeline=[];
// Use the actual portal markup and CSS, including controls outside the V3 shell.
const portal=fs.readFileSync(path.join(root,'raid/cooperative/live.mjs'),'utf8').match(/portal\.innerHTML=`([\s\S]*?)`;/)[1].replace('${COOP_ENCOUNTER.arena}',COOP_ENCOUNTER.arena);
const html=fs.readFileSync(path.join(root,'preview/mercenary-golden-dragon-battle-v1/battle.html'),'utf8')
 .replace(/<script defer src="\.\/preview\.bundle\.js[^\"]*"><\/script>/,'<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script>')
 .replace('</head>','<link rel="stylesheet" href="/raid/cooperative/style.css"><style id="jinmu-dialogue-style-v3">.jinmu-dialogue-rail{display:none}</style><script defer src="/qa-boot.js"></script></head>')
 .replace(/<body>[\s\S]*<\/body>/,'<body><div class="coop-battle-portal">'+portal+'</div></body>');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const data=await fetch('/qa-data').then(r=>r.json());window.cnineCardCatalog=()=>data.payload.battleV2.teams.A.cards;
 const api=ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');
 const controller=await mountCoopBattle(document.querySelector('.coop-battle-mount'),data.payload);api.mountForBattle=mount;
 document.querySelector('.coop-battle-notice').hidden=true;
 document.querySelector('[data-phase]').textContent='1단계 · 제련소 외곽';document.querySelector('[data-time]').textContent='02:50';
 document.querySelector('[data-hp]').textContent='100%';document.querySelector('[data-battle-members]').textContent='핑크빛유두 · 검수 분대 2 · 검수 분대 3';
 const pattern=document.querySelector('[data-pattern]');pattern.hidden=false;
 document.querySelector('[data-pattern-kicker]').textContent='삼핵 차단';document.querySelector('[data-pattern-title]').textContent='세 노심의 연결을 끊으세요';
 document.querySelector('[data-pattern-time]').textContent='8초';document.querySelector('[data-pattern-instruction]').textContent='내 분대의 노심을 차단하세요.';
 document.querySelector('[data-pattern-members]').innerHTML='<span class="mine"><b>내 분대</b><small>차단 대기</small></span><span><b>분대 2</b><small>차단 대기</small></span><span><b>분대 3</b><small>차단 대기</small></span>';
 const action=document.querySelector('[data-pattern-action]');action.textContent='내 노심 차단';action.onclick=()=>window.JinmuCoopQA.clicked=true;
 const actor=engine.mercenaries.find(a=>a.cardId==='V-989');window.JinmuCoopQA={engine,controller,actor,event:data.event,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const send=(type,text)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(text);};
 if(url.pathname==='/qa.html')return send('text/html; charset=utf-8',html);
 if(url.pathname==='/qa-boot.js')return send('text/javascript',boot);
 if(url.pathname==='/qa-data')return send('application/json',JSON.stringify({payload,event}));
 if(url.pathname.startsWith('/api/'))return send('application/json',JSON.stringify({enabled:false,items:[]}));
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const type={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(base+'/qa.html');await page.waitForFunction(()=>window.JinmuCoopQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  const initial=await page.evaluate(()=>{
   const q=JinmuCoopQA,e=q.engine;
   q.dialogues=e.mercenaries.filter(a=>['V-989','V-996','V-999'].includes(a.cardId)).map(a=>a.cardId==='V-989'?e.jinmuStates.get(a).fx.dialogue:a.cardId==='V-996'?e.limitedStates.get(a).dialogue:e.heliosStates.get(a).fx.dialogue);
   q.sample=()=>{const node=document.querySelector('.jinmu-dialogue-rail'),box=e=>e?.getBoundingClientRect().toJSON(),rect=box(node),overlap=e=>{const r=box(e);return rect&&r.width&&r.height&&r.left<rect.right&&r.right>rect.left&&r.top<rect.bottom&&r.bottom>rect.top;};return {rect,canvas:box(e.host),speaker:node?.dataset.speaker,line:node?.querySelector('[role=status]').textContent,overlaps:[...document.querySelectorAll('button,.coop-battle-top,.coop-boss-hud,.coop-pattern')].filter(overlap).map(e=>e.className),count:document.querySelectorAll('.jinmu-dialogue-rail').length};};
   return {actors:e.characters.filter(a=>a.team==='ALLY').length,codes:q.dialogues.map(d=>d.profile.code).sort(),layout:q.sample(),overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(initial.actors,9);assert.deepEqual(initial.codes,['V-989','V-996','V-999']);assert.equal(initial.overflow,false);assert.equal(initial.layout.count,1);
  const rotations=[];
  for(const code of ['V-989','V-996','V-999']){
   const states=await page.evaluate(async code=>{
    const q=JinmuCoopQA,d=q.dialogues.find(d=>d.profile.code===code),rows=[];
    d.castIndex=0;
    for(let i=0;i<d.profile.lines.length+1;i++){
     d.begin();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     // An older actor finishing must not clear the current actor's casting state.
     for(const other of q.dialogues)if(other!==d)other.end();
     rows.push({...q.sample(),active:d.node.dataset.casting});
    }
    return rows;
   },code);
   assert.deepEqual(states.map(s=>s.line),[...profiles[code].lines,profiles[code].lines[0]].map(line=>'“'+line+'”'));
   for(const state of states){assert.equal(state.count,1);assert.equal(state.speaker,code);assert.equal(state.active,'true');assert.deepEqual(state.overlaps,[]);assert.equal(state.canvas.height,initial.layout.canvas.height,JSON.stringify({code,initial:initial.layout,state}));assert.equal(state.rect.top,state.canvas.top);}
   await page.screenshot({path:path.join(out,`${viewport.width}-${code}-mixed.png`),fullPage:true});rotations.push({code,states});
  }
  await page.locator('[data-pattern-action]').click();assert.equal(await page.evaluate(()=>JinmuCoopQA.clicked),true);
  const intermediate=await page.evaluate(()=>{const q=JinmuCoopQA,d=q.dialogues.find(d=>d.profile.code==='V-996');d.destroy();q.dialogues.find(d=>d.profile.code==='V-999').begin();return q.sample();});
  assert.equal(intermediate.count,1);assert.equal(intermediate.speaker,'V-999');assert.equal(intermediate.canvas.height,initial.layout.canvas.height);
  const cleanup=await page.evaluate(()=>{JinmuCoopQA.controller.destroy();ProjectVPixiBattle.destroy();return {panels:document.querySelectorAll('.jinmu-dialogue-rail').length,reserved:!!document.querySelector('.has-jinmu-dialogue'),body:document.body.hasAttribute('data-jinmu-dialogue')};});
  assert.deepEqual(cleanup,{panels:0,reserved:false,body:false});reports.push({width:viewport.width,initial,rotations,intermediate,cleanup});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({passed:reports.length,errors:errors.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
