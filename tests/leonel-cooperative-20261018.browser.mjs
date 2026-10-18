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

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.LEONEL_COOP_QA_OUTPUT;
assert(out);fs.mkdirSync(out,{recursive:true});
const reproduce=process.argv.includes('--reproduce');
const layoutOnly=process.argv.includes('--layout-only');
const squads=coopSquads({mercenaries:['V-055','V-049','V-046']});
squads[0].mercenary={...limitedDeploymentSnapshot('V-978'),combat:fixture.combat};
const built=createCooperativeBattle({squads,difficulty:'HARD',seed:7919});
const events=built.payload.battleV2.result.timeline.filter(e=>e.type==='MERCENARY_LEONEL_AREA');
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
 document.querySelector('.coop-battle-notice').hidden=true;document.querySelector('[data-phase]').textContent='격전지 · 검극 · 전선 단절';
 document.querySelector('[data-time]').textContent='02:50';document.querySelector('[data-hp]').textContent='100%';
 document.querySelector('[data-battle-members]').textContent='레오넬 · 검수 분대 2 · 검수 분대 3';
 const actor=engine.mercenaries.find(a=>a.cardId==='V-978'),s=engine.leonelStates.get(actor);
 const q=window.LeonelCoopQA={engine,controller,actor,built,ready:true,begins:[],results:[],contacts:[],cuts:[],interrupts:[],shots:[]};
 const begin=s.fx.begin.bind(s.fx);s.fx.begin=(mode,targets)=>{q.begins.push({mode,at:performance.now(),ids:targets.map(t=>t.id)});return begin(mode,targets);};
 const render=s.fx.render.bind(s.fx);s.fx.render=t=>{render(t);if(s.fx.mode==='ultimate'&&s.fx.activeFrames?.some(f=>f.key==='ultimate')&&!q.cuts.some(x=>x.cast===s.fx.dialogue.castIndex))q.cuts.push({cast:s.fx.dialogue.castIndex,time:t});};
 const cancel=s.fx.cancel.bind(s.fx);s.fx.cancel=()=>{if(s.busy||s.fx.mode==='ultimate')q.interrupts.push({mode:s.fx.mode,time:s.fx.clock?.time});return cancel();};
 const play=engine.playMercenaryEvent.bind(engine);engine.playMercenaryEvent=async e=>{const result=await play(e);if(e.type==='MERCENARY_LEONEL_AREA')q.results.push({...engine.lastMercenaryPlayback,eventAt:e.combatAtMs,result});return result;};
 const damage=engine.showAccountBattleUnitDamage.bind(engine);engine.showAccountBattleUnitDamage=(target,data)=>{if(s.busy&&s.fx.mode==='ultimate')q.contacts.push({target:target.id,damage:data.damage});return damage(target,data);};
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
 for(const viewport of (reproduce?[{width:1440,height:1000}]:[{width:1440,height:1000},...(layoutOnly?[{width:1768,height:957},{width:1024,height:768}]:[]),{width:390,height:844}])){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa.html');await page.waitForFunction(()=>window.LeonelCoopQA?.ready||window.qaError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.screenshot({path:path.join(out,viewport.width+'-dialogue.png')});
  const layout=await page.evaluate(async()=>{
   const q=LeonelCoopQA,e=q.engine,d=e.leonelStates.get(q.actor).fx.dialogue,node=d.node,box=e=>e.getBoundingClientRect().toJSON();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const before=box(e.host),heights=[];
   for(let i=0;i<5;i++){d.begin();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));heights.push(box(e.host).top);d.end();}d.castIndex=0;
   const rect=box(node),p=box(node.querySelector('.jinmu-dialogue-copy')),face=box(node.querySelector('.jinmu-dialogue-face'));
   return {before,heights,rect,text:p,face,overflow:document.documentElement.scrollWidth>innerWidth+1,frame:getComputedStyle(node.querySelector('.jinmu-dialogue-frame')).borderImageSource,railBackground:getComputedStyle(node).backgroundColor,rootScale:e.root.scale.x,stageScale:e.stage.scale.x,scene:e.scene,fit:e.viewportFit,geometry:e.viewportGeometry(),dock:box(e.host.closest('.battle-v3-live-shell').querySelector('.battle-v3-dock')),status:box(e.host.closest('.battle-v3-live-shell').querySelector('.battle-v3-status'))};
  });
  assert.equal(layout.overflow,false);assert.equal(layout.railBackground,'rgba(0, 0, 0, 0)');assert.equal(layout.rect.top,layout.before.top);for(const top of layout.heights)assert.equal(top,layout.before.top);
  if(viewport.width>760){assert.equal(layout.fit,null);assert.equal(layout.rootScale,Math.min(layout.before.width/1600,layout.before.height/820));assert.equal(layout.stageScale,1);}
  if(layoutOnly){
   const mixed=await page.evaluate(async()=>{
    const {MERCENARY_DIALOGUE_PROFILES}=await import('/preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js');
    const q=LeonelCoopQA,dialogue=q.engine.leonelStates.get(q.actor).fx.dialogue,rail=dialogue.rail;
    const others=['V-989','V-996','V-999','V-987'].map(code=>({profile:MERCENARY_DIALOGUE_PROFILES[code],active:false,lastLine:MERCENARY_DIALOGUE_PROFILES[code].idleLine}));
    others.forEach(m=>rail.add(m));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const top=q.engine.host.getBoundingClientRect().top,positions=[],speakers=[];
    for(const m of [dialogue,...others,dialogue]){
     if(m.profile.code==='V-987')m.lastLine=m.profile.lines.toSorted((a,b)=>b.length-a.length)[0];
     rail.show(m);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));positions.push(q.engine.host.getBoundingClientRect().top);
     const rect=rail.node.getBoundingClientRect(),host=q.engine.host.getBoundingClientRect(),geometry=q.engine.viewportGeometry();
     const overlaps=geometry.actors.filter(a=>[a.body,a.hud].some(b=>b.x<rect.right&&b.x+b.width>rect.left&&b.y+host.top<rect.bottom&&b.y+b.height+host.top>rect.top)).map(a=>a.id);
     speakers.push({code:m.profile.code,scale:q.engine.root.scale.x,rect:rect.toJSON(),overlaps});
    }
    const r=rail.node.getBoundingClientRect(),overlap=[...document.querySelectorAll('.coop-battle-top button')].some(b=>{const p=b.getBoundingClientRect();return p.right>r.left&&p.left<r.right&&p.top<r.bottom&&p.bottom>r.top;});
    rail.show(others.at(-1));return {top,positions,overlap,speakers};
   });
   for(const top of mixed.positions)assert.equal(top,mixed.top,'switching speakers must not resize the cooperative board');assert.equal(mixed.overlap,false);
   for(const s of mixed.speakers){assert.deepEqual(s.overlaps,[],JSON.stringify({width:viewport.width,s}));if(viewport.width>760)assert.equal(s.scale,layout.rootScale);}
   await page.screenshot({path:path.join(out,viewport.width+'-shiranui-dialogue.png')});
   const removed=await page.evaluate(()=>{const q=LeonelCoopQA,d=q.engine.leonelStates.get(q.actor).fx.dialogue;d.rail.destroy();return {top:q.engine.host.getBoundingClientRect().top,scale:q.engine.root.scale.x};});
   assert.equal(removed.top,layout.before.top);if(viewport.width>760)assert.equal(removed.scale,layout.rootScale);
   reports.push({width:viewport.width,layout,mixed});await page.evaluate(()=>{LeonelCoopQA.controller.destroy();ProjectVPixiBattle.destroy();});await page.close();continue;
  }
  await page.evaluate(()=>LeonelCoopQA.start());
  await page.waitForTimeout(16000);
  const report=await page.evaluate(()=>{const q=LeonelCoopQA;clearInterval(q.timer);let controller,diagnosticError;try{controller=q.controller.diagnostics();}catch(e){diagnosticError=e.stack;}return {begins:q.begins,results:q.results,contacts:q.contacts,cuts:q.cuts,interrupts:q.interrupts,controller,diagnosticError,retiredGridTiles:(q.engine.isoTiles||[]).filter(t=>t.destroyed).length,actors:q.engine.characters.map(a=>({id:a.id,destroyed:a.root.destroyed,position:!!a.root.position}))};});
  reports.push({width:viewport.width,layout,...report});
  fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({reports,errors,serverAreas:events.length},null,2));
  await page.screenshot({path:path.join(out,viewport.width+'-combat.png')});
  if(!reproduce){
   assert(report.begins.some(r=>r.mode==='ultimate'&&r.ids.length===3),'the first area cast must include the three server targets');
   // The 2.3M fighter clears the opening wave before the 1.79s visual contact.
   // Cancellation must not apply its stale receipt to the next wave; a surviving
   // boss allows the complete, original-speed cut to play. Multi-target contacts
   // are checked independently in leonel-live's stable twelve-target PVE scene.
   assert(report.results.some(r=>r.result&&r.damageApplications>=1),'the actual controller must complete a boss contact');
   assert(report.cuts.length,'the screen-cleave must remain visible');
   if(report.diagnosticError){assert(report.retiredGridTiles>0);assert.match(report.diagnosticError,/gridDiagnostics/);}
   else assert(report.controller.pendingActions<=4);
   assert(report.actors.every(a=>!a.destroyed&&a.position));
  }
  await page.evaluate(()=>{LeonelCoopQA.controller.destroy();ProjectVPixiBattle.destroy();});await page.close();
 }
 fs.writeFileSync(path.join(out,reproduce?'before.json':layoutOnly?'layout-only.json':'review.json'),JSON.stringify({reports,errors,serverAreas:events.length,productionTransactions:0},null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({reports:reports.map(r=>({width:r.width,results:r.results,cuts:r.cuts,interrupts:r.interrupts})),errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
