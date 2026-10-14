import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
// Local isolated fixtures only. No production account, economy, or CMS writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {handleWorkshop} from '../functions/_workshop.js';
import {readKaironCraft} from '../functions/_mercenary_craft.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'docs/qa/kairon-20261014');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await equipmentFixture({after:cb=>cleanup.push(cb)}),checks=[],errors=[];
await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-988'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'카이론'},seed:7919,limitMs:15000});
const areaEvent=hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_KAIRON_AREA'&&e.hits.length===12);assert(areaEvent);
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-988',cardId:'V-988',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const enemyPayload=structuredClone(pvpPayload);enemyPayload.battleV2.teams.A.mercenaries=[];enemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-988'}];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),field=mode==='area'?'HUNT':'PVP',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'카이론',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'카이론'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 window.KaironQA={engine,renderer,event:data.event,mode,ready:true};document.getElementById('health').textContent='실제 V3 전투 연결 완료';
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode==='area'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>SSS LIMITED · CRAFT EXCLUSIVE</small><h1>카이론 · ${mode==='area'?'양자 탄도 폭쇄':'쌍우지 일제사격'}</h1><p>진무 동일 밸런스 · 제작 조건 미입력 잠금</p></header><nav class="toolbar"><span id="health">V3 전장 연결 중</span></nav><main id="lab-modal"></main></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode==='area'?areaPayload:mode==='enemy'?enemyPayload:pvpPayload,event:mode==='area'?areaEvent:null});
 if(url.pathname==='/qa/cms'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"><style>body{display:block;padding:20px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">격리 CMS 검수</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7');</script><script src="/admin/workshop-admin-v1668.js"></script></html>`);
 }
 if(url.pathname==='/qa/workshop'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}button{font-family:inherit}#modal{display:none}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-account-7');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser());bindWorkshopView();</script></html>`);
 }
 if(url.pathname==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}));
 if(url.pathname==='/api/mercenaries/v3/state')return json(res,{accountId:7,available:true,cards:[],loadouts:{PVE:{mercenaryCode:null,revision:0},PVP:{mercenaryCode:null,revision:0}}});
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
  const response=await handleWorkshop({path:url.pathname.slice(5),request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
  if(response){res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());}return json(res,{items:[],visible:false,enabled:false});
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  if(process.argv.includes('--catalog')){const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/mercenary-codex/?view=limited#V-988');await page.locator('.limited-edition-mark h3').filter({hasText:'카이론'}).waitFor();const text=await page.locator('.combat-panel').innerText();assert(text.includes('제작 전용 · 팩 획득 불가'));assert(!text.includes('리미티드 용병팩 출시는'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,label+'-codex.png'),fullPage:true});checks.push({label,codexCraftOnly:true,overflow:false});await page.close();continue;}
  await f.p("DELETE FROM app_meta WHERE key='mercenary_kairon_craft_v1'").run();
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/qa/cms');await page.locator('[data-view="workshop"]').click();await page.locator('#workshopAdminKairon').click();await page.locator('#kaironCoin').waitFor({timeout:10000}).catch(async e=>{console.error((await page.locator('body').innerText()).slice(0,3500));throw e;});
  for(const id of ['kaironCoin','kaironStars','kaironRate'])assert.equal(await page.locator('#'+id).inputValue(),'');
  assert.equal(await page.locator('#kaironActive').isChecked(),false);assert.equal(await page.locator('#kaironPublic').isChecked(),false);
  await page.locator('#kaironSave').click();await page.waitForFunction(()=>document.getElementById('kaironSave')&&!document.getElementById('kaironSave').disabled);
  assert.equal((await readKaironCraft(f.env)).policy.coinCost,null);
  await page.locator('#kaironCoin').fill('1234');await page.locator('#kaironSave').click();await page.waitForFunction(()=>!document.getElementById('kaironSave')?.disabled);
  await page.locator('#workshopAdminReloadV1668').click();await page.waitForFunction(()=>document.getElementById('kaironCoin')?.value==='1234');
  assert.equal(await page.locator('#kaironStars').inputValue(),'');assert.equal((await readKaironCraft(f.env)).policy.isActive,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,label+'-cms.png'),fullPage:true});
  await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="MERCENARY_CRAFT"]').click();await page.locator('.ws-kairon-forge').waitFor();
  assert.equal(await page.locator('#wsMaterialCraft').isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,label+'-workshop.png'),fullPage:true});await page.close();checks.push({label,cmsNullPersistence:true,partialStillLocked:true,playerLocked:true,overflow:false});
  for(const mode of ['basic','enemy','area']){
   const p=await browser.newPage({viewport,serviceWorkers:'block'});p.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
   await p.goto(base+'/qa/battle?mode='+mode);await p.waitForFunction(()=>window.KaironQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await p.evaluate(()=>window.qaError),undefined);
   await p.evaluate(()=>{
    const q=window.KaironQA,e=q.engine,a=e.mercenaries[0],s=e.kaironStates.get(a);q.actor=a;q.hpCalls=[];q.damageCalls=[];
    s.fx.updateAura(0);q.center0=s.fx.diagnostics().auraCenters;s.fx.updateAura(2);q.center2=s.fx.diagnostics().auraCenters;
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,d)=>{q.damageCalls.push(t.id);return show(t,d);};
    const timeline=e.timeline.bind(e),contact=(q.mode==='area'?3.25:.955)/2.6;
    e.timeline=(build,cleanup,rate,options)=>timeline(t=>{build(t);q.timeline=t;t.call(()=>{q.contact=true;t.pause();},[],contact);},cleanup,rate,options);
    q.promise=q.mode==='area'?e.playMercenaryEvent(q.event):e.normalAttack(0,{attacker:a,target:(a.team==='ALLY'?e.enemies:e.allies)[0],damage:23,targetHp:77});
    Promise.resolve(q.promise).catch(error=>q.error=error.stack);
   });
   await p.waitForFunction(()=>window.KaironQA.contact||window.KaironQA.error,null,{timeout:20000});
   const result=await p.evaluate(()=>{const q=window.KaironQA,fx=q.engine.kaironStates.get(q.actor).fx;return {error:q.error,hpCalls:q.hpCalls,damageCalls:q.damageCalls,center0:q.center0,center2:q.center2,fx:fx.diagnostics(),direction:q.actor.view.scale.x,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(result.error,undefined);assert.equal(result.overflow,false);assert.deepEqual(result.center0,result.center2);assert.equal(result.fx.rim.textureMatchesPose,true);
   assert.equal(result.hpCalls.length,mode==='area'?12:1);assert.equal(new Set(result.hpCalls.map(r=>r.id)).size,result.hpCalls.length);assert.equal(result.damageCalls.length,mode==='area'?12:1);
   assert.equal(Math.sign(result.direction),mode==='enemy'?-1:1);assert.equal(result.fx.damageAuthority,'SERVER_ONLY');
   await p.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});
   const cancelled=await p.evaluate(()=>{const q=window.KaironQA;q.engine.cancelTimelines();const s=q.engine.kaironStates.get(q.actor);return {stopped:s.stopped,ambient:!!s.ambient,pool:s.fx.pool.some(p=>p.visible),hpCalls:q.hpCalls.length};});
   assert.deepEqual(cancelled,{stopped:true,ambient:false,pool:false,hpCalls:mode==='area'?12:1});checks.push({label,mode,...result,cancelled});await p.close();
  }
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,process.argv.includes('--catalog')?'catalog-report.json':'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
