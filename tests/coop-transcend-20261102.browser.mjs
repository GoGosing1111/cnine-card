import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {mercenaryLevelDraft,MERCENARY_LEVEL_KEY} from '../shared/mercenary-level-v1.mjs';
import {fixture as tower} from './helpers/tower-expansion-20261102.mjs';
import baseline from '../docs/qa/coop-transcend-20261102/baseline.json' with {type:'json'};
import {buildCoopExpansionPlan,COOP_EXPANSION_KEYS as KEYS} from '../scripts/ops/coop-transcend-20261102.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/coop-transcend-20261102/browser');await fs.mkdir(out,{recursive:true});
const run=promisify(execFile),cache=new Map();
const assetFallback=async name=>{if(cache.has(name))return cache.get(name);let bytes=null;try{bytes=(await run('git',['show','HEAD:'+name],{cwd:root,encoding:'buffer',maxBuffer:30*1024*1024,windowsHide:true})).stdout;}catch{}cache.set(name,bytes);return bytes;};
const h=await cooperativeMiniflare({dualReview:true,assetFallback,preserveTemp:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
const pair=['V-021','V-009'],sockets=[];
const level=mercenaryLevelDraft();level.mode='ON';level.growth=tower.growth;for(const rank in level.xpPerCard)level.xpPerCard[rank]=1;level.levels.forEach(r=>r.requiredXp=1);level.milestones.forEach(r=>r.successChancePpm=1000000);
const settings=buildCoopExpansionPlan([{key:KEYS[0],value:JSON.stringify({mode:'ON',revision:baseline.revision,testUserIds:[],encounterVersion:3,combat:baseline.combat,rewards:baseline.rewards})},{key:KEYS[1],value:JSON.stringify(baseline.reveal)}]).settings;
// A small NORMAL encounter shortens browser transport/return checks. The
// TRANSCEND profile and growth stats are the actual prepared fixed values.
settings.combat.difficulties[0].monsters.forEach(m=>Object.assign(m,{power:1000,hpPercent:100,shieldPercent:0}));
const put=(key,value)=>h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:[key,JSON.stringify(value)]}]);
const base=(await fs.readFile(path.join(root,'preview/mercenary-golden-dragon-battle-v1/battle.html'),'utf8')).replace(/\.\/preview\.bundle\.js[^\"]*/,'/preview/project-v-v3/project-v-pixi-battle.bundle.js');
const html=base.replace(/<body>[\s\S]*<\/body>/,'<body style="background:#081621;margin:0"><main id="qa" style="max-width:1240px;margin:auto"></main></body>');
async function open(width){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER_ERROR '+e.message);});await page.context().grantPermissions(['local-network-access'],{origin:h.origin});
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==h.origin)return route.abort();return url.pathname==='/transcend-qa'?route.fulfill({contentType:'text/html',body:html}):route.continue();});
 await page.goto(h.origin+'/transcend-qa');
 await page.evaluate(async()=>{window.cnineCardCatalog=()=>[];localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_battle_sound','OFF');window.CNineCoreRaidBridge={ensureFeatureResources:async()=>{}};window.qaLobby=await (await import('/raid/cooperative/live.mjs')).mountCooperative(document.getElementById('qa'));});
 return {page,errors};
}
try{
 await h.db.exec('CREATE TABLE user_mercenary_levels_v1(user_id INTEGER,mercenary_code TEXT,level INTEGER,experience INTEGER,breakthrough_mask INTEGER,revision INTEGER,updated_at TEXT,PRIMARY KEY(user_id,mercenary_code));');
 for(const id of [1,2])for(const code of pair)await h.db.batch([{sql:'INSERT INTO user_mercenary_cards_v1 SELECT ?,?,1,0 WHERE NOT EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?)',args:[id,code,id,code]},{sql:'INSERT INTO user_mercenary_levels_v1 VALUES(?,?,20,0,15,1,?)',args:[id,code,new Date().toISOString()]}]);
 for(const code of ['PET_SEAL_ORB','PET_POTENTIAL_POTION'])await h.db.batch([{sql:'INSERT INTO inventory_items VALUES(?,?,?,?,1)',args:[code,code,'NORMAL','']}]);
 await put(KEYS[0],settings);await put(MERCENARY_LEVEL_KEY,level);
 assert.equal((await h.request(1,'feature')).rules.mercenariesPerPlayer,2);
 assert.equal((await h.request(0,'favorites',{kind:'card',id:'CN-TEST',favorite:true})).status,401);
 assert.equal((await h.request(1,'favorites',{kind:'mercenary',id:'V-000',favorite:true})).status,403);
 for(const width of [1440,390]){
  const {page,errors}=await open(width);let roomId,companion;
  const idle=()=>page.waitForFunction(()=>!document.querySelector('#qa').classList.contains('is-busy'));
  const click=async selector=>{await page.locator(selector).click();await idle();};
  await page.locator('[data-difficulty="TRANSCEND"]').waitFor();assert.match(await page.locator('[data-difficulty="TRANSCEND"]').innerText(),/극한 보상 ×2/);
  await page.screenshot({path:path.join(out,`entry-${width}.png`),fullPage:true});
  if(width===1440)await click('[data-difficulty="TRANSCEND"]');
  await click('[data-create]');await page.locator('[data-room]').waitFor({state:'visible'});roomId=(await h.request(1,'current')).state.id;
  for(const code of pair){
   const star=page.locator(`[data-favorite="${code}"]`);await star.click();await page.waitForFunction(code=>document.querySelector(`[data-favorite="${code}"]`)?.getAttribute('aria-pressed')==='true',code);
  }
  assert.equal(await page.locator('[data-merc-count]').innerText(),'0/2','star must not select mercenary');
  await click('[data-favorites-only]');assert.equal(await page.locator('[data-choice]').count(),2);
  for(const code of pair)await click(`[data-choice="${code}"]`);
  await click('[data-picker="card"]');await click('[data-favorites-only]');
  const cards=(await h.request(1,'options')).cards.filter(c=>c.grade!=='SUPERSTAR').slice(0,2).map(c=>c.id);
  for(const id of cards){await page.locator(`[data-favorite="${id}"]`).click();await page.waitForFunction(id=>document.querySelector(`[data-favorite="${id}"]`)?.getAttribute('aria-pressed')==='true',id);}
  await click('[data-favorites-only]');assert.equal(await page.locator('[data-choice]').count(),2);for(const id of cards)await click(`[data-choice="${id}"]`);
  const fav=(await h.request(1,'options')).favorites;assert.deepEqual(fav.mercenaries.sort(),pair.toSorted());assert.deepEqual(fav.cards.sort(),cards.toSorted());
  assert.deepEqual((await h.request(2,'options')).favorites,{cards:[],mercenaries:[]});
  // Leave and reopen: favorites return from the account API in the next room.
  await click('[data-leave]');await page.locator('[data-entry]').waitFor({state:'visible'});await page.evaluate(()=>window.qaLobby.destroy());await page.evaluate(async()=>window.qaLobby=await (await import('/raid/cooperative/live.mjs')).mountCooperative(document.getElementById('qa')));
  if(width===1440)await click('[data-difficulty=TRANSCEND]');await click('[data-create]');await page.locator('[data-room]').waitFor({state:'visible'});roomId=(await h.request(1,'current')).state.id;await click('[data-favorites-only]');assert.equal(await page.locator('[data-choice]').count(),2);for(const code of pair)await click('[data-choice="'+code+'"]');await click('[data-picker=card]');for(const id of cards)await click('[data-choice="'+id+'"]');
  const clientId='transcend-browser-peer-'+width,command=(kind,extra={})=>h.request(2,kind,{roomId,clientId,requestId:crypto.randomUUID(),...extra});
  assert.equal((await command('join')).status,200);const ticket=await command('ticket');
  companion=new WebSocket(h.origin.replace('http:','ws:')+'/api/coop/stream?room='+roomId+'&ticket='+ticket.ticket,{origin:h.origin});sockets.push(companion);
  let peerLoaded=false;companion.on('message',raw=>{const v=JSON.parse(raw);if(v.state?.status==='LOADING'&&!peerLoaded){peerLoaded=true;companion.send(JSON.stringify({type:'loaded'}));}});await new Promise((resolve,reject)=>{companion.once('open',resolve);companion.once('error',reject);});
  const ready=await command('ready',{cardIds:cards,mercenaryCodes:pair});assert.equal(ready.status,200,JSON.stringify(ready));
  await click('[data-ready]');await page.waitForFunction(()=>!document.querySelector('[data-start]').disabled);
  assert.equal((await command('start')).status,403);await page.locator('[data-room]').screenshot({path:path.join(out,`favorites-ready-${width}.png`)});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await click('[data-start]');await page.locator('.coop-battle-portal').waitFor();
  const begun=await h.request(1,'current');assert.equal(begun.state.members.length,2);assert.equal(begun.payload.battleV2.teams.A.mercenaries.length,4);
  assert.ok(begun.payload.battleV2.teams.A.mercenaries.every(m=>m.mercenaryLevel?.level===21),JSON.stringify(begun.payload.battleV2.teams.A.mercenaries.map(m=>m.mercenaryLevel)));
  const heartbeat=setInterval(()=>companion.readyState===1&&companion.send(JSON.stringify({type:'ping'})),2000);
  try{await page.waitForFunction(()=>window.qaLobby?.diagnostics().battle&&document.querySelector('.coop-battle-notice')?.hidden,null,{timeout:60000});assert.equal(await page.locator('.coop-battle-mount canvas').count(),1);assert.equal(await page.evaluate(async()=>(await ProjectVPixiBattle.mount()).mercenaries.filter(a=>a.root.visible).length),4);await page.screenshot({path:path.join(out,`battle-${width}.png`)});await page.locator('.coop-result:not([hidden])').waitFor({timeout:195000});}finally{clearInterval(heartbeat);}
  const end=await h.request(1,'current');assert.ok(['VICTORY','DEFEAT'].includes(end.state.status));assert.equal(end.state.status,width===1440?'DEFEAT':'VICTORY');
  if(width===390)assert.equal(end.state.clearReward.coin,settings.rewards.difficulties[0].coin);
  await page.screenshot({path:path.join(out,`result-${width}.png`)});
  assert.deepEqual(errors,[]);reports.push({width,difficulty:end.state.difficulty,result:end.state.status,players:2,mercenaries:4,level:21,favorites:faceless(fav),errors});
  await page.locator('.coop-result button').last().click();await page.locator('[data-entry]').waitFor({state:'visible'});
  await command('leave');companion.terminate();await page.evaluate(()=>window.qaLobby.destroy());await page.close();
  for(const code of pair)await h.request(1,'favorites',{kind:'mercenary',id:code,favorite:false});for(const id of cards)await h.request(1,'favorites',{kind:'card',id,favorite:false});
 }
}catch(e){for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(JSON.stringify(await page.evaluate(()=>({alert:document.querySelector('[data-alert]')?.textContent,notice:document.querySelector('.coop-battle-notice')?.textContent,diagnostics:window.qaLobby?.diagnostics()}))));for(const page of browser.contexts().flatMap(c=>c.pages()))await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
finally{for(const ws of sockets)ws.terminate();await browser.close();await h.dispose();await fs.writeFile(path.join(out,'report.json'),JSON.stringify({at:new Date().toISOString(),isolatedDualReview:true,sourceDualRelease:false,temporaryFixture:h.temp,reports},null,2));console.log(JSON.stringify(reports));}
function faceless(fav){return {cards:fav.cards.length,mercenaries:fav.mercenaries.length};}
