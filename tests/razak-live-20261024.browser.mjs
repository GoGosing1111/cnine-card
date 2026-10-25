// Read-only fixtures through the current production battle, codex and pack UI.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {razakDeploymentSnapshot,RAZAK_SKILLS} from '../shared/mercenary-razak-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {bloodmoonPackState} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),publicBase=process.env.QA_PUBLIC_BASE||'',out=process.env.QA_OUT||path.join(root,'docs/qa/razak-live-20261024');fs.mkdirSync(out,{recursive:true});
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
const snapshot={...razakDeploymentSnapshot(),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary:snapshot,accountNickname:'라자크'},seed:7919,limitMs:15000});
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const enemy={...snapshot,id:'B:MERCENARY:V-058',cardId:'V-058',hp:100,maxHp:100,shield:0,maxShield:0};
const enemyPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck,mercenaries:[enemy]}},result:{timeline:[]}}};
const catalog=publicBase?JSON.parse((await publicFile('/api/mercenary-codex')).bytes):mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
assert(catalog.cards.some(card=>card.code==='V-058'));
const mainHtml=publicBase?(await publicFile('/')).bytes.toString():fs.readFileSync(root+'/index.html','utf8');
const pack={revision:1,...bloodmoonPackState()};
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode');
 if(window.ensureFeatureResources){await window.ensureFeatureResources('battleV2');if(mode!=='enemy')await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/preview/sustained-hunt-v2/battle.bundle.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
 if(!document.getElementById('modal'))document.getElementById('app').insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');
 const data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('modal'),field=mode==='enemy'?'PVP':'HUNT',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'라자크',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'라자크'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;document.querySelector('#app .login-wrap')?.remove();
 window.RazakQA={engine,renderer,skills:data.skills,ready:true};
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  const bundle=mode==='enemy'?'/preview/project-v-v3/project-v-pixi-battle.bundle.js':'/preview/sustained-hunt-v2/battle.bundle.js';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(mainHtml.replace('<head>','<head><base href="/">').replace('</body>',`<script defer src="${bundle}"></script><script defer src="/qa-boot.js"></script></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:mode==='enemy'?enemyPayload:areaPayload,skills:RAZAK_SKILLS});
 if(url.pathname==='/api/mercenary-codex')return json(res,catalog);
 if(url.pathname==='/api/mercenaries/v3/bloodmoon-pack/feature')return json(res,pack);
 // A fake QA identity has no sync websocket. Keep its credential/client stable
 // while public modules download, instead of advancing a fictitious epoch.
 if(url.pathname.startsWith('/api/sync/'))return json(res,{error:'Read-only QA identity has no sync session'},401);
 if(url.pathname==='/api/mercenaries/v3/state'){const empty={mercenaryCode:null,revision:0};return json(res,{accountId:7,cards:[],available:true,coin:'0',loadout:empty,loadouts:{PVE:empty,PVP:empty},leveling:{enabled:true},deployment:{enabled:true}});}
 if(url.pathname.startsWith('/api/'))return json(res,{items:[],visible:false,enabled:false});
 if(publicBase){const file=await publicFile(url.pathname+url.search);res.writeHead(200,{'content-type':file.type,'cache-control':'no-store'});return res.end(file.bytes);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){missing.push(url.pathname);res.writeHead(404);return res.end('not found');}if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){errors.push(e.stack);json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport,mode]of (process.env.QA_CODEX_ONLY?[]:[['desktop',{width:1440,height:1000},'hunt'],['mobile',{width:390,height:844},'hunt'],['enemy',{width:1440,height:1000},'enemy']])){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.stack));
  await page.goto(base+'/qa/battle?mode='+mode,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.qaError||window.RazakQA?.engine?.razakStates?.size,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  const setup=await page.evaluate(()=>{const e=RazakQA.engine,s=[...e.razakStates.values()][0];window.ns=s;return {allies:e.allies.length,enemies:e.enemies.length,mercenaries:e.mercenaries.length,canvas:document.querySelectorAll('.v3-battle-canvas canvas').length,facing:s.actor.view.scale.x,body:s.fx.diagnostics()};});
  assert.equal(setup.allies,5);assert.equal(setup.enemies,mode==='enemy'?5:12);assert.equal(setup.mercenaries,1);assert.equal(setup.body.bodyRegistration.renderedBodyReference,285);assert.equal(setup.body.idleControllerTimeline,false);if(mode==='enemy')assert(setup.facing<0);
  const before=await page.evaluate(()=>({x:ns.actor.root.x,y:ns.actor.root.y,texture:ns.actor.fullBodySprite.texture.uid}));await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>({x:ns.actor.root.x,y:ns.actor.root.y,texture:ns.actor.fullBodySprite.texture.uid})),before);
  await page.screenshot({path:path.join(out,label+'-battle-idle.png')});
  const outcomes=[];
  for(const skill of RAZAK_SKILLS){
   const result=await page.evaluate(async skill=>{
    const e=RazakQA.engine,targets=(ns.actor.team==='ENEMY'?e.allies:e.enemies).slice(0,skill.targetCount??Infinity);
    const event={type:'MERCENARY_RAZAK_ASSASSINATION',actorId:ns.actor.id,skillId:skill.id,visualMode:skill.visualMode,battleMode:'PVE',hits:targets.map(t=>({targetId:t.id,damage:10,absorbed:0,targetHpAfter:t.serverMaxHp*.9,targetMaxHp:t.serverMaxHp,targetShieldAfter:0,targetMaxShield:0}))};
    const original=e.syncTargetHp,applied=[];e.syncTargetHp=function(t,v){applied.push(t.id);return original.call(this,t,v);};
    const begin=performance.now();await e.playMercenaryEvent(event);e.syncTargetHp=original;
    return {elapsedMs:performance.now()-begin,last:e.lastMercenaryPlayback,applied,targets:targets.length,diagnostics:ns.fx.diagnostics()};
   },skill);
   assert.equal(result.last.code,'V-058');assert.equal(result.last.mode,skill.visualMode);assert.equal(result.last.damageApplications,result.targets);assert.equal(new Set(result.applied).size,result.targets);assert.equal(result.applied.length,result.targets);assert.equal(result.diagnostics.activeEffects,0);assert.equal(result.diagnostics.mode,'idle');outcomes.push(result);
   await page.evaluate(skill=>{const e=RazakQA.engine,targets=(ns.actor.team==='ENEMY'?e.allies:e.enemies).slice(0,skill.targetCount??Infinity);ns.fx.begin(skill.visualMode,targets);ns.fx.render(skill.visualMode==='eclipse'?1.15:skill.visualMode==='flurry'?1.17:.68);},skill);
   await page.screenshot({path:path.join(out,label+'-battle-'+skill.visualMode+'.png')});await page.evaluate(()=>ns.fx.cancel());
  }
  const basic=await page.evaluate(async()=>{const e=RazakQA.engine,t=(ns.actor.team==='ENEMY'?e.allies:e.enemies)[0];let count=0;await e.normalAttack(0,{attacker:ns.actor,target:t,damage:1,targetHp:80,onImpact:()=>count++});return {count,last:e.lastMercenaryPlayback};});assert.equal(basic.count,1);assert.equal(basic.last.eventType,'ATTACK');
  const lifecycle=await page.evaluate(async()=>{
   const e=RazakQA.engine,actor=ns.actor,targets=actor.team==='ENEMY'?e.allies:e.enemies;
   ns.fx.begin('eclipse',targets);ns.fx.render(1.15);e.cancelTimelines();const stopped=ns.fx.diagnostics();
   actor.setHp(0);const dead={effects:ns.fx.layer.children.some(c=>c.visible),ghosts:ns.fx.ghosts.some(g=>g.holder.visible)};actor.setHp(100);await e.setVisible(false);await e.setVisible(true);const revived=ns.fx.diagnostics();
   e.reducedMotion=true;await e.normalAttack(0,{attacker:actor,target:targets[0],damage:1,targetHp:70});e.reducedMotion=false;
   // The regular damage-number tail outlives the reduced-motion body sequence.
   const deadline=performance.now()+2000;while(e.simpleTimelines.size&&performance.now()<deadline)await new Promise(r=>setTimeout(r,25));
   return {stopped,dead,revived,timelines:e.simpleTimelines.size};
  });assert.equal(lifecycle.stopped.activeEffects,0);assert.equal(lifecycle.dead.effects,false);assert.equal(lifecycle.revived.mode,'idle');assert.equal(lifecycle.timelines,0);
  const afterimage=await page.evaluate(()=>{const e=RazakQA.engine,targets=(ns.actor.team==='ENEMY'?e.allies:e.enemies).slice(0,1);ns.fx.begin('cross',targets);ns.fx.render(.27);const d=ns.fx.diagnostics();const signs=ns.fx.ghosts.filter(g=>g.holder.visible).map(g=>g.sprite.scale.x);ns.fx.cancel();return{d,signs};});assert(afterimage.d.afterimages>0);if(mode==='enemy')assert(afterimage.signs.every(s=>s<0));
  checks.push({label,mode,setup,outcomes,basic,lifecycle,afterimage});console.log(label+' battle PASS');await page.evaluate(()=>RazakQA.renderer.dispose?.());await page.close();
 }
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.stack));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-read-only-qa');localStorage.setItem('cnine_player_client_id_v1552','razak-readonly-qa-client');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'검수'}));});
  await page.goto(base+'/mercenary-codex/?view=all&q='+encodeURIComponent('라자크'),{waitUntil:'networkidle'});const entry=page.locator('[data-code="V-058"]');await entry.waitFor({state:'visible'});await entry.click();
  assert.equal(await page.locator('.stage-heading h2').innerText(),'라자크');await page.locator('#portraitDisplay img').first().evaluate(i=>i.decode());await page.screenshot({path:path.join(out,label+'-codex-art.png'),fullPage:true});
  await page.locator('.combat-details > summary').click();const panel=await page.locator('.combat-panel').innerText();assert.match(panel,/1,000,000/);assert.match(panel,/3,200%/);assert.match(panel,/80%/);assert.match(await page.locator('.deployment-card').innerText(),/블러드문팩/);assert.equal(await page.locator('.deployment-card a[href*=buy]').count(),1);assert.equal(await page.locator('.skill-list > *').count(),3);
  await page.locator('#sdTab').click();assert.equal(await page.locator('#portraitDisplay svg image').getAttribute('href'),'/'+catalog.cards.find(c=>c.code==='V-058').battleSprite);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,label+'-codex-sd.png'),fullPage:true});
  checks.push({label,codex:true,name:'라자크',skills:3,basePower:1000000});console.log(label+' codex PASS');await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASS',publicBase,publicFiles:publicFiles.size,checks,errors,missing},null,2)+'\n');console.log(JSON.stringify({status:'PASS',publicBase,publicFiles:publicFiles.size,checks:checks.length,out}));
}catch(e){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({message:e.stack,checks,errors,missing},null,2)+'\n');throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
