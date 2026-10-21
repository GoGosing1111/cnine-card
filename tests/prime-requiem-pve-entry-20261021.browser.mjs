import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};

// Hold one large optional atlas indefinitely: entry and server hits must still
// finish. Then release it and exercise the longest FX via the real live wrapper.
// No production account, battle, reward or ownership requests are made.
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=process.env.PRIME_QA_OUTPUT||path.join(root,'docs/qa/prime-requiem-pve-entry-20261021');
fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));
 return m.characters.map(c=>({...c,grade:m.rarity}));
});
const cards=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,
 image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const monster={id:1,name:'전투 진입 검수',battle_power:1.6e10,isBoss:true};
const battleV2=createPveBattleV2({cards,monster,mercenary:{...limitedDeploymentSnapshot('V-975'),combat:fixture.combat},seed:77});
const event=battleV2.result.timeline.find(e=>e.type==='MERCENARY_PRIME_REQUIEM_AREA');
assert(event);
const payload={mode:'PVE',monster,battleV2:{...battleV2,result:{...battleV2.result,timeline:[]}}};
const template=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const data=await fetch('/qa-data').then(r=>r.json());window.cnineCardCatalog=()=>data.cards;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;
 api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal');
 const open=async()=>{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVE',playerName:'프라임 검수'});
  return window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:'PVE',playerName:'프라임 검수'});};
 const renderer=await open();await api.playEvents([{type:'DEPLOY'}]);
 window.PrimeEntryQA={engine,renderer,open,event:data.event,payload:data.payload,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/qa-data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({cards,payload,event}));}
 if(url.pathname==='/qa-boot.js'){res.setHeader('content-type','text/javascript');return res.end(boot);}
 if(url.pathname==='/qa/battle'){
  res.setHeader('content-type','text/html; charset=utf-8');
  return res.end(template.replace('<script defer src="preview.bundle.js"></script>',
   '<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script defer src="/qa-boot.js"></script>')
   .replace(/<body>[\s\S]*<\/body>/,'<body><main id="lab-modal"></main></body>'));
 }
 if(url.pathname.startsWith('/api/')){res.setHeader('content-type','application/json');return res.end('{"items":[]}');}
 if(process.env.PRIME_QA_REMOTE){res.writeHead(302,{location:'https://cnine-card.pages.dev'+url.pathname+url.search});return res.end();}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const checks=[],errors=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});
  let release;const held=new Promise(resolve=>{release=resolve;});
  let releaseImpact;const heldImpact=new Promise(resolve=>{releaseImpact=resolve;});
  await page.route('**/fx-blood-tiger-burst.png*',async route=>{await held;await route.continue();});
  await page.route('**/eclipse-impact-v1.webp*',async route=>{await heldImpact;await route.continue();});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  page.on('pageerror',e=>{errors.push(label+': '+e.message);console.error(e.stack);});
  page.on('requestfailed',r=>console.error('REQUEST',r.url(),r.failure()?.errorText));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.error('CONSOLE',m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa/battle');
  await page.waitForFunction(()=>window.PrimeEntryQA?.ready||window.qaError,null,{timeout:12000});
  await page.screenshot({path:path.join(out,label+'-entry.png')});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  const initial=await page.evaluate(async()=>{
   const q=window.PrimeEntryQA,e=q.engine,a=e.mercenaries[0];
   const initial={effectsPending:!e.primeStates.has(a),enemyCount:e.enemies.filter(t=>t.battleActive).length,
    inactiveCount:e.enemies.filter(t=>!t.battleActive).length,
    ready:document.querySelector('.battle-v3-live-shell').classList.contains('is-v3-ready'),deployed:e.liveDeployed};
   q.applications=0;const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(...args)=>{q.applications++;return sync(...args);};
   const target=e.enemies.find(t=>t.battleActive);
   initial.basicPlayed=await e.normalAttack(0,{attacker:a,target,damage:10,targetHp:99,targetShield:0});
   initial.basicApplications=q.applications;q.applications=0;
   initial.areaPlayed=await e.playMercenaryEvent(q.event);initial.areaApplications=q.applications;
   return initial;
  });
  assert.equal(initial.ready,true);assert.equal(initial.deployed,true);assert.equal(initial.effectsPending,true);
  assert.equal(initial.enemyCount,1);assert(initial.inactiveCount>0);
  assert.equal(initial.basicPlayed,true);assert.equal(initial.basicApplications,1);
  assert.equal(initial.areaPlayed,true);assert.equal(initial.areaApplications,1);
  release();
  await page.waitForFunction(()=>window.PrimeEntryQA.engine.primeStates.size===1,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>[...window.PrimeEntryQA.engine.primeStates.values()][0].fx.diagnostics().impactReady),false);
  await page.screenshot({path:path.join(out,label+'-ready.png')});
  await page.evaluate(async()=>{
   const q=window.PrimeEntryQA;q.old=q.engine.primeStates.get(q.engine.mercenaries[0]);
   const event=structuredClone(q.event);event.skillId='MS-966';
   q.payload.battleV2.result={timeline:[event]};
   q.renderer=await q.open();
  });
  await page.waitForFunction(()=>window.PrimeEntryQA.engine.primeStates.size===1,null,{timeout:60000});
  const after=await page.evaluate(async()=>{
   const q=window.PrimeEntryQA,e=q.engine,play=e.playMercenaryEvent.bind(e);
   e.playMercenaryEvent=async event=>{const start=performance.now(),result=await play(event);q.eventResult={result,elapsed:performance.now()-start};return result;};
   q.applications=0;await q.renderer.play();const state=e.primeStates.get(e.mercenaries[0]);
   return {applications:q.applications,pose:state.fx.state.pose,effects:state.fx.pool.filter(s=>s.visible).length,
    playback:e.lastMercenaryPlayback,completed:q.eventResult,oldDestroyed:q.old.fx.destroyed,
    ready:document.querySelector('.battle-v3-live-shell').classList.contains('is-v3-ready')};
  });
  assert.equal(after.applications,1);assert.equal(after.pose,0);assert.equal(after.effects,0);
  assert.equal(after.playback.mode,'blood-moonfall');assert.equal(after.playback.playbackRate,2);
  assert.equal(after.completed.result,true);assert(after.completed.elapsed>=2400);
  assert.equal(after.oldDestroyed,true);assert.equal(after.ready,true);
  releaseImpact();
  await page.waitForFunction(()=>[...window.PrimeEntryQA.engine.primeStates.values()][0].fx.diagnostics().impactReady,null,{timeout:30000});
  after.delayedImpactNeverBlockedPlayback=true;
  checks.push({label,initial,after});await page.close();console.log(label+' ordinary PVE entry/reuse PASS');
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}
