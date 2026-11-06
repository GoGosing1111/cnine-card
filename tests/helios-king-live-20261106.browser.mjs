import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const field=process.env.QA_FIELD||'PVP';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/helios-king-live-20261106'),reproduce=process.env.QA_REPRODUCE==='1',publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const payload=code=>{const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};if(field==='HUNT')return createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'헬리오스 킹 검수'},seed:7919,limitMs:15000}).payload;return {battleV2:createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:77})};};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],publicFiles=new Map();const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/api/mercenary-codex'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})));}
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){try{const rel=path.relative(root,file).replaceAll('\\','/');const bytes=execFileSync('git',['show','HEAD:'+rel],{cwd:root,windowsHide:true,maxBuffer:64e6,stdio:['ignore','pipe','ignore']});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(bytes);}catch{}}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of (process.env.QA_WIDTHS?.split(',').map(Number)||(publicBase?[390]:[1440,390]))){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('헬리오스'))console.log(m.text());});
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/?screen=pvp',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'전투 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');await ensureFeatureResources('battleV2');if(!document.getElementById('modal'))document.body.insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');document.querySelector('[data-miracle-close]')?.click();});
  if(field==='HUNT')await page.addScriptTag({url:base+'/preview/sustained-hunt-v2/battle.bundle.js'});
  assert.match(await page.evaluate(()=>ProjectVPixiBattle.runtimeVersion),/helios-king-live-20261106-v1$/);
  const data=payload('V-966');
  await page.evaluate(async({data,deck,field})=>{
   window.cnineCardCatalog=()=>deck;const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
   api.mountForBattle=async(...args)=>(engine=await original(...args));
   try{const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'헬리오스 킹 검수',opponentName:'검수 상대'});
    const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode:field,playerName:'헬리오스 킹 검수'});
    await engine.deployCards({instant:true,force:true});window.bc={engine,renderer};
   }finally{api.mountForBattle=original;}
  },{data,deck,field});
  await page.waitForFunction(count=>bc.engine.heliosKingStates?.size===count,field==='HUNT'?1:2,{timeout:45000});
  const setup=await page.evaluate(()=>({canvas:document.querySelectorAll('#modal canvas').length,states:[...bc.engine.heliosKingStates.values()].map(s=>({id:s.actor.id,team:s.actor.team,facing:s.actor.view.scale.x,autoUpdate:s.adapter.rig.autoUpdate,aura:s.adapter.aura.audit(),bodyVisible:s.actor.fullBodySprite.visible}))}));
  assert.equal(setup.canvas,1);for(const s of setup.states){assert.equal(s.autoUpdate,false);assert.equal(s.bodyVisible,false);assert.equal(s.aura.visible,true);assert.equal(s.aura.behind,true);assert.equal(s.aura.front,true);assert(s.team==='ALLY'?s.facing>0:s.facing<0);}
  await page.screenshot({path:path.join(out,field+'-'+width+'-idle.png')});
  const outcomes=[];
  for(const side of (field==='HUNT'?['ALLY']:['ALLY','ENEMY']))for(const action of ['royal_swords','sovereign_lance','kings_arsenal','heavenly_descent']){
   await page.evaluate(({side,action})=>{
    const e=bc.engine,s=[...e.heliosKingStates.values()].find(s=>s.actor.team===side),targets=side==='ALLY'?e.enemies:e.allies;
    for(const target of targets){target.setHp(100);target.setState('IDLE');}
    bc.applied=[];const original=e.syncTargetHp;e.syncTargetHp=function(t,v){bc.applied.push(t.id);return original.call(this,t,v);};
    bc.start={x:s.actor.root.x,y:s.actor.root.y};bc.actor=s.actor;bc.samples=[];
    const timer=setInterval(()=>bc.samples.push({time:s.adapter.clock.time,pose:s.adapter.rig.skeleton.slots[0].appliedPose.attachment?.name,active:s.adapter.activeFx?[...s.adapter.activeFx.layers.values()].filter(r=>r.sprite.visible).length:0}),20);
    const options={attacker:s.actor,target:targets[0],damage:10,targetHp:90};
    if(action==='royal_swords'||action==='sovereign_lance')s.basicCount=action==='royal_swords'?0:1;
    const work=action==='royal_swords'||action==='sovereign_lance'?e.normalAttack(0,options):e.playMercenaryEvent({type:'MERCENARY_HELIOS_KING_AREA',battleMode:'PVE',actorId:s.actor.id,skillId:action==='kings_arsenal'?'MS-907':'MS-908',visualMode:action,hits:targets.map(t=>({targetId:t.id,damage:10,absorbed:0,targetHpAfter:t.serverMaxHp*.9,targetMaxHp:t.serverMaxHp,targetShieldAfter:0,targetMaxShield:0}))});
    bc.work=Promise.resolve(work).finally(()=>{clearInterval(timer);e.syncTargetHp=original;});
   },{side,action});
   await page.waitForTimeout(action==='heavenly_descent'?1400:action==='kings_arsenal'?1100:650);
   await page.screenshot({path:path.join(out,`${field}-${width}-${side}-${action}.png`)});
   const result=await page.evaluate(async()=>{await bc.work;const e=bc.engine,s=e.heliosKingStates.get(bc.actor);return {last:e.lastMercenaryPlayback,applied:bc.applied,samples:bc.samples,home:bc.start,end:{x:s.actor.root.x,y:s.actor.root.y},busy:s.adapter.busy,effect:s.adapter.activeFx?{disposed:s.adapter.activeFx.disposed}:null,pose:s.adapter.entry.animation.name};});
   assert.equal(result.last.code,'V-966');assert.equal(result.last.mode,action);assert.equal(result.last.spineAutoUpdate,false);assert.equal(result.last.clockOwner,'V3_REGISTERED_GSAP');
   const count=action==='royal_swords'||action==='sovereign_lance'?1:field==='HUNT'?12:5;assert.equal(result.applied.length,count);assert.equal(new Set(result.applied).size,count);assert.equal(result.last.damageApplications,count);
   assert.deepEqual(result.home,result.end);assert.equal(result.busy,false);assert.equal(result.effect,null);assert.equal(result.pose,'idle');assert(result.samples.some(s=>s.active>0));assert(new Set(result.samples.map(s=>s.pose)).size>=2);outcomes.push({side,action,...result});
  }
  const lifecycle=await page.evaluate(async()=>{const e=bc.engine,s=[...e.heliosKingStates.values()][0];
   s.actor.setHp(0);const dead=s.adapter.aura.audit().visible;s.actor.setHp(100);const revived=s.adapter.aura.audit().visible;
   const t=e.enemies[0];t.setHp(100);let impacts=0;const p=e.normalAttack(0,{attacker:s.actor,target:t,damage:1,targetHp:80,onImpact:()=>impacts++});e.cancelTimelines();await p;
   const cancelled={impacts,busy:s.adapter.busy,effect:s.adapter.activeFx?{disposed:s.adapter.activeFx.disposed}:null,aura:s.adapter.aura.audit().visible};
   await e.setVisible(false);await e.setVisible(true);const resumed=s.adapter.aura.audit().visible;
   return {dead,revived,cancelled,resumed,loops:e.simpleTimelines.size};
  });assert.equal(lifecycle.dead,false);assert.equal(lifecycle.revived,true);assert.equal(lifecycle.cancelled.impacts,0);assert.equal(lifecycle.cancelled.effect,null);assert.equal(lifecycle.cancelled.aura,false);assert.equal(lifecycle.resumed,true);
  await page.evaluate(async()=>{bc.renderer.destroy();await ProjectVPixiBattle.whenReleased();});
  await page.goto(base+'/mercenary-codex/?view=limited&q='+encodeURIComponent('헬리오스 킹')+'&rank=SSS#V-966',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('inspection')?.textContent.includes('헬리오스 킹'),{timeout:20000});
  if(width<=760)await page.locator('.roster-row[data-code="V-966"]').click();
  await page.locator('#inspection .combat-details > summary').click();const codex=await page.locator('#inspection').innerText();
  assert(codex.includes('3,500,000'));for(const name of ['왕검 사출','천창 관통','왕의 군세','천검 강림'])assert(codex.includes(name));
  await page.screenshot({path:path.join(out,'codex-'+width+'.png'),fullPage:true});assert.deepEqual(errors,[]);
  reports.push({width,field,setup,outcomes,lifecycle,codex});console.log(width+' '+field+' PASS');await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,(publicBase?'public-':'local-')+field+'-battle.json'),JSON.stringify({ok:true,reports,productionTransactions:0},null,2));
}catch(e){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({error:e.stack,missing,reports},null,2));throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
