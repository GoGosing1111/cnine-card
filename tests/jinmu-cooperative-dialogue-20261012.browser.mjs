import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {COOP_ENCOUNTER} from '../shared/cooperative-battleground-v1.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.JINMU_QA_OUTPUT;
assert(out,'Set JINMU_QA_OUTPUT to a directory outside the repository');fs.mkdirSync(out,{recursive:true});
const squads=inputs.map((s,i)=>({...structuredClone(s),mercenary:i===0?{...limitedDeploymentSnapshot('V-989'),combat:fixture.combat}:candidate(s.mercenaryCode)}));
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
  await page.goto(base+'/qa.html');await page.waitForFunction(()=>window.JinmuCoopQA?.ready||window.qaError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  const report=await page.evaluate(()=>{
   const q=JinmuCoopQA,node=document.querySelector('.jinmu-dialogue-rail'),box=e=>e?.getBoundingClientRect().toJSON(),rect=box(node);
   const overlap=e=>{const r=box(e);return rect&&r.width>0&&r.height>0&&r.left<rect.right&&r.right>rect.left&&r.top<rect.bottom&&r.bottom>rect.top;};
   return {width:innerWidth,formation:q.engine.formationCoop,mode:q.engine.activeBattlefieldMode,actors:q.engine.characters.filter(a=>a.team==='ALLY').length,dialogues:document.querySelectorAll('.jinmu-dialogue-rail').length,rect,canvas:box(q.engine.host),faceOpacity:node?getComputedStyle(node.querySelector('.jinmu-dialogue-face>i')).opacity:null,overlaps:[...document.querySelectorAll('button,.coop-battle-top,.coop-boss-hud,.coop-pattern')].filter(overlap).map(e=>e.className||e.textContent),overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(report.formation,true);assert.equal(report.mode,'RAID');assert.equal(report.actors,9);assert.equal(report.dialogues,1);
  assert.equal(report.faceOpacity,'1');assert.equal(report.overflow,false);assert.deepEqual(report.overlaps,[]);assert.equal(report.rect.top,report.canvas.top);
  // All five ultimate lines must keep the board and canvas at the same scale.
  const framing=await page.evaluate(async()=>{
   const q=JinmuCoopQA,e=q.engine,dialogue=e.jinmuStates.get(q.actor).fx.dialogue;
   await new Promise(r=>setTimeout(r,150));
   const sample=()=>({top:e.host.getBoundingClientRect().top,height:e.host.getBoundingClientRect().height,root:e.root.scale.x,stage:e.stage.scale.x});
   const before=sample(),frames=[];
   for(let i=0;i<5;i++){dialogue.begin();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));frames.push(sample());dialogue.end();}
   dialogue.castIndex=0;e.camera.focusAt({x:10,y:10},.5);frames.push(sample());
   return {before,frames,zoomEnabled:e.camera.zoomEnabled};
  });
  assert.equal(framing.zoomEnabled,false);
  for(const sample of framing.frames)assert.deepEqual(sample,framing.before,'ultimate must not shrink or reframe the cooperative board');
  report.framing=framing;
  await page.locator('[data-pattern-action]').click();assert.equal(await page.evaluate(()=>JinmuCoopQA.clicked),true);
  await page.evaluate(()=>{const q=JinmuCoopQA;q.promise=q.engine.playEvents([q.event],{timedInternal:true}).then(()=>q.finished=true);});
  await page.waitForFunction(()=>JinmuCoopQA.engine.jinmuStates.get(JinmuCoopQA.actor).fx.diagnostics().dialogue.active);
  const fx=await page.evaluate(()=>JinmuCoopQA.engine.jinmuStates.get(JinmuCoopQA.actor).fx.diagnostics());
  assert.equal(fx.dialogue.castIndex,1);assert.equal(fx.cutinBounds,null);assert.equal(fx.dialogue.fullIllustration,false);
  await page.screenshot({path:path.join(out,viewport.width+'-cooperative-dialogue.png'),fullPage:true});
  await page.waitForFunction(()=>JinmuCoopQA.finished,null,{timeout:12000});
  // The controller only hides the reusable renderer. Actor disposal belongs to
  // the runtime; the live parent independently removes the portal on leaving.
  const cleanup=await page.evaluate(()=>{JinmuCoopQA.controller.destroy();ProjectVPixiBattle.destroy();return {panels:document.querySelectorAll('.jinmu-dialogue-rail').length,portal:document.querySelector('.coop-battle-portal').classList.contains('has-jinmu-dialogue')};});
  assert.deepEqual(cleanup,{panels:0,portal:false});reports.push({...report,dialogue:fx.dialogue,cleanup});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({reports,errors},null,2));console.log(JSON.stringify({passed:reports.length,errors:errors.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
