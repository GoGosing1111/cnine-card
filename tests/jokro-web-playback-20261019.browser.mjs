import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.JOKRO_WEB_QA_OUTPUT||path.join(root,'docs/qa/jokro-web-playback-20261019');
const reproduce=process.argv.includes('--reproduce'),production=process.argv.includes('--production');fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p))).characters);
const cards=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {id,cardId:id,name:c.member,image:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const monster={id:1,battle_power:1.6e10},mercenary={...limitedDeploymentSnapshot('V-979'),combat:fixture.combat};
const battle=createPveBattleV2({cards,mercenary,monster,seed:77});
const area=battle.result.timeline.find(e=>e.type==='MERCENARY_JOKRO_AREA');assert(area);assert(!area.combatClock);
const basic=battle.result.timeline.find(e=>e.type==='TURN'&&e.actorId===area.actorId&&e.damage>0);assert(basic);
const cast=battle.result.timeline.filter(e=>e.actorId===area.actorId&&e.skillId==='MS-979').slice(0,3);assert(cast.includes(area));
const payload=(mode,kind)=>({mode,battlefieldMode:mode,monster,battleV2:{...battle,result:{timeline:kind==='basic'?[basic]:cast}}});
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const params=new URLSearchParams(location.search),mode=params.get('mode'),kind=params.get('kind'),data=await fetch('/qa-data?mode='+mode+'&kind='+kind).then(r=>r.json());window.cnineCardCatalog=()=>data.cards;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode});
 const q=window.JokroWebQA={hpCalls:[],damageCalls:[],splitSeen:false,mode,kind};
 q.renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,mode,data:data.payload,afterDeployment(){
   engine.jokroStates.get(engine.mercenaries[0]).basicCount=2;
 }});api.mountForBattle=mount;q.engine=engine;
 const hp=engine.syncTargetHp.bind(engine);engine.syncTargetHp=(t,v)=>{q.hpCalls.push({id:t.id,hp:v});return hp(t,v);};
 const damage=engine.showAccountBattleUnitDamage.bind(engine);engine.showAccountBattleUnitDamage=(t,v)=>{q.damageCalls.push({id:t.id,...v});return damage(t,v);};
 const fx=engine.jokroStates.get(engine.mercenaries[0]).fx,render=fx.render.bind(fx);
 fx.render=t=>{render(t);if(fx.awakening.splitVisible)q.splitSeen=true;};
 q.start=()=>{q.started=performance.now();q.promise=q.renderer.play().then(value=>{q.result=value;},e=>{q.error=e.stack;}).finally(()=>{q.elapsed=performance.now()-q.started;q.done=true;});};q.ready=true;
}catch(error){window.qaError=error.stack;}});`;
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const html=baseHtml.replace('<script defer src="preview.bundle.js"></script>','<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script defer src="/qa-boot.js"></script>').replace(/<body>[\s\S]*<\/body>/,'<body><main id="lab-modal"></main></body>');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET')return res.writeHead(405).end();
 if(u.pathname==='/qa'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
 if(u.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(u.pathname==='/qa-data'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({cards,payload:payload(u.searchParams.get('mode'),u.searchParams.get('kind'))}));}
 if(u.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end('{"ok":true,"items":[],"enabled":false}');}
 let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(!fs.existsSync(file))return res.writeHead(404).end();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[];
try{
 const cases=reproduce?[['desktop',1440,1000,'PVE','area']]:production?[['desktop',1440,1000,'RAID','area']]:[['desktop',1440,1000,'PVE','area'],['desktop',1440,1000,'RAID','area'],['mobile',390,844,'PVE','area'],['mobile',390,844,'RAID','area'],['desktop',1440,1000,'PVE','basic']];
 for(const [label,width,height,mode,kind]of cases){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),warnings=[],errors=[];
  if(production)await page.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{
   const u=new URL(route.request().url());if(u.pathname.startsWith('/qa')||u.pathname.startsWith('/api/'))return route.continue();
   const response=await route.fetch({url:'https://cnine-card.pages.dev'+u.pathname+u.search});assert(response.ok(),u.pathname);return route.fulfill({response});
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='warning'&&msg.text().includes('[PROJECT V V3]'))warnings.push(msg.text());});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa?mode='+mode+'&kind='+kind);
  await page.waitForFunction(()=>window.JokroWebQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(()=>JokroWebQA.start());
  if(!reproduce&&kind==='area'){
   await page.waitForFunction(()=>JokroWebQA.splitSeen||JokroWebQA.done,null,{timeout:20000});
   await page.screenshot({path:path.join(out,(production?'production-':'')+label+'-'+mode+'-cleave.png')});
  }
  await page.waitForFunction(()=>JokroWebQA.done,null,{timeout:25000});
  const result=await page.evaluate(()=>{const q=JokroWebQA;return {error:q.error,result:q.result,elapsed:q.elapsed,splitSeen:q.splitSeen,hpCalls:q.hpCalls,damageCalls:q.damageCalls,last:q.engine.lastMercenaryPlayback,overflow:document.documentElement.scrollWidth>innerWidth+1,status:document.querySelector('#pvBattleStatus')?.textContent};});
  reports.push({label,mode,kind,...result,warnings,errors});fs.writeFileSync(path.join(out,reproduce?'reproduction.json':production?'production-browser.json':'browser.json'),JSON.stringify({accountWrites:0,productionAssets:production,reports},null,2)+'\n');
  console.log(JSON.stringify({label,mode,kind,splitSeen:result.splitSeen,hpCalls:result.hpCalls.length,elapsed:Math.round(result.elapsed),warnings,errors,error:result.error}));
  assert.equal(result.error,undefined);assert.deepEqual(errors,[]);assert.equal(result.overflow,false);
  if(reproduce){assert.equal(result.hpCalls.length,0);assert.equal(result.splitSeen,false);assert(warnings.some(w=>w.includes('청룡단천')));}
  else{assert.deepEqual(warnings,[]);assert.equal(result.hpCalls.length,1);assert.equal(result.damageCalls.length,1);assert.equal(result.last.damageApplications,1);assert.equal(result.last.mode,kind==='area'?'awakening':'skill');if(kind==='area')assert(result.splitSeen);}
  await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
