// Real app, shipped bundles and synthetic accounts only. Run with the loopback
// scripts/serve-clan-faction-preview.mjs server; no production credentials.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {APOCALYPSE_LEGION_BOSSES} from '../shared/apocalypse-legion-v1.mjs';
import {factionFixture} from './helpers/clan-faction-fixture.mjs';
import {registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.SUGGESTIONS_QA_ORIGIN||'http://127.0.0.1:8985';
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
const f=await factionFixture();
f.DB.sql.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
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
   const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,monsterId:75,won:true,rewardCoin:1000,bonus:{}});
   fightResponse={result:'WIN',reward:1000,battleV2:structuredClone(snapshot),apocalypseChallenge:challenge,monster,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},user,energy,energyKind:'APOCALYPSE',serverNow:new Date().toISOString()};data=fightResponse;
  }else if(key.startsWith('battle/apocalypse-challenge/')){
   try{const r=await apocalypseChallengeAction(f.env,user,key.split('/').at(-1),body);data={...r,serverNow:Date.now(),...(r.status==='CLAIMED'?{user}:{})}}catch(e){return route.fulfill({status:e.status||500,json:{error:e.message}})}
  }else if(key==='soopketland/state')data={access:{allowed:true,isOwner:false},tickets:3,nextCouponUses:1,prizes:[{key:'MASTER_STAR',label:'마스터의 별',range:'1,000 ~ 300,000개',percent:42.5,symbol:'S',color:0xffe7a6}],history:[]};
  else if(key==='coupons/redeem'||key==='coupon/redeem'){
   couponCalls++;if(body.code==='INVALID')return route.fulfill({status:400,json:{error:'사용할 수 없는 쿠폰입니다.'}});
   await new Promise(r=>setTimeout(r,500));data={user,message:'마스터의 별 300개를 받았습니다.'};
  }else return route.continue();
  return route.fulfill({json:data});
 });
 await page.goto(base+'/?screen=battle',{waitUntil:'domcontentloaded'});await page.locator('#battleDeck [data-remove]').first().waitFor();
 return {page,couponCalls:()=>couponCalls};
}
try{
 await serverApi('preview/reset',{});await serverApi('clan/faction/captains',{captains:{attack1:2,attack2:4}});
 const own=(await serverApi('clan/faction/overview')).districts.find(d=>d.owner===1).id;
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const {page,couponCalls}=await open(viewport),label=String(viewport.width);
  if(!(process.env.SUGGESTIONS_QA_RESUME==='garrison'&&viewport.width===1440)){
  await page.locator(`[data-remove="${deck[0]}"]`).click();
  assert.deepEqual(await page.evaluate(()=>battleState.deck),['',...deck.slice(1)]);
  check(await page.locator('#saveBattleDeck').isDisabled(),label+' PVE incomplete deck cannot save');
  await page.locator('#battleDeck').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'pve-slot-'+label+'.png')});
  await page.locator(`[data-pick="${cards[5].id}"]`).click();
  assert.deepEqual(await page.evaluate(()=>battleState.deck),[cards[5].id,...deck.slice(1)]);
  await page.locator('#saveBattleDeck').click();check(true,label+' PVE saves replacement at original slot');

  await page.evaluate(()=>renderShell('pvp'));await page.locator('[data-pvp="deck"]').click();
  await page.locator(`[data-pvp-remove="${deck[0]}"]`).click();
  assert.deepEqual(await page.evaluate(()=>pvpState.deck),['',...deck.slice(1)]);
  await page.locator('#pvpDeckSlots').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'pvp-slot-'+label+'.png')});
  await page.locator(`[data-cid="${cards[5].id}"]`).click();
  assert.deepEqual(await page.evaluate(()=>pvpState.deck),[cards[5].id,...deck.slice(1)]);
  check(true,label+' PVP replacement preserves other positions');
  await page.evaluate(()=>savePvpDeck());

  await page.evaluate(()=>renderShell('battle'));await page.locator('#pveV2GoHunt').click();
  await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('#battleStart').click();
  await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
  check(await page.locator('.battle-v3-canvas-host canvas').count()>0,label+' real V3 boss battlefield behind dodge');
  check(await page.evaluate(()=>window.__apocalypsePlaybackActive===true&&renderShell('battle')===false),label+' playback cannot navigate directly to result');
  const panel=await page.locator('.apocalypse-dodge').boundingBox();check(panel.y>=0&&panel.y+panel.height<=viewport.height,label+' dodge controls fit viewport');
  await page.screenshot({path:path.join(out,'apocalypse-'+label+'.png')});
  await page.locator('.apocalypse-dodge [data-dodge-zone].is-safe').click();
  await page.locator('#pveResultConfirm').waitFor({timeout:60000});
  check(await page.locator('.v3-report-adjustment').textContent()==='충격파 회피 · 성공',label+' result keeps authoritative dodge status');
  await page.locator('#pveResultConfirm').click();check(!(await page.evaluate(()=>window.__apocalypsePlaybackActive)),label+' playback lock releases');

  await page.evaluate(()=>renderShell('soopketland'));await page.locator('#slCouponCode').waitFor();
  await page.locator('#slCouponCode').fill('INVALID');await page.locator('[data-sl-coupon-form] button').click();
  await page.locator('[data-sl-coupon-status]').filter({hasText:'사용할 수 없는 쿠폰'}).waitFor();
  await page.locator('#slCouponCode').fill('QA-LOCAL-ONLY');
  await page.locator('[data-sl-coupon-form]').evaluate(el=>{el.requestSubmit();el.requestSubmit()});
  await page.locator('[data-sl-coupon-status]').filter({hasText:'사용 완료'}).waitFor();
  check(couponCalls()===2,label+' duplicate submit sends one coupon request');
  check(await page.locator('[data-sl-balance]').textContent()==='3개',label+' coupon does not reset machine or ticket count');
  await page.locator('.sl-coupon').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'coupon-'+label+'.png')});

  }
  await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('clanFaction'));await page.locator(`[data-fw-zone="${own}"]`).press('Enter');
  await page.locator('#fw-defense-select').selectOption('defense2');await page.locator('[data-fw-garrison]').click();
  await page.locator('.fw-notice').filter({hasText:'방어대를 배치'}).waitFor();check(true,label+' captain assigns garrison through live UI');
  await page.locator('.fw-garrison').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'garrison-'+label+'.png')});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' no horizontal overflow');
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({out,checks,errors},null,2));
}finally{await browser.close();await f.close()}
