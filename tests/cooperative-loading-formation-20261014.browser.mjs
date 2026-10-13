import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {COOP_ENCOUNTER} from '../shared/cooperative-battleground-v1.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.COOP_LOADING_QA_OUTPUT;
assert(out,'Set COOP_LOADING_QA_OUTPUT to a directory outside the repository');fs.mkdirSync(out,{recursive:true});
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
 const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');
 const controller=await mountCoopBattle(document.querySelector('.coop-battle-mount'),data.payload);
 const engine=await ProjectVPixiBattle.mount();window.qa={engine,controller};
 }catch(e){window.qaError=e.stack;}});`;
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
 await page.goto(base+'/qa.html');await page.waitForFunction(()=>window.qa||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
 await page.waitForTimeout(600);
 const sample=()=>page.evaluate(()=>{const e=qa.engine;return {scale:e.root.scale.x,host:e.host.getBoundingClientRect().toJSON(),fit:e.viewportFit,actors:e.mercenaries.map(a=>({code:a.cardId,base:[a.baseX,a.baseY],actual:[a.root.x,a.root.y],start:e.cryvernStates?.get(a)?.fx.start}))};});
 const initial=await sample();await page.screenshot({path:path.join(out,viewport.width+'-loading.png')});
 await page.evaluate(()=>qa.controller.update({serverNow:Date.now(),state:{status:'LOADING'}}));
 const cancelled=await sample();
 for(const state of [initial,cancelled])for(const a of state.actors)assert.deepEqual(a.actual,a.base,'loading formation: '+a.code);
 if(viewport.width>760)assert.ok(initial.scale>.69,'PC must fit the occupied five-column board');
 await page.setViewportSize({width:viewport.width,height:viewport.height-80});await page.waitForTimeout(200);
 await page.evaluate(()=>ProjectVPixiBattle.cancelActiveAnimations());
 const resized=await sample();for(const a of resized.actors)assert.deepEqual(a.actual,a.base,'resize cancellation: '+a.code);
 await page.evaluate(async()=>{
  const e=qa.engine,a=e.mercenaries.find(a=>a.cardId==='V-049'),target=e.enemies[0];
  await e.normalAttack(0,{attacker:a,target,apply:()=>{}});
 });
 await page.waitForFunction(()=>qa.engine.mercenaries.every(a=>a.root.x===a.baseX&&a.root.y===a.baseY),null,{timeout:5000});
 const returned=await sample();for(const a of returned.actors)assert.deepEqual(a.actual,a.base,'attack return: '+a.code);
 reports.push({viewport,initial,cancelled,resized,returned});console.log(JSON.stringify(reports.at(-1)));
 await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,errors},null,2));assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
