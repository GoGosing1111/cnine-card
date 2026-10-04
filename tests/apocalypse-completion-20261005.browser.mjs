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
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
const check=(value,name)=>{assert.ok(value,name);checks.push(name)};
const serverApi=async(route,body)=>{const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-review-user':'1'},body:body?JSON.stringify({requestId:crypto.randomUUID(),...body}):undefined});assert.equal(r.status,200);return r.json()};
const f=await apocalypseFixture();
const snapshot=createPveBattleV2({cards:cards.slice(0,5),monster,seed:21});
async function open(viewport){
 const page=await browser.newPage({viewport,serviceWorkers:'block'});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{console.log('DIALOG',d.message());d.accept()});page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','faction-review-2');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_pve_view_mode','deck');},user);
 let fightResponse,couponCalls=0;
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
   try{const r=await apocalypseChallengeAction(f.env,user,key.split('/').at(-1),body);data={...r,serverNow:Date.now(),...(['CLAIMED','FAILED'].includes(r.status)?{user:{...user,coin:Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin)}}:{})}}catch(e){return route.fulfill({status:e.status||500,json:{error:e.message}})}
  }else if(key==='soopketland/state')data={access:{allowed:true,isOwner:false},tickets:3,nextCouponUses:1,prizes:[{key:'MASTER_STAR',label:'마스터의 별',range:'1,000 ~ 300,000개',percent:42.5,symbol:'S',color:0xffe7a6}],history:[]};
  else if(key==='coupons/redeem'||key==='coupon/redeem'){
   couponCalls++;if(body.code==='INVALID')return route.fulfill({status:400,json:{error:'사용할 수 없는 쿠폰입니다.'}});
   await new Promise(r=>setTimeout(r,500));data={user,message:'마스터의 별 300개를 받았습니다.'};
  }else return route.continue();
  return route.fulfill({json:data});
 });
 await page.goto(base+'/?screen=battle',{waitUntil:'domcontentloaded'});await page.locator('#battleDeck [data-remove]').first().waitFor();
 return {page,couponCalls:()=>couponCalls,fight:()=>fightResponse};
}
const resultCount=async()=>Number((await f.p("SELECT COUNT(*) n FROM battle_logs WHERE user_id=2 AND result='WIN'").first()).n);
const state=async id=>apocalypseChallengeAction(f.env,user,'status',{requestId:id});
async function enter(page){
 await page.evaluate(()=>renderShell('battle'));await page.locator('#battleStart, #pveV2GoHunt').first().waitFor();if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('#battleStart').click();await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
}
try{
 if(process.env.APOCALYPSE_CORE_ONLY!=='1')for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const {page,fight}=await open(viewport),label=String(viewport.width);
  await enter(page);const wrongId=fight().apocalypseChallenge.requestId;
  check(await page.locator('.battle-v3-canvas-host canvas').count()>0,label+' real shipped V3 battlefield');
  const panel=await page.locator('.apocalypse-dodge').boundingBox();check(panel.y>=0&&panel.y+panel.height<=viewport.height,label+' mechanic controls fit');
  await page.screenshot({path:path.join(out,'wipe-mechanic-'+label+'.png')});
  await page.locator('.apocalypse-dodge .is-danger').first().click();await page.locator('#pveResultConfirm').waitFor({timeout:60000});
  check((await state(wrongId)).status==='FAILED',label+' wrong input is server defeat');
  check((await page.locator('.v3-report-adjustment').textContent()).includes('전원 전멸'),label+' result says party wipe');
  await page.screenshot({path:path.join(out,'wipe-result-'+label+'.png')});await page.locator('#pveResultConfirm').click();
  const wins=await resultCount();await enter(page);await page.locator('.apocalypse-dodge .is-safe').click();await page.locator('#pveResultConfirm').waitFor({timeout:90000});
  check(await resultCount()===wins+1,label+' successful mechanic and full playback grant one clear');
  check((await page.locator('.v3-report-adjustment').textContent()).includes('성공'),label+' successful outcome');
  await page.screenshot({path:path.join(out,'clear-result-'+label+'.png')});await page.locator('#pveResultConfirm').click();
  await page.evaluate(()=>renderShell('soopketland'));await page.locator('#slCouponCode').waitFor();
  check(!(await page.locator('#main').textContent()).includes('메시지함에도'),label+' coupon history replaces inbox copy');
  await page.locator('.sl-coupon').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'land-coupon-'+label+'.png')});
  if(viewport.width===1440){
   await enter(page);const timeoutId=fight().apocalypseChallenge.requestId;await page.locator('#pveResultConfirm').waitFor({timeout:30000});check((await state(timeoutId)).status==='FAILED','no input causes wipe');await page.locator('#pveResultConfirm').click();
   for(const stage of ['before-answer','after-answer','navigation']){
    const before=await resultCount();await enter(page);const id=fight().apocalypseChallenge.requestId;
    if(stage!=='before-answer'){await page.locator('.apocalypse-dodge .is-safe').click();await page.locator('.apocalypse-dodge').waitFor({state:'detached'});}
    if(stage==='navigation')await page.evaluate(()=>renderShell('soopketland'));else await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForTimeout(1500);const saved=await state(id);check(saved.status==='FAILED',stage+' leaves terminal failure');check(await resultCount()===before,stage+' cannot create clear');
   }
  }
  await page.close();
 }
 const {page:corePage}=await open({width:1440,height:1000});
 for(const mode of ['PVE','PVP']){
  const battleV2=mode==='PVE'?snapshot:createPvpBattleV2({attackerCards:cards.slice(0,5),defenderCards:cards.slice(0,5).map(c=>({...c,power:2000000})),seed:21});
  const data={result:battleV2.result.winner==='A'?'WIN':'LOSE',reward:1000,battleV2,user,energy,monster,difficulty:{difficulty:'NORMAL'},serverNow:new Date().toISOString()};
  await corePage.evaluate(async({data,mode})=>{await ensureFeatureResources('battleV2');const modal=document.getElementById('modal'),live=window.prepareBattleV2LiveLoading({modal,mode,playerName:'검수',opponentName:'상대'});const options={...live,modal,data,monster:data.monster};await (mode==='PVE'?window.playPveBattleV2Live(options):window.playPvpBattleV2Live(options));},{data,mode});
  check(await corePage.locator('.is-result-visible').count()>0,mode+' ordinary replay reaches result without Apocalypse input');
  await corePage.evaluate(()=>renderShell('battle'));
 }
 await corePage.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({out,checks,errors},null,2));
}finally{await browser.close();await f.close()}
