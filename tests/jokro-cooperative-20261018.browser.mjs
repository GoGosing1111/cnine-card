// Local fixtures exercise the actual shared-clock controller and V3 bundle.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {coopSquads,fixture} from './helpers/cooperative-fixture.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {COOP_ENCOUNTER} from '../shared/cooperative-battleground-v1.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.JOKRO_COOP_QA_OUTPUT;
assert(out);fs.mkdirSync(out,{recursive:true});
const reproduce=process.argv.includes('--reproduce');
const layoutOnly=process.argv.includes('--layout-only');
const squads=coopSquads({mercenaries:['V-055','V-049','V-046']});
squads[0].mercenary={...limitedDeploymentSnapshot('V-979'),combat:fixture.combat};
const built=createCooperativeBattle({squads,difficulty:'HARD',seed:7919});
const events=built.payload.battleV2.result.timeline.filter(e=>e.type==='MERCENARY_JOKRO_AREA');
assert(events.length>1&&events[0].hits.length===3,'real server must cast on the three living enemies');
const portal=fs.readFileSync(path.join(root,'raid/cooperative/live.mjs'),'utf8').match(/portal\.innerHTML=`([\s\S]*?)`;/)[1].replace('${COOP_ENCOUNTER.arena}',COOP_ENCOUNTER.arena);
const html=fs.readFileSync(path.join(root,'preview/mercenary-golden-dragon-battle-v1/battle.html'),'utf8')
 .replace(/<script defer src="\.\/preview\.bundle\.js[^\"]*"><\/script>/,'<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script>')
 .replace('</head>','<link rel="stylesheet" href="/raid/cooperative/style.css"><script defer src="/qa-boot.js"></script></head>')
 .replace(/<body>[\s\S]*<\/body>/,'<body><div class="coop-battle-portal">'+portal+'</div></body>');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const built=await fetch('/qa-data').then(r=>r.json());window.cnineCardCatalog=()=>built.payload.battleV2.teams.A.cards;
 const api=ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');
 const controller=await mountCoopBattle(document.querySelector('.coop-battle-mount'),built.payload);api.mountForBattle=mount;
 document.querySelector('.coop-battle-notice').hidden=true;document.querySelector('[data-phase]').textContent='격전지 · 청룡단천';
 document.querySelector('[data-time]').textContent='02:50';document.querySelector('[data-hp]').textContent='100%';
 document.querySelector('[data-battle-members]').textContent='족로 · 검수 분대 2 · 검수 분대 3';
 const actor=engine.mercenaries.find(a=>a.cardId==='V-979'),s=engine.jokroStates.get(actor);
 const q=window.JokroCoopQA={engine,controller,actor,built,ready:true,begins:[],results:[],contacts:[],cuts:[],interrupts:[],shots:[]};
 const begin=s.fx.begin.bind(s.fx);s.fx.begin=(mode,targets)=>{q.begins.push({mode,at:performance.now(),ids:targets.map(t=>t.id)});return begin(mode,targets);};
 const render=s.fx.render.bind(s.fx);s.fx.render=t=>{render(t);if(s.fx.plan.mode==='awakening'&&s.fx.awakening?.splitVisible&&!q.cuts.some(x=>x.cast===s.fx.dialogue.castIndex))q.cuts.push({cast:s.fx.dialogue.castIndex,time:t});};
 const cancel=s.fx.cancel.bind(s.fx);s.fx.cancel=()=>{if(s.busy||s.fx.plan?.mode==='awakening')q.interrupts.push({mode:s.fx.plan?.mode,time:s.fx.clock?.time});return cancel();};
 const play=engine.playMercenaryEvent.bind(engine);engine.playMercenaryEvent=async e=>{const result=await play(e);if(e.type==='MERCENARY_JOKRO_AREA')q.results.push({...engine.lastMercenaryPlayback,eventAt:e.combatAtMs,result});return result;};
 const damage=engine.showAccountBattleUnitDamage.bind(engine);engine.showAccountBattleUnitDamage=(target,data)=>{if(s.busy&&s.fx.plan?.mode==='awakening')q.contacts.push({target:target.id,damage:data.damage});return damage(target,data);};
 q.start=()=>{q.startsAt=Date.now()+300;controller.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:q.startsAt,fighters:built.states[0]},payload:built.payload});
 q.timer=setInterval(()=>{const elapsed=Date.now()-q.startsAt,frame=built.states.findLast(s=>s.atMs<=elapsed)||built.states[0];controller.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:q.startsAt,fighters:frame}});},50);};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),send=(type,text)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(text);};
 if(url.pathname==='/qa.html')return send('text/html; charset=utf-8',html);
 if(url.pathname==='/qa-boot.js')return send('text/javascript',boot);
 if(url.pathname==='/qa-data')return send('application/json',JSON.stringify(built));
 if(url.pathname.startsWith('/api/'))return send('application/json',JSON.stringify({enabled:false,items:[]}));
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const type={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[],errors=[];
try{
 for(const viewport of (reproduce?[{width:1440,height:1000}]:[{width:1440,height:1000},{width:390,height:844}])){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa.html');await page.waitForFunction(()=>window.JokroCoopQA?.ready||window.qaError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.screenshot({path:path.join(out,viewport.width+'-dialogue.png')});
  const layout=await page.evaluate(async()=>{
   const q=JokroCoopQA,e=q.engine,d=e.jokroStates.get(q.actor).fx.dialogue,node=d.node,box=e=>e.getBoundingClientRect().toJSON();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const before=box(e.host),heights=[];
   for(let i=0;i<5;i++){d.begin();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));heights.push(box(e.host).top);d.end();}d.castIndex=0;
   const rect=box(node),p=box(node.querySelector('.jinmu-dialogue-copy')),face=box(node.querySelector('.jinmu-dialogue-face'));
   return {before,heights,rect,text:p,face,overflow:document.documentElement.scrollWidth>innerWidth+1,frame:getComputedStyle(node.querySelector('.jinmu-dialogue-frame')).borderImageSource};
  });
  assert.equal(layout.overflow,false);assert(layout.rect.bottom<=layout.before.top+1);for(const top of layout.heights)assert.equal(top,layout.before.top);
  if(layoutOnly){
   const mixed=await page.evaluate(async()=>{
    const {MERCENARY_DIALOGUE_PROFILES}=await import('/preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js');
    const q=JokroCoopQA,dialogue=q.engine.jokroStates.get(q.actor).fx.dialogue,rail=dialogue.rail;
    const others=['V-989','V-996','V-999'].map(code=>({profile:MERCENARY_DIALOGUE_PROFILES[code],active:false,lastLine:MERCENARY_DIALOGUE_PROFILES[code].idleLine}));
    others.forEach(m=>rail.add(m));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const top=q.engine.host.getBoundingClientRect().top,positions=[];
    for(const m of [dialogue,...others,dialogue]){rail.show(m);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));positions.push(q.engine.host.getBoundingClientRect().top);}
    const r=rail.node.getBoundingClientRect(),overlap=[...document.querySelectorAll('.coop-battle-top button')].some(b=>{const p=b.getBoundingClientRect();return p.right>r.left&&p.left<r.right&&p.top<r.bottom&&p.bottom>r.top;});
    others.forEach(m=>rail.remove(m));return {top,positions,overlap};
   });
   for(const top of mixed.positions)assert.equal(top,mixed.top,'switching speakers must not resize the cooperative board');assert.equal(mixed.overlap,false);
   reports.push({width:viewport.width,layout,mixed});await page.evaluate(()=>{JokroCoopQA.controller.destroy();ProjectVPixiBattle.destroy();});await page.close();continue;
  }
  await page.evaluate(()=>JokroCoopQA.start());
  await page.waitForTimeout(10500);
  const report=await page.evaluate(()=>{const q=JokroCoopQA;clearInterval(q.timer);return {begins:q.begins,results:q.results,contacts:q.contacts,cuts:q.cuts,interrupts:q.interrupts,controller:q.controller.diagnostics()};});
  reports.push({width:viewport.width,layout,...report});
  await page.screenshot({path:path.join(out,viewport.width+'-combat.png')});
  if(!reproduce){assert(report.results.some(r=>r.damageApplications>=3),'the actual cooperative controller must play the multi-target contact');assert(report.cuts.length,'the screen-cleave must remain visible');assert(report.controller.pendingActions<=4);}
  await page.evaluate(()=>{JokroCoopQA.controller.destroy();ProjectVPixiBattle.destroy();});await page.close();
 }
 fs.writeFileSync(path.join(out,reproduce?'before.json':layoutOnly?'layout-only.json':'review.json'),JSON.stringify({reports,errors,serverAreas:events.length,productionTransactions:0},null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({reports:reports.map(r=>({width:r.width,results:r.results,cuts:r.cuts,interrupts:r.interrupts})),errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
