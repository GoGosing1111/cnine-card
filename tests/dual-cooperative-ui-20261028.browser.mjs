import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {ownerSquads,pair,contentPayloads} from './helpers/dual-content-fixture.mjs';
import {reviewMercenaries} from './helpers/companion-preparation-fixture.mjs';
import {COOP_DUAL_RULES,COOP_ENCOUNTER,validateCoopSelection} from '../shared/cooperative-battleground-v1.mjs';
import {createCoopRoom,coopCommand,coopView} from '../functions/_cooperative_room.js';
import {COMPANION_PREPARATION_REVIEW as REVIEW} from '../shared/companion-loadout-v2.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.DUAL_QA_DIR,media=process.env.DUAL_QA_MEDIA_ROOT;
assert(out&&media);fs.mkdirSync(out,{recursive:true});
const roster=reviewMercenaries(),squads=ownerSquads(),payload=contentPayloads({legion:false}).COOP,user={id:1,nickname:'두 용병 검수'};
let room,requests=[];
const reset=()=>room=createCoopRoom({id:'123456789A',user,clientId:'qa-dual-initial-client',difficulty:'HARD',seed:28,now:Date.now(),[REVIEW]:true});reset();
const portal=fs.readFileSync(path.join(root,'raid/cooperative/live.mjs'),'utf8').match(/portal\.innerHTML=`([\s\S]*?)`;/)[1].replace('${COOP_ENCOUNTER.arena}',COOP_ENCOUNTER.arena);
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-golden-dragon-battle-v1/battle.html'),'utf8').replace(/\.\/preview\.bundle\.js[^\"]*/, '/preview/project-v-v3/project-v-pixi-battle.bundle.js');
function html(combat){return baseHtml.replace('</head>','<link rel="stylesheet" href="/raid/cooperative/style.css"></head>').replace(/<body>[\s\S]*<\/body>/,`<body style="background:#081621"><main id="root" style="max-width:1240px;margin:auto"></main>${combat?'<div class="coop-battle-portal">'+portal+'</div>':''}<script type="module">
localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
window.CNineCoreRaidBridge={ensureFeatureResources:async()=>{}};
try{${combat?`const data=await fetch('/qa-payload').then(r=>r.json());window.cnineCardCatalog=()=>data.battleV2.teams.A.cards;const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');window.qaController=await mountCoopBattle(document.querySelector('.coop-battle-mount'),data);window.qaEngine=await ProjectVPixiBattle.mount();`:`const {mountCooperative}=await import('/raid/cooperative/live.mjs');window.qaLobby=await mountCooperative(document.getElementById('root'));`}}
catch(error){window.qaError=error.stack;}</script></body>`);}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://qa'),send=(body,status=200,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'?body:JSON.stringify(body));};
 if(url.pathname==='/qa')return send(html(url.searchParams.has('combat')),200,'text/html; charset=utf-8');
 if(url.pathname==='/qa-payload')return send(payload);
 if(url.pathname.startsWith('/api/')){
  const kind=url.pathname.split('/').at(-1);let body={};if(req.method==='POST'){const chunks=[];for await(const b of req)chunks.push(b);body=JSON.parse(Buffer.concat(chunks).toString());}
  requests.push({method:req.method,kind,...(body.mercenaryCodes?{mercenaryCodes:body.mercenaryCodes}:{})});
  if(kind==='feature')return send({ok:true,mode:'TEST',accessible:true,owner:false,rewardLocked:true,rules:COOP_DUAL_RULES,energy:{version:1,current:3,maximum:3,updatedAt:Date.now(),serverNow:Date.now()}});
  if(kind==='options')return send({ok:true,cards:squads[0].cards,mercenaries:roster,you:1,nickname:user.nickname});
  if(kind==='rooms')return send({ok:true,rooms:[]});
  if(kind==='current')return send(coopView(room,user,Date.now()));
  if(kind==='ticket'){room.members[0].clientId=body.clientId;return send(coopView(room,user,Date.now()));}
  if(['select','ready','unready'].includes(kind)){
   if(kind!=='unready'){const chosen=validateCoopSelection(body,COOP_DUAL_RULES);body.loadout={...squads[0],cards:chosen.cardIds.map(id=>squads[0].cards.find(c=>c.id===id)),mercenaries:chosen.mercenaryCodes.map(c=>roster.find(m=>m.code===c))};}
   coopCommand(room,user,kind,body,Date.now());return send(coopView(room,user,Date.now()));
  }
  return send({ok:true,items:[],pending:[],revision:'0'});
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return send('',403);
 if(!fs.existsSync(file)&&/\.(png|webp|avif|jpe?g|woff2?|ttf|mp3|ogg|wav)$/i.test(file))file=path.join(media,path.relative(root,file));
 if(!fs.existsSync(file))return send('',404);
 const type={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':type});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const width of [1440,390]){
 reset();const page=await browser.newPage({viewport:{width,height:width===390?844:1000},hasTouch:width===390,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin+'/qa');await page.waitForFunction(()=>window.qaLobby||window.qaError);assert.equal(await page.evaluate(()=>window.qaError),undefined);
 assert.equal(await page.locator('[data-merc-count]').innerText(),'0/2');
 const click=async selector=>{await page.locator(selector).click();await page.waitForFunction(()=>!document.getElementById('root').classList.contains('is-busy'));};
 await click('[data-choice="'+pair[0].code+'"]');await click('[data-choice="'+roster[2].code+'"]');assert.match(await page.locator('[data-alert]').innerText(),/리미티드/);
 assert.equal(await page.locator('[data-merc-count]').innerText(),'1/2');await click('[data-choice="'+pair[1].code+'"]');
 await click('[data-picker="card"]');for(const c of squads[0].cards)await click('[data-choice="'+c.id+'"]');
 assert.deepEqual(room.members[0].loadout.mercenaries.map(m=>m.code),pair.map(m=>m.code));
 assert.equal(await page.locator('[data-merc-count]').innerText(),'2/2');assert.equal(await page.locator('.coop-squad-pair img').count(),2);
 assert.equal(await page.locator('[data-ready]').isDisabled(),false);await page.locator('[data-guide]').click();await page.locator('[data-chapter="2"]').click();assert.match(await page.locator('[data-guide-content]').innerText(),/용병 2명/);await page.locator('[data-close-guide]').click();
 await page.locator('[data-room]').screenshot({path:path.join(out,`lobby-${width}.png`)});
 await page.reload();await page.waitForFunction(()=>window.qaLobby||window.qaError);assert.equal(await page.locator('[data-merc-count]').innerText(),'2/2');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.goto(origin+'/qa?combat=1');await page.waitForFunction(()=>window.qaEngine||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
 assert.equal(await page.evaluate(()=>qaEngine.mercenaries.filter(a=>a.root.visible).length),6);
 await page.evaluate(()=>qaController.update({serverNow:Date.now(),state:{status:'LOADING'}}));
 await page.screenshot({path:path.join(out,`combat-${width}.png`)});
 await page.setViewportSize({width,height:width===390?764:920});await page.evaluate(()=>ProjectVPixiBattle.cancelActiveAnimations());
 assert.ok(await page.evaluate(()=>qaEngine.mercenaries.every(a=>a.root.x===a.baseX&&a.root.y===a.baseY)));
 assert.deepEqual(errors,[]);reports.push({width,selection:true,restore:true,rankLimit:true,actors:6,errors});await page.close();
}
}catch(e){for(const page of browser.contexts().flatMap(c=>c.pages()))await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,requests},null,2));console.log(JSON.stringify(reports));}
