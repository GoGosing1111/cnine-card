// Read-only fixtures through the current production battle, codex and pack UI.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {bloodmoonPackState} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),publicBase=process.env.QA_PUBLIC_BASE||'',out=process.env.QA_OUT||path.join(root,'docs/qa/eunseol-bloodmoon-deployment-20261025');fs.mkdirSync(out,{recursive:true});
if(publicBase)assert.equal(new URL(publicBase).hostname,'cnine-card.pages.dev');
const publicFiles=new Map();
async function publicFile(url){
 const key=new URL(url,publicBase).href;
 if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const response=await fetch(key,{signal:AbortSignal.timeout(30000)});assert(response.ok,'Public file '+key+': '+response.status);return {type:response.headers.get('content-type')||'application/octet-stream',bytes:Buffer.from(await response.arrayBuffer())};})());
 return publicFiles.get(key);
}
const errors=[],missing=[],checks=[];
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const snapshots=Object.fromEntries(['V-960','V-961','V-962','V-963','V-964','V-965','V-973'].map(code=>[code,{...limitedDeploymentSnapshot(code),combat:fixture.combat}]));
function payload(code,mode){
 const snapshot=snapshots[code];
 if(mode!=='enemy'){const hunt=createHuntSession({snapshot:{cards:deck,mercenary:snapshot,accountNickname:code},seed:7919,limitMs:15000});hunt.payload.battleV2.result.timeline=[];return hunt.payload;}
 const enemy={...snapshot,id:'B:MERCENARY:'+code,cardId:code,hp:100,maxHp:100,shield:0,maxShield:0};
 return {previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck,mercenaries:[enemy]}},result:{timeline:[]}}};
}
const catalog=publicBase?JSON.parse((await publicFile('/api/mercenary-codex')).bytes):mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
assert(catalog.cards.some(card=>card.code==='V-965'));
const mainHtml=publicBase?(await publicFile('/')).bytes.toString():fs.readFileSync(root+'/index.html','utf8');
const pack={revision:1,...bloodmoonPackState(undefined,Array.from({length:6},(_,i)=>({code:'V-'+(960+i),stock_limit:10,issued:0})))};
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(window.ensureFeatureResources){await window.ensureFeatureResources('battleV2');if(mode!=='enemy')await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/preview/sustained-hunt-v2/battle.bundle.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
 if(!document.getElementById('modal'))document.getElementById('app').insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');
 const data=await fetch('/qa-data?mode='+mode+'&code='+new URLSearchParams(location.search).get('code')).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('modal'),field=mode==='enemy'?'PVP':'HUNT',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'블러드문 남수댕',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'블러드문 남수댕'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;document.querySelector('#app .login-wrap')?.remove();
 window.NamsudaengQA={engine,renderer,skills:data.skills,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  const bundle=mode==='enemy'?'/preview/project-v-v3/project-v-pixi-battle.bundle.js':'/preview/sustained-hunt-v2/battle.bundle.js';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(mainHtml.replace('<head>','<head><base href="/">').replace('</body>',`<script defer src="${bundle}"></script><script defer src="/qa-boot.js"></script></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:payload(url.searchParams.get('code'),mode)});
 if(url.pathname==='/api/mercenary-codex')return json(res,catalog);
 if(url.pathname==='/api/mercenaries/v3/bloodmoon-pack/feature')return json(res,pack);
 if(url.pathname==='/api/mercenaries/v3/state'){const empty={mercenaryCode:null,revision:0};return json(res,{accountId:7,cards:Object.values(snapshots).map(c=>({...c,totalCopies:1,level:1,canDeploy:true,deploymentModes:['PVE','PVP']})),available:true,coin:'0',loadout:empty,loadouts:{PVE:empty,PVP:empty},leveling:{enabled:true},deployment:{enabled:true}});}
 if(url.pathname.startsWith('/api/'))return json(res,{items:[],visible:false,enabled:false});
 if(publicBase){const file=await publicFile(url.pathname+url.search);res.writeHead(200,{'content-type':file.type,'cache-control':'no-store'});return res.end(file.bytes);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){missing.push(url.pathname);res.writeHead(404);return res.end('not found');}if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){errors.push(e.stack);json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport,mode]of [['desktop',{width:1440,height:1000},'hunt'],['mobile',{width:390,height:844},'hunt'],['enemy',{width:1440,height:1000},'enemy']]){
  for(const code of ['V-960','V-961','V-962','V-963','V-964']){
   const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.stack));
   await page.goto(base+'/qa/battle?mode='+mode+'&code='+code,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.qaError||window.NamsudaengQA?.engine?.bloodmoonStates?.size,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
   const setup=await page.evaluate(()=>{const e=NamsudaengQA.engine;window.bs=[...e.bloodmoonStates.values()][0];return {allies:e.allies.length,enemies:e.enemies.length,mercenaries:e.mercenaries.length,facing:bs.actor.view.scale.x,body:bs.fx.diagnostics()};});
   assert.equal(setup.allies,5);assert.equal(setup.mercenaries,1);assert.equal(setup.body.ownTimelines,0);if(mode==='enemy')assert(setup.facing<0);
   const before=await page.evaluate(()=>({x:bs.actor.root.x,y:bs.actor.root.y,texture:bs.actor.fullBodySprite.texture.uid}));await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>({x:bs.actor.root.x,y:bs.actor.root.y,texture:bs.actor.fullBodySprite.texture.uid})),before);
   const outcome=await page.evaluate(async()=>{
    const e=NamsudaengQA.engine,t=(bs.actor.team==='ENEMY'?e.allies:e.enemies)[0],original=e.syncTargetHp;let applied=0;e.syncTargetHp=function(...args){applied++;return original.apply(this,args);};
    await e.playMercenaryEvent({type:'MERCENARY_HIT',actorId:bs.actor.id,skillId:'MS-'+bs.actor.cardId.slice(2),targetId:t.id,damage:10,targetHpAfter:t.serverMaxHp*.9,targetMaxHp:t.serverMaxHp,targetShieldAfter:0});e.syncTargetHp=original;
    const skill={applied,last:e.lastMercenaryPlayback};let impact=0;await e.normalAttack(0,{attacker:bs.actor,target:t,damage:1,targetHp:80,onImpact:()=>impact++});
    bs.fx.begin('skill',[t]);bs.fx.render(bs.fx.plan.contact);return {skill,impact,basic:e.lastMercenaryPlayback,fx:bs.fx.diagnostics()};
   });
   assert.equal(outcome.skill.applied,1);assert.equal(outcome.skill.last.damageApplications,1);assert.equal(outcome.impact,1);assert.equal(outcome.basic.eventType,'ATTACK');assert(outcome.fx.visibleEffects>0);
   await page.screenshot({path:path.join(out,label+'-'+code+'-battle.png')});
   const life=await page.evaluate(async()=>{const e=NamsudaengQA.engine;e.cancelTimelines();const stopped=bs.fx.pool.every(s=>!s.visible);bs.actor.setHp(0);const dead=bs.fx.pool.every(s=>!s.visible);bs.actor.setHp(100);await e.setVisible(false);await e.setVisible(true);return {stopped,dead,timelines:bs.fx.diagnostics().ownTimelines};});assert.deepEqual(life,{stopped:true,dead:true,timelines:0});
   checks.push({label,code,setup,outcome,life});console.log(label+' '+code+' PASS');await page.evaluate(()=>NamsudaengQA.renderer.dispose?.());await page.close();
  }
 }
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.stack));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-read-only-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'검수'}));});
  for(const code of Object.keys(snapshots)){
   const card=catalog.cards.find(c=>c.code===code);await page.goto(base+'/mercenary-codex/?view=limited&q='+encodeURIComponent(card.name),{waitUntil:'networkidle'});
   const entry=page.locator('[data-code="'+code+'"]');await entry.waitFor({state:'visible'});await entry.click();
   for(const mode of ['PVE','PVP']){const button=page.locator('[data-equip="'+code+'"][data-deploy-mode="'+mode+'"]');await button.waitFor({state:'visible'});assert(await button.isEnabled());}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.screenshot({path:path.join(out,label+'-'+code+'-codex.png'),fullPage:true});checks.push({label,code,codex:true,bothModesEnabled:true});
  }await page.close();console.log(label+' codex 7 PASS');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASS',publicBase,publicFiles:publicFiles.size,checks,errors,missing},null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks:checks.length,out}));
}catch(e){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({message:e.stack,checks,errors,missing},null,2)+'\n');throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
