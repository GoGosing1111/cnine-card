// Actual index.html entry buttons and shipped V3 engine; isolated SQLite rewards.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import reference from '../preview/apocalypse-sahyeon-20261019-v1/azuma-reference.json' with {type:'json'};
import zenith from '../assets/ui/project-v/characters/zenith/manifest-v1.json' with {type:'json'};
import fur from '../assets/ui/project-v/characters/fur/manifest-v2.json' with {type:'json'};
import {SAHYEON,sahyeonLiveProfile} from '../shared/apocalypse-sahyeon-v1.mjs';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.SAHYEON_QA_OUTPUT||path.join(root,'docs/qa/apocalypse-sahyeon-live-20261019'),production=process.argv.includes('--production'),captureOnly=process.argv.includes('--capture-only');
fs.mkdirSync(out,{recursive:true});
const cards=[...fur.characters.slice(0,2),...zenith.characters.slice(0,3)].map((c,i)=>({id:c.cardId,cardId:c.cardId,title:c.member,name:c.member,image:'/'+c.sourceArt,rarity:i<2?'FUR':'ZENITH',power:4e6,basePower:4e6,power_type:['HP','DEFENSE','DEFENSE','ATTACK','SPEED'][i]})),deck=cards.map(c=>c.id);
const profile=sahyeonLiveProfile(reference.referenceProfile),runtime=pveDifficultyRuntime({apocalypse:{enabled:true,monsterProfiles:{80:profile}}},{id:80,name:SAHYEON.name,pve_tab:'APOCALYPSE',is_boss:1,image_url:SAHYEON.sourceArt});
const battle=createPveBattleV2({cards,monster:runtime.engineMonster,seed:83});
const monster={id:80,name:SAHYEON.name,image:SAHYEON.sourceArt,battlePower:profile.battlePower,rewardCoin:runtime.effectiveRewardCoin,isBoss:true,pveTab:'APOCALYPSE',pve_difficulty:'APOCALYPSE'};
const energy={energy:5,maxEnergy:5,costPerBattle:1,rechargeMinutes:30};
const user={id:2,serverUserId:2,nickname:'토벌 연출 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:deck,quantities:Object.fromEntries(deck.map(id=>[id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const f=await apocalypseFixture(),traffic=[],json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
let latestAttempt;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),route=url.pathname;
 if(route.startsWith('/api/')){
  const key=route.slice(5);let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');let data;
  if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};
  else if(key==='cards')data={cards};
  else if(key==='battle/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,monsters:[monster],energy,apocalypseEnergy:energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  else if(key==='pvp/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,presets:{1:deck,2:[],3:[]},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈'}},battleEngine:{active:true},energy,serverNow:new Date().toISOString()};
  else if(key==='battle/deck')data={deck:body.cardIds};
  else if(key==='pvp/match'){traffic.push(key);data={token:'local-pvp-test',opponent:{id:3,nickname:'PVP 회귀 검수',power:1000000}};}
  else if(key==='pvp/fight'){
   traffic.push(key);const battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards.map(c=>({...c,power:10000,basePower:10000})),seed:21});
   data={result:battleV2.result.winner==='A'?'WIN':'LOSE',scoreAfter:1020,scoreChange:20,coinReward:1000,coinAfter:2100,opponent:'PVP 회귀 검수',energy,battleV2,serverNow:new Date().toISOString()};
  }else if(key==='battle/fight'){
   latestAttempt=body.requestId;traffic.push(key);
   await reserveApocalypseBattle(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:80});
   const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:80,won:battle.result.winner==='A',battleV2:battle,plan:{reward:1000,card:null,items:[],magic:null,unified:null,bonuses:{coin:0,masterStars:0,mysticEnergy:0}},log:{ids:deck,playerPower:10000000,monsterPower:profile.battlePower}});
   data={result:'PENDING',reward:0,battleV2:structuredClone(battle),apocalypseChallenge:challenge,monster,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},equippedBattleSuit:{code:'BATTLE_SUIT_03',name:'G-BODY',pvePower:3500000},equippedWeapon:{code:'EQ_1786966923833',name:'DMR'},characterBonus:{battleSuitPve:3500000},user,energy,energyKind:'APOCALYPSE',serverNow:new Date().toISOString()};
  }else if(key.startsWith('battle/apocalypse-challenge/')){
   traffic.push(key);data={...await apocalypseChallengeAction(f.env,user,key.split('/').at(-1),body),serverNow:Date.now(),user};
  }else data={'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return json(res,data);
 }

 let file=path.resolve(root,'.'+decodeURIComponent(route));if(!file.startsWith(root+path.sep)&&file!==root)return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){json(res,{error:error.message,code:error.code},error.status||500);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of production?[390]:[1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{console.log('DIALOG',d.message());void d.accept();});
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','apocalypse-local-review');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_pve_view_mode','deck');},user);
  if(production)await page.route('**/api/**',async route=>{const req=route.request();const response=await fetch(origin+new URL(req.url()).pathname,{method:req.method(),headers:{'content-type':'application/json'},body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});});
  await page.goto((production?'https://cnine-card.pages.dev':origin)+'/?screen=battle');await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:30000});
  if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();
  await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('#battleStart').click();
  await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
  await page.evaluate(async()=>{
   const engine=await ProjectVPixiBattle.mount(),play=engine.playEvents.bind(engine);window.__sahyeonEngine=engine;window.__playbackQa={casts:[],startedAt:performance.now()};
   engine.playEvents=async(events,options)=>{const result=await play(events,options);for(const event of events||[])if(event.type==='APOCALYPSE_SKILL'&&engine.lastSahyeonPlayback?.code===event.skillCode&&!__playbackQa.casts.some(c=>c.code===event.skillCode))__playbackQa.casts.push({...engine.lastSahyeonPlayback});return result;};window.__restorePlaybackQa=()=>engine.playEvents=play;
  });
  await page.locator('.apocalypse-dodge .is-safe').click();
  await page.waitForFunction(()=>{const e=window.__sahyeonEngine;return e?.lastSahyeonPlayback?.kind==='ultimate'&&!!e.activeSahyeonFX&&e.sahyeonPlaybackTime>1.7&&e.sahyeonPlaybackTime<2.8;},null,{timeout:120000});
  const capture=await page.evaluate(()=>({kind:__sahyeonEngine.lastSahyeonPlayback.kind,time:__sahyeonEngine.sahyeonPlaybackTime,active:!!__sahyeonEngine.activeSahyeonFX,phase:document.querySelector('#battlePhase')?.textContent}));console.log(JSON.stringify({capture,width}));
  await page.screenshot({path:path.join(out,(production?'production-':'')+width+'-ultimate.png')});
  if(captureOnly){await page.close();continue;}
  await page.waitForFunction(()=>!!document.querySelector('#pveResultConfirm')||document.querySelector('#battlePhase')?.textContent==='연결 실패',null,{timeout:180000});
  const result=await page.evaluate(async()=>{const engine=await ProjectVPixiBattle.mount();return {...__playbackQa,elapsed:performance.now()-__playbackQa.startedAt,failed:document.querySelector('#battlePhase')?.textContent==='연결 실패',runtime:ProjectVPixiBattle.runtimeVersion,activeFx:!!engine.activeSahyeonFX,overflow:document.documentElement.scrollWidth>innerWidth};});
  const saved=await apocalypseChallengeAction(f.env,user,'status',{requestId:latestAttempt});
  await page.screenshot({path:path.join(out,(production?'production-':'')+width+'-result.png')});
  assert.equal(result.failed,false);assert.equal(saved.status,'CLAIMED');assert.deepEqual(errors,[]);assert.equal(result.activeFx,false);assert.equal(result.overflow,false);
  assert.deepEqual(result.casts.map(c=>c.kind),['seal','curse','ultimate']);assert(result.casts.every(c=>c.impacts===1));assert.equal(result.casts[2].targets,5);assert.equal(result.casts[2].damage,battle.result.timeline.find(e=>e.skillCode==='SAHYEON_ULTIMATE').hits.reduce((sum,h)=>sum+h.damage,0));
  const claims=traffic.filter(k=>k==='battle/apocalypse-challenge/claim').length;assert.equal(claims,reports.length+1);
  await page.locator('#pveResultConfirm').click();
  if(!production){
   await page.evaluate(()=>{__restorePlaybackQa();renderShell('pvp');});await page.locator('#rankedMatchStart').waitFor({timeout:20000});await page.locator('#rankedMatchStart').click();
   await page.locator('#pvpResultConfirm').waitFor({timeout:90000});await page.screenshot({path:path.join(out,width+'-pvp.png')});await page.locator('#pvpResultConfirm').click();await page.locator('#rankedMatchStart').waitFor();assert.deepEqual(errors,[]);
  }
  reports.push({width,production,result,settlement:saved.status,battleResult:saved.settlement.result,pvp:production?'local check already passed':'match, battle, result, return passed',errors});
  fs.writeFileSync(path.join(out,production?'production-browser.json':'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({width,production,elapsed:Math.round(result.elapsed),settlement:saved.status,casts:result.casts}));await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}
