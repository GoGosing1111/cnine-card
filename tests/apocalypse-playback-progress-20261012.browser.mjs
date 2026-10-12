// Actual index.html entry buttons and shipped V3 engine; isolated SQLite rewards.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import fixture from './fixtures/apocalypse-playback-20261012.json' with {type:'json'};
import {simulateBattleV2Preview,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.APOCALYPSE_QA_DIR,baseline=process.env.APOCALYPSE_QA_BASELINE==='1';
assert(out&&!path.resolve(out).startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const oldWrapper=baseline?execFileSync('git',['show','4a6bb1b48917098aab3286dfb393ef0e39318c3b:js/battle-v3-live.js'],{encoding:'utf8'}):null;
const actors=team=>[...(team.cards||[]),...(team.mercenaries||[]),...(team.supports||[])].map(c=>({...c,alive:true}));
const battle={...structuredClone(fixture),result:simulateBattleV2Preview({...fixture.rules,seed:fixture.seed,teamA:actors(fixture.teams.A),teamB:actors(fixture.teams.B),healerPenalty:true,singleHealerBonus:fixture.rules.singleHealerBonus})};
battle.result.final.mercenaries={A:battle.result.final.A.filter(c=>c.isMercenary),B:[]};
battle.result.final.A=battle.result.final.A.filter(c=>!c.isMercenary&&!c.isBattleSuit);
const cards=battle.teams.A.cards.map(c=>({...c,id:c.cardId,rarity:c.grade,basePower:c.power})),deck=cards.map(c=>c.id),boss=battle.teams.B.cards[0];
const monster={id:76,name:boss.title,image:boss.image,battlePower:6500000,isBoss:true,pveTab:'APOCALYPSE',pve_difficulty:'APOCALYPSE'};
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
   await reserveApocalypseBattle(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:76});
   const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:76,won:battle.result.winner==='A',battleV2:battle,plan:{reward:1000,card:null,items:[],magic:null,unified:null,bonuses:{coin:0,masterStars:0,mysticEnergy:0}},log:{ids:deck,playerPower:10000000,monsterPower:6500000}});
   data={result:'PENDING',reward:0,battleV2:structuredClone(battle),apocalypseChallenge:challenge,monster,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},equippedBattleSuit:{code:'BATTLE_SUIT_03',name:'G-BODY',pvePower:3500000},equippedWeapon:{code:'EQ_1786966923833',name:'DMR'},characterBonus:{battleSuitPve:3500000},user,energy,energyKind:'APOCALYPSE',serverNow:new Date().toISOString()};
  }else if(key.startsWith('battle/apocalypse-challenge/')){
   traffic.push(key);data={...await apocalypseChallengeAction(f.env,user,key.split('/').at(-1),body),serverNow:Date.now(),user};
  }else data={'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return json(res,data);
 }
 if(oldWrapper&&route==='/js/battle-v3-live.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(oldWrapper);}
 let file=path.resolve(root,'.'+decodeURIComponent(route));if(!file.startsWith(root+path.sep)&&file!==root)return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){json(res,{error:error.message,code:error.code},error.status||500);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of baseline?[390]:[1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{console.log('DIALOG',d.message());void d.accept();});
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','apocalypse-local-review');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_pve_view_mode','deck');},user);
  await page.goto(origin+'/?screen=battle');await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:30000});
  if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();
  await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('#battleStart').click();
  await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
  const observed=await page.evaluate(async slow=>{
   const engine=await ProjectVPixiBattle.mount(),play=engine.playEvents.bind(engine);window.__playbackQa={finished:[],startedAt:performance.now()};
   engine.playEvents=async(events,options)=>{
    // Slow presentation only; server event order, amounts and clocks stay intact.
    if(slow&&options?.timedInternal&&events[0]?.type==='MERCENARY_HIT')await new Promise(resolve=>setTimeout(resolve,1500));
    const result=await play(events,options);if(options?.timedInternal)__playbackQa.finished.push({seq:events[0]?.seq,type:events[0]?.type,at:performance.now()});return result;
   };
   window.__restorePlaybackQa=()=>engine.playEvents=play;
   const events=engine.battleData.battleV2.result.timeline;
   return {deadline:Math.max(30000,Math.max(...events.map(e=>e.combatAtMs||0))*2+15000),events:events.length};
  },width===390);
  await page.locator('.apocalypse-dodge .is-safe').click();
  await page.waitForFunction(()=>!!document.querySelector('#pveResultConfirm')||document.querySelector('#battlePhase')?.textContent==='연결 실패',null,{timeout:180000});
  const result=await page.evaluate(()=>({...__playbackQa,elapsed:performance.now()-__playbackQa.startedAt,failed:document.querySelector('#battlePhase')?.textContent==='연결 실패',chips:ProjectVPixiBattle.diagnostics().accountBattleUnit.skillChips}));
  const saved=await apocalypseChallengeAction(f.env,user,'status',{requestId:latestAttempt});
  await page.screenshot({path:path.join(out,(baseline?'baseline-':'')+width+'-pve.png')});
  assert.equal(result.failed,baseline);assert.equal(saved.status,baseline?'FAILED':'CLAIMED');assert.deepEqual(errors,[]);
  if(width===390){assert(result.elapsed>observed.deadline,'slow progressing playback must cross the old total deadline');}
  if(!baseline){
   assert.equal(result.chips.completed,true);assert.equal(result.finished.at(-1).type,'RESULT');
   const claims=traffic.filter(k=>k==='battle/apocalypse-challenge/claim').length;assert.equal(claims,reports.length+1);
   await page.locator('#pveResultConfirm').click();await page.evaluate(()=>{__restorePlaybackQa();renderShell('pvp');});
   await page.locator('#rankedMatchStart').waitFor({timeout:20000});await page.locator('#rankedMatchStart').click();
   await page.locator('#pvpResultConfirm').waitFor({timeout:90000});await page.screenshot({path:path.join(out,width+'-pvp.png')});
   await page.locator('#pvpResultConfirm').click();await page.locator('#rankedMatchStart').waitFor();assert.deepEqual(errors,[]);
  }
  reports.push({width,baseline,observed,result,settlement:saved.status,pvp:baseline?'not run':'match button, battle, result, return passed',errors});
  fs.writeFileSync(path.join(out,baseline?'baseline.json':'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({width,baseline,elapsed:Math.round(result.elapsed),oldDeadline:observed.deadline,settlement:saved.status,pvp:!baseline}));await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}
