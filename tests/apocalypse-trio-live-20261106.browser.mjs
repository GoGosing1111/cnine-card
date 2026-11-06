// Actual index.html entry buttons and shipped V3 engine; isolated SQLite rewards.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import reference from '../docs/qa/apocalypse-trio-live-20261106/reference.json' with {type:'json'};
import zenith from '../assets/ui/project-v/characters/zenith/manifest-v1.json' with {type:'json'};
import fur from '../assets/ui/project-v/characters/fur/manifest-v2.json' with {type:'json'};
import superstar from '../assets/ui/project-v/characters/superstar/manifest-v1.json' with {type:'json'};
import {BOSSES,apocalypseTrioLiveProfile} from '../shared/apocalypse-trio-v1.mjs';
import {snapshot} from './helpers/helios-king-balance-20261106.mjs';
import {createHash} from 'node:crypto';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.TRIO_QA_OUTPUT||path.join(root,'docs/qa/apocalypse-trio-live-20261106/browser'),production=process.argv.includes('--production'),captureOnly=process.argv.includes('--capture-only');
fs.mkdirSync(out,{recursive:true});
const cards=[...fur.characters.slice(0,2),...zenith.characters.slice(0,2),superstar.characters[0]].map((c,i)=>({id:c.cardId,cardId:c.cardId,title:c.member,name:c.member,image:'/'+c.sourceArt,rarity:i<2?'FUR':i<4?'ZENITH':'SUPERSTAR',power:2e8,basePower:2e8,power_type:['HP','DEFENSE','DEFENSE','ATTACK','SPEED'][i]})),deck=cards.map(c=>c.id);
const scenarios=BOSSES.map(boss=>{
 const profile=apocalypseTrioLiveProfile(boss,reference.profile),runtime=pveDifficultyRuntime({apocalypse:{enabled:true,monsterProfiles:{[boss.monsterId]:profile}}},{id:boss.monsterId,name:boss.name,pve_tab:'APOCALYPSE',is_boss:1,image_url:boss.sourceArt});
 const battle=createPveBattleV2({cards,mercenaries:['V-966','V-953'].map(c=>snapshot(c,21,'PVE',1e8)),monster:runtime.engineMonster,seed:17});
 const monster={id:boss.monsterId,name:boss.name,image:boss.sourceArt,battlePower:profile.battlePower,rewardCoin:runtime.effectiveRewardCoin,isBoss:true,pveTab:'APOCALYPSE',pve_difficulty:'APOCALYPSE'};
 return {boss,profile,runtime,battle,monster};
});
let active=scenarios[0];
const gitEntries=new Map(execFileSync('git',['-c','gc.auto=0','ls-files','--stage','-z'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:40e6}).split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[1]];}));
function sparseBytes(relative){
 const oid=gitEntries.get(relative);if(!oid)return null;
 const candidate=path.resolve(root,'../../..',relative);
 if(fs.existsSync(candidate)){const bytes=fs.readFileSync(candidate);if(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')===oid)return bytes;}
 return execFileSync('git',['cat-file','blob',oid],{cwd:root,windowsHide:true,maxBuffer:40e6});
}
const energy={energy:5,maxEnergy:5,costPerBattle:1,rechargeMinutes:30};
const user={id:2,serverUserId:2,nickname:'토벌 연출 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:deck,quantities:Object.fromEntries(deck.map(id=>[id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const f=await apocalypseFixture(),traffic=[],json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
let latestAttempt;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),route=url.pathname;
 const {boss,profile,battle,monster}=active;
 if(route.startsWith('/api/')){
  const key=route.slice(5);let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');let data;
  if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};
  else if(key==='cards')data={cards};
  else if(key==='battle/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,monsters:scenarios.map(s=>s.monster),energy,apocalypseEnergy:energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  else if(key==='pvp/config')data={settings:{enabled:true},rankedSeries:{mercenariesPerRound:2,codes:['V-966','V-953','V-968','V-954','V-967','V-955'],cards:[],ready:true,ownedCount:6,revision:1},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:2,SUPERSTAR:1}},deck,presets:{1:deck,2:[],3:[]},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈'}},battleEngine:{active:true},energy,serverNow:new Date().toISOString()};
  else if(key==='battle/deck')data={deck:body.cardIds};
  else if(key==='pvp/match'){traffic.push(key);data={token:'local-pvp-test',opponent:{id:3,nickname:'PVP 회귀 검수',power:1000000}};}
  else if(key==='pvp/fight'){
   traffic.push(key);const battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards.map(c=>({...c,power:10000,basePower:10000})),seed:21});
   data={result:battleV2.result.winner==='A'?'WIN':'LOSE',scoreAfter:1020,scoreChange:20,coinReward:1000,coinAfter:2100,opponent:'PVP 회귀 검수',energy,battleV2,serverNow:new Date().toISOString()};
  }else if(key==='battle/fight'){
   latestAttempt=body.requestId;traffic.push(key);
   await reserveApocalypseBattle(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:boss.monsterId});
   const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:boss.monsterId,won:battle.result.winner==='A',battleV2:battle,plan:{reward:boss.clearRewards.coin,card:null,items:[],magic:null,unified:null,bonuses:{coin:0,masterStars:boss.clearRewards.masterStars,mysticEnergy:0}},log:{ids:deck,playerPower:10000000,monsterPower:profile.battlePower}});
   data={result:'PENDING',reward:0,battleV2:structuredClone(battle),apocalypseChallenge:challenge,monster,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},equippedBattleSuit:{code:'BATTLE_SUIT_03',name:'G-BODY',pvePower:3500000},equippedWeapon:{code:'EQ_1786966923833',name:'DMR'},characterBonus:{battleSuitPve:3500000},user,energy,energyKind:'APOCALYPSE',serverNow:new Date().toISOString()};
  }else if(key.startsWith('battle/apocalypse-challenge/')){
   traffic.push(key);data={...await apocalypseChallengeAction(f.env,user,key.split('/').at(-1),body),serverNow:Date.now(),user};
  }else data={'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return json(res,data);
 }

 let file=path.resolve(root,'.'+decodeURIComponent(route));if(!file.startsWith(root+path.sep)&&file!==root)return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){const bytes=sparseBytes(path.relative(root,file).replaceAll('\\','/'));if(!bytes)return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return res.end(bytes);}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){json(res,{error:error.message,code:error.code},error.status||500);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of production?[390]:[1440,390])for(const scenario of scenarios){
  active=scenario;const {boss,profile,battle,monster}=scenario;
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{console.log('DIALOG',d.message());void d.accept();});
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','apocalypse-local-review');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_pve_view_mode','deck');},user);
  if(production)await page.route('**/api/**',async route=>{const req=route.request();const response=await fetch(origin+new URL(req.url()).pathname,{method:req.method(),headers:{'content-type':'application/json'},body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});});
  await page.goto((production?'https://cnine-card.pages.dev':origin)+'/?screen=battle');await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:30000});
  if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();
  await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('[data-monster="'+boss.monsterId+'"]').click();await page.locator('#battleStart').click();
  await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
  await page.evaluate(async()=>{
   const engine=await ProjectVPixiBattle.mount(),play=engine.playEvents.bind(engine);window.__trioEngine=engine;window.__playbackQa={casts:[],visuals:{},startedAt:performance.now()};
   window.__trioProbe=setInterval(()=>{const fx=engine.activeTrioFX;if(!fx)return;const m=fx.actorMotion,a=m.actor,b=a.fullBodySprite,key=fx.skill.code,v=__playbackQa.visuals[key]??={samples:[],initialFacing:a.view.scale.x};const snap={time:engine.trioPlaybackTime,cutVisible:fx.cut.visible,cut:[fx.cut.x,fx.cut.y,fx.cut.width,fx.cut.height,fx.cut.alpha],actor:[a.root.x,a.root.y],bodyUid:b.uid,bodyParent:b.parent===a.view,texture:b.texture.uid,pose:m.pose,clone:!!fx.actor,scale:[a.root.scale.x,a.root.scale.y]};if(v.samples.length<400)v.samples.push(snap);},20);
   engine.playEvents=async(events,options)=>{const result=await play(events,options);for(const event of events||[])if(event.type==='APOCALYPSE_SKILL'&&engine.lastTrioPlayback?.code===event.skillCode&&!__playbackQa.casts.some(c=>c.code===event.skillCode))__playbackQa.casts.push({...engine.lastTrioPlayback});return result;};window.__restorePlaybackQa=()=>engine.playEvents=play;
  });
  await page.locator('.apocalypse-dodge .is-safe').click();
  await page.waitForFunction(()=>{const e=window.__trioEngine;return e?.lastTrioPlayback?.kind==='ultimate'&&!!e.activeTrioFX&&e.trioPlaybackTime>1.7&&e.trioPlaybackTime<2.8;},null,{timeout:120000});
  const capture=await page.evaluate(()=>({kind:__trioEngine.lastTrioPlayback.kind,time:__trioEngine.trioPlaybackTime,active:!!__trioEngine.activeTrioFX,phase:document.querySelector('#battlePhase')?.textContent}));console.log(JSON.stringify({capture,width}));
  await page.screenshot({path:path.join(out,(production?'production-':'')+boss.key+'-'+width+'-ultimate.png')});
  if(captureOnly){await page.close();continue;}
  await page.waitForFunction(()=>!!document.querySelector('#pveResultConfirm')||document.querySelector('#battlePhase')?.textContent==='연결 실패',null,{timeout:180000});
  const result=await page.evaluate(async()=>{const engine=await ProjectVPixiBattle.mount();clearInterval(window.__trioProbe);return {...__playbackQa,elapsed:performance.now()-__playbackQa.startedAt,failed:document.querySelector('#battlePhase')?.textContent==='연결 실패',runtime:ProjectVPixiBattle.runtimeVersion,activeFx:!!engine.activeTrioFX,overflow:document.documentElement.scrollWidth>innerWidth};});
  const saved=await apocalypseChallengeAction(f.env,user,'status',{requestId:latestAttempt});
  await page.screenshot({path:path.join(out,(production?'production-':'')+boss.key+'-'+width+'-result.png')});
  assert.equal(result.failed,false);assert.equal(saved.status,'CLAIMED');assert.deepEqual(errors,[]);assert.equal(result.activeFx,false);assert.equal(result.overflow,false);
  assert.deepEqual(result.casts.map(c=>c.kind),['seal','curse','ultimate']);assert(result.casts.every(c=>c.impacts===1));assert.equal(result.casts[2].targets,7);assert.equal(result.casts[2].damage,battle.result.timeline.find(e=>e.skillCode===boss.skills[2].code).hits.reduce((sum,h)=>sum+h.damage,0));
  for(const visual of Object.values(result.visuals)){
   const cut=visual.samples.filter(s=>s.time>.15&&s.time<.75);assert(cut.length>2,'static cut samples');
   for(const sample of cut){assert.equal(sample.cutVisible,true);assert.deepEqual(sample.cut,cut[0].cut);assert.deepEqual(sample.actor,cut[0].actor);assert.equal(sample.texture,cut[0].texture);}
   assert(visual.samples.every(s=>s.bodyParent&&!s.clone&&s.bodyUid===cut[0].bodyUid));
   if(boss.key==='infected-soldier')assert(visual.initialFacing>0);
  }
  const ultimate=result.visuals[boss.skills[2].code];assert.deepEqual([...new Set(ultimate.samples.map(s=>s.pose).filter(p=>p>=0))],[0,1,2,3]);
  const claims=traffic.filter(k=>k==='battle/apocalypse-challenge/claim').length;assert.equal(claims,reports.length+1);
  await page.locator('#pveResultConfirm').click();
  if(!production&&boss===BOSSES[0]){
   await page.evaluate(()=>{__restorePlaybackQa();renderShell('pvp');});await page.locator('#rankedMatchStart').waitFor({timeout:20000});await page.locator('#rankedMatchStart').click();
   await page.locator('#pvpResultConfirm').waitFor({timeout:90000});await page.screenshot({path:path.join(out,boss.key+'-'+width+'-pvp.png')});await page.locator('#pvpResultConfirm').click();await page.locator('#rankedMatchStart').waitFor();assert.deepEqual(errors,[]);const reuse=await page.evaluate(()=>__trioEngine.enemies.every(a=>!a.trioBossKey&&a.artFacing!==-1));assert(reuse,'PVP must reset trio facing');
  }
  reports.push({boss:boss.key,width,production,result,settlement:saved.status,battleResult:saved.settlement.result,pvp:production?'local check already passed':'match, battle, result, return passed',errors});
  fs.writeFileSync(path.join(out,production?'production-browser.json':'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({boss:boss.key,width,production,elapsed:Math.round(result.elapsed),settlement:saved.status,casts:result.casts}));await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}
