// Real app, shipped bundles and synthetic accounts only. Run with the loopback
// scripts/serve-clan-faction-preview.mjs server; no production credentials.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {APOCALYPSE_LEGION_BOSSES} from '../shared/apocalypse-legion-v1.mjs';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.SUGGESTIONS_QA_ORIGIN||'http://127.0.0.1:8960';
const out=process.env.SUGGESTIONS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'player-suggestions-'));
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/characters/prestige/manifest-v1.json','utf8'));
const cards=manifest.characters.slice(0,6).map((c,i)=>({id:c.cardId,title:c.title,name:c.member,grade:'PRESTIGE',rarity:'PRESTIGE',type:['ATTACK','DEFENSE','SPEED','HP','BALANCED'][i%5],power:20000000,basePower:20000000,image:c.sourceArt,sourceArt:c.sourceArt}));
const deck=cards.slice(0,5).map(c=>c.id),boss=APOCALYPSE_LEGION_BOSSES[0];
const monster={id:75,name:boss.name,image:boss.sourceArt,image_url:boss.sourceArt,battlePower:7500000,battle_power:7500000,rewardCoin:1000,isBoss:true,is_boss:1,pveTab:'APOCALYPSE',pve_difficulty:'APOCALYPSE',pve_hp_percent:350,pve_attack_percent:475,pve_defense_percent:375,pve_speed_percent:375,pve_shield_percent:70};
const energy={energy:5,maxEnergy:5,costPerBattle:1,rechargeMinutes:30};
const user={id:2,serverUserId:2,nickname:'방어대장 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),errors=[],checks=[];
const check=(value,name)=>{assert.ok(value,name);checks.push(name)};

const f=await apocalypseFixture();
const snapshot=createPveBattleV2({cards:cards.slice(0,5),monster,seed:21});
async function open(viewport){
 const page=await browser.newPage({viewport,serviceWorkers:'block'});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{console.log('DIALOG',d.message());d.accept()});page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','faction-review-2');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_pve_view_mode','deck');},user);
 let fightResponse,lockUntil=0;const traffic={claimCalls:0,collisions:0,pulses:0};
 await page.route('**/api/**',async route=>{
  const key=new URL(route.request().url()).pathname.slice(5),body=route.request().postDataJSON?.();let data;
  if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};
  else if(key==='cards')data={cards};
  else if(key==='battle/config')data={settings:{enabled:true},deckRules:{gradeLimits:{PRESTIGE:5}},deck,monsters:[monster],energy,apocalypseEnergy:energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  else if(key==='battle/deck')data={deck:body.cardIds};
  else if(key==='pvp/config')data={settings:{enabled:true},deckRules:{gradeLimits:{PRESTIGE:5}},deck,presets:{1:deck,2:[],3:[]},profile:{season_score:0,tier:{id:'bronze',name:'브론즈'}},battleEngine:{active:true},energy,serverNow:new Date().toISOString()};
  else if(key==='pvp/deck')data={magicCardIds:body.magicCardIds};
  else if(key==='battle/fight'){
   await reserveApocalypseBattle(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:75});
   const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:75,won:true,battleV2:snapshot,plan:{reward:1000,card:null,items:[],magic:null,unified:null,bonuses:{coin:0,masterStars:0,mysticEnergy:0}},log:{ids:deck,playerPower:100000000,monsterPower:7500000}});
   fightResponse={result:'PENDING',reward:0,battleV2:structuredClone(snapshot),apocalypseChallenge:challenge,monster,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},user,energy,energyKind:'APOCALYPSE',serverNow:new Date().toISOString()};data=fightResponse;
   }else if(key.startsWith('battle/apocalypse-challenge/')){
   const action=key.split('/').at(-1);
   const busy=()=>route.fulfill({status:409,json:{error:'같은 계정의 다른 게임 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.',code:'USER_ACTION_IN_PROGRESS'}});
   if(action==='claim'&&++traffic.claimCalls<=2)return busy();
   if(Date.now()<lockUntil){traffic.collisions++;return busy()}
   if(action==='pulse')traffic.pulses++;
   lockUntil=Date.now()+1000;
   await new Promise(resolve=>setTimeout(resolve,action==='pulse'?180:40));
   lockUntil=Date.now()+80;
   try{const r=await apocalypseChallengeAction(f.env,user,key.split('/').at(-1),body);data={...r,serverNow:Date.now(),...(['CLAIMED','FAILED'].includes(r.status)?{user:{...user,coin:Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin)}}:{})}}catch(e){return route.fulfill({status:e.status||500,json:{error:e.message}})}
  }else return route.continue();
  return route.fulfill({json:data});
 });
 await page.goto(base+'/?screen=battle',{waitUntil:'domcontentloaded'});await page.locator('#battleDeck [data-remove]').first().waitFor();
 return {page,traffic,fight:()=>fightResponse};
}
const resultCount=async()=>Number((await f.p("SELECT COUNT(*) n FROM battle_logs WHERE user_id=2 AND result='WIN'").first()).n);
const state=async id=>apocalypseChallengeAction(f.env,user,'status',{requestId:id});
async function enter(page){
 await page.evaluate(()=>renderShell('battle'));await page.locator('#battleStart, #pveV2GoHunt').first().waitFor();if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('#battleStart').click();await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
}
try{
 for(const viewport of [{width:1788,height:1300},{width:390,height:844}]){
  const {page,fight,traffic}=await open(viewport),label=String(viewport.width);
  await page.evaluate(()=>{window.recoveryPanels=0;new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&(n.matches('.apocalypse-dodge.is-recovery')||n.querySelector('.apocalypse-dodge.is-recovery')))window.recoveryPanels++}).observe(document.body,{subtree:true,childList:true})});
  const wins=await resultCount();await enter(page);await page.locator('.apocalypse-dodge .is-safe').click();
  await page.locator('.apocalypse-dodge').waitFor({state:'detached'});
  const layout=await page.evaluate(async()=>{
   const engine=await ProjectVPixiBattle.mount(),host=document.querySelector('.battle-v3-canvas-host');
   const bounds=rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
   const maskBounds=mask=>{const b=mask.context.bounds,a=mask.toGlobal({x:b.minX,y:b.minY}),z=mask.toGlobal({x:b.maxX,y:b.maxY});return {x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y}};
   return {css:getComputedStyle(host).backgroundImage,screen:bounds(engine.app.screen),scene:engine.scene,root:{x:engine.root.x,y:engine.root.y,scale:engine.root.scale.x},shade:bounds(engine.backgroundShade.getBounds()),layers:engine.parallaxLayers.map(({sprite,mask})=>({sprite:bounds(sprite.getBounds()),mask:maskBounds(mask)}))};
  });
  fs.writeFileSync(path.join(out,'layout-'+label+'.json'),JSON.stringify(layout,null,2));
  check(layout.css==='none',label+' ready canvas has no duplicate CSS backdrop');
  check(Math.abs(layout.root.scale-Math.min(layout.screen.width/layout.scene.width,layout.screen.height/layout.scene.height))<0.001,label+' original actor scale retained');
  const sky=layout.layers[0],ground=layout.layers.at(-1),epsilon=3;
  for(const layer of layout.layers){
   check(layer.sprite.x<=epsilon&&layer.sprite.y<=epsilon&&layer.sprite.x+layer.sprite.width>=layout.screen.width-epsilon&&layer.sprite.y+layer.sprite.height>=layout.screen.height-epsilon,label+' backdrop covers viewport');
  }
  check(sky.mask.y<=epsilon&&ground.mask.y+ground.mask.height>=layout.screen.height-epsilon,label+' backdrop masks cover letterbox margins');
  check(layout.shade.y<=epsilon&&layout.shade.y+layout.shade.height>=layout.screen.height-epsilon,label+' uniform backdrop shading through letterbox margins');
  await page.screenshot({path:path.join(out,'battle-'+label+'.png')});
  if(process.env.APOCALYPSE_BACKDROP_ONLY==='1'){await page.close();continue}
  await page.locator('#pveResultConfirm').waitFor({timeout:90000});
  check(await resultCount()===wins+1,label+' exactly one clear after automatic lock retries');
  check((await state(fight().apocalypseChallenge.requestId)).status==='CLAIMED',label+' server receipt claimed');
  check(await page.evaluate(()=>window.recoveryPanels)===0,label+' no manual recovery popup');
  check(traffic.claimCalls>=3,label+' transient claim collisions injected and recovered');
  check(traffic.pulses>0,label+' heartbeat active during real battle');
  await page.screenshot({path:path.join(out,'result-'+label+'.png')});
  checks.push({viewport,traffic});await page.locator('#pveResultConfirm').click();await page.close();
 }
 if(process.env.APOCALYPSE_BACKDROP_ONLY!=='1'){
 const {page:corePage}=await open({width:1440,height:1000});
 for(const mode of ['PVE','PVP']){
  const battleV2=mode==='PVE'?snapshot:createPvpBattleV2({attackerCards:cards.slice(0,5),defenderCards:cards.slice(0,5).map(c=>({...c,power:2000000})),seed:21});
  const data={result:battleV2.result.winner==='A'?'WIN':'LOSE',reward:1000,battleV2,user,energy,monster,difficulty:{difficulty:'NORMAL'},serverNow:new Date().toISOString()};
  await corePage.evaluate(async({data,mode})=>{await ensureFeatureResources('battleV2');const modal=document.getElementById('modal'),live=window.prepareBattleV2LiveLoading({modal,mode,playerName:'검수',opponentName:'상대'});const options={...live,modal,data,monster:data.monster};await (mode==='PVE'?window.playPveBattleV2Live(options):window.playPvpBattleV2Live(options));},{data,mode});
  check(await corePage.locator('.is-result-visible').count()>0,mode+' ordinary replay reaches result');await corePage.evaluate(()=>renderShell('battle'));
 }
 await corePage.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({out,checks,errors},null,2));
}finally{await browser.close();await f.close()}
