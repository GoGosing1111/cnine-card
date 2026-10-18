// Real server receipts through the shipped web wrapper and V3 bundle. No live account writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {SAHYEON,sahyeonLiveProfile} from '../shared/apocalypse-sahyeon-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import reference from '../preview/apocalypse-sahyeon-20261019-v1/azuma-reference.json' with {type:'json'};
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.LEONEL_BOSS_QA_OUTPUT||path.join(root,'docs/qa/leonel-boss-playback-20261019');
const reproduce=process.argv.includes('--reproduce'),production=process.argv.includes('--production');fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p))).characters);
const cards=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {id,cardId:id,name:c.member,image:'/'+c.sourceArt,power:1e6,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const profile=sahyeonLiveProfile(reference.referenceProfile),monster={id:80,name:SAHYEON.name,pve_tab:'APOCALYPSE',is_boss:1,image_url:SAHYEON.sourceArt};
const runtime=pveDifficultyRuntime({apocalypse:{enabled:true,monsterProfiles:{80:profile}}},monster);
const battle=createPveBattleV2({cards,mercenary:{...limitedDeploymentSnapshot('V-978'),combat:fixture.combat},monster:runtime.engineMonster,seed:83});
const area=battle.result.timeline.find(e=>e.type==='MERCENARY_LEONEL_AREA');
const boss=battle.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL');assert(area);assert.equal(boss.length,3);assert(area.seq<boss[0].seq);assert(!area.combatClock);
// Isolate the reported transition, retaining every selected receipt byte and its order.
const timeline=[area,...boss];
const payload=interactive=>({mode:'PVE',monster,...(interactive?{apocalypseChallenge:{requestId:'isolated-playback-test'}}:{}),battleV2:{...battle,result:{timeline}}});
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const interactive=new URLSearchParams(location.search).get('interactive')==='1',data=await fetch('/qa-data?interactive='+Number(interactive)).then(r=>r.json());window.cnineCardCatalog=()=>data.cards;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:'PVE'}),q=window.LeonelBossQA={completed:[],hpCalls:[],casts:[],pressureSeen:false};
 q.renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,mode:'PVE',data:data.payload,onCombatEvent(event){q.completed.push(event.type);if(event.type==='APOCALYPSE_SKILL')q.casts.push({...engine.lastSahyeonPlayback});}});api.mountForBattle=mount;q.engine=engine;
 const hp=engine.syncTargetHp.bind(engine);engine.syncTargetHp=(t,v)=>{q.hpCalls.push({id:t.id,hp:v});return hp(t,v);};
 const fx=engine.leonelStates.get(engine.mercenaries[0]).fx,render=fx.render.bind(fx);fx.render=t=>{render(t);if(fx.mode==='ultimate'&&t>2.3)q.pressureSeen=true;};
 q.start=()=>{q.started=performance.now();q.promise=q.renderer.play().then(value=>{q.result=value;},e=>{q.error=e.stack;}).finally(()=>{q.elapsed=performance.now()-q.started;q.done=true;});};q.ready=true;
}catch(error){window.qaError=error.stack;}});`;
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const html=baseHtml.replace('<script defer src="preview.bundle.js"></script>','<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script defer src="/qa-boot.js"></script>').replace(/<body>[\s\S]*<\/body>/,'<body><main id="lab-modal"></main></body>');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET')return res.writeHead(405).end();
 if(u.pathname==='/qa'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
 if(u.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(u.pathname==='/qa-data'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({cards,payload:payload(u.searchParams.get('interactive')==='1')}));}
 if(u.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end('{"ok":true,"items":[],"enabled":false}');}
 let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(!fs.existsSync(file))return res.writeHead(404).end();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 const cases=reproduce?[[1440,1000,true]]:production?[[390,844,true]]:[[1440,1000,true],[390,844,true],[1440,1000,false]];
 for(const [width,height,interactive]of cases){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),warnings=[],errors=[];
  if(production)await page.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{
   const u=new URL(route.request().url());if(u.pathname.startsWith('/qa')||u.pathname.startsWith('/api/'))return route.continue();
   const response=await route.fetch({url:'https://cnine-card.pages.dev'+u.pathname+u.search});assert(response.ok(),u.pathname);return route.fulfill({response});
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='warning'&&msg.text().includes('[PROJECT V V3]'))warnings.push(msg.text());});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa?interactive='+Number(interactive));
  await page.waitForFunction(()=>window.LeonelBossQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(()=>LeonelBossQA.start());
  if(!reproduce){await page.waitForFunction(()=>LeonelBossQA.pressureSeen||LeonelBossQA.done,null,{timeout:20000});await page.screenshot({path:path.join(out,(production?'production-':'')+width+'-'+interactive+'-pressure.png')});}
  await page.waitForFunction(()=>LeonelBossQA.done,null,{timeout:45000});
  const result=await page.evaluate(()=>{const q=LeonelBossQA;return {error:q.error,result:q.result,elapsed:q.elapsed,pressureSeen:q.pressureSeen,hpCalls:q.hpCalls,completed:q.completed,casts:q.casts,last:q.engine.lastMercenaryPlayback,activeBossFx:!!q.engine.activeSahyeonFX,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  reports.push({width,interactive,...result,warnings,errors});fs.writeFileSync(path.join(out,reproduce?'reproduction.json':production?'production-browser.json':'browser.json'),JSON.stringify({accountWrites:0,productionAssets:production,serverBossSkills:boss.map(e=>e.skillCode),reports},null,2)+'\n');
  console.log(JSON.stringify({width,interactive,pressureSeen:result.pressureSeen,casts:result.casts.length,elapsed:Math.round(result.elapsed),warnings,errors,error:result.error}));
  assert.deepEqual(errors,[]);assert.equal(result.overflow,false);
  if(reproduce){assert.match(result.error,/검극/);assert.equal(result.casts.length,0);assert.equal(result.pressureSeen,false);assert(warnings.length);}
  else{
   assert.equal(result.error,undefined);assert.deepEqual(warnings,[]);assert.equal(result.pressureSeen,true);assert.equal(result.activeBossFx,false);
   assert.deepEqual(result.completed,timeline.map(e=>e.type));assert.deepEqual(result.casts.map(c=>c.kind),['seal','curse','ultimate']);assert(result.casts.every(c=>c.impacts===1));
   assert.equal(result.last.damageApplications,area.hits.length);assert.equal(result.last.mode,'ultimate');
   assert.equal(result.casts[2].damage,boss[2].hits.reduce((sum,h)=>sum+h.damage,0));
   for(const hit of area.hits){
    const expected=100*hit.targetHpAfter/hit.targetMaxHp;
    const calls=result.hpCalls.filter(c=>c.id===hit.targetId);
    assert.equal(calls.length,1,'one HP application per Leonel target');assert(Math.abs(calls[0].hp-expected)<1e-8,'the HUD percentage matches the server HP');
   }
  }
  await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
