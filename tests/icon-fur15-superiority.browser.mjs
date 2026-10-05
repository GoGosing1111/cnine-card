// Real production shell/buttons and bundle, synthetic local account and server-generated battles.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {ICON_ROLES} from '../shared/icon-roles-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {iconFurFixture,live} from './helpers/icon-fur15-fixture.mjs';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {fur15ReferenceCards} from '../functions/_icon_fur_reference.js';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const normal=JSON.parse(fs.readFileSync('assets/ui/project-v/characters/zenith/manifest-v1.json')).characters.slice(0,3).map((c,i)=>({id:c.cardId,title:c.title,grade:i===0?'SUPERSTAR':'ZENITH',image:c.sourceArt,power:80000,basePower:80000}));
const cards=[...ICON_LIVE_CARDS.map(c=>({id:c.cardId,title:c.name,grade:'ICON',image:c.sourceArt,power:180000,basePower:180000})),...normal],initial=[...cards.slice(0,2),...normal],deck=initial.map(c=>c.id);
const user={id:7,serverUserId:7,nickname:'ICON 성능 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const f=iconFurFixture(),[prepared]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards:initial}],'PVP',{fresh:true,batched:true});
const party=initial.map(c=>({...c,iconRole:prepared.cards.find(x=>x.id===c.id).iconRole}));
const furs=fur15ReferenceCards(live.cards,live.battle,live.high).filter(c=>c.uniqueAbility).slice(0,2),enemy=[...furs,...normal];
const monster={id:1,name:'검수 보스',image:'assets/cards/monster/sla2.jfif',battlePower:4000000,battle_power:4000000,is_boss:1,isBoss:true,pveTab:'NORMAL'};
const energy={energy:10,maxEnergy:10,costPerBattle:1,rechargeMinutes:30},rules={deckSize:5,gradeLimits:{PRESTIGE:2,FUR:2,ZENITH:2,SUPERSTAR:1,ICON:2}};
const snapshots={PVE:createPveBattleV2({cards:party,monster,seed:21}),PVP:createPvpBattleV2({attackerCards:party,defenderCards:enemy,seed:21})};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report=[];
try{for(const [width,mode] of [[1440,'PVP'],[390,'PVE']]){
 const page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[],dialogs=[],posts=[];
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
 await page.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');localStorage.setItem('cnine_pve_view_mode','deck');},user);
 await page.route('**/api/**',async route=>{
  const key=new URL(route.request().url()).pathname.slice(5),request=route.request();let data;
  if(request.method()==='POST')posts.push(key);
  const battleConfig={settings:{enabled:true},deckRules:rules,deck,monsters:[monster],energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};
  else if(key==='me/collection')data={collection:user};
  else if(key==='cards')data={cards};
  else if(key==='battle/config')data=battleConfig;
  else if(key==='pvp/config')data={...battleConfig,profile:{season_score:1000,tier:{id:'bronze',name:'브론즈',min:0}},presets:{1:deck,2:[],3:[]}};
  else if(key==='pvp/match')data={opponent:{id:8,nickname:'FUR +15 검수 상대',season_score:1000},matchToken:'local-icon-ticket'};
  else if(key==='battle/deck'||key==='pvp/deck')data={ok:true,deck:request.postDataJSON().cardIds,magicCardIds:[]};
  else if(key==='battle/fight'||key==='pvp/fight'){const m=key==='battle/fight'?'PVE':'PVP',b=snapshots[m];data={result:b.result.winner==='A'?'WIN':'LOSE',battleV2:b,monster,user,energy,reward:0,coinReward:0,scoreChange:24,scoreAfter:1024,attackerDeck:party,defenderDeck:enemy,difficulty:{difficulty:'NORMAL'},serverNow:new Date().toISOString()};}
  else return route.continue();
  return route.fulfill({json:data});
 });
 await page.goto(origin+'/?screen=battle',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function'&&window.IconRoles);
 await page.evaluate(()=>renderShell('battle'));await page.locator('#battleDeck [data-remove]').first().waitFor();
 // Actual player picker: remove all, add two ICONs, reject the third.
 while(await page.locator('#battleDeck [data-remove]').count())await page.locator('#battleDeck [data-remove]').first().click();
 for(const c of cards.slice(0,3))await page.locator('#battleCards [data-pick="'+c.id+'"]').click();
 assert.ok(dialogs.some(x=>x.includes('최대 2장')));
 assert.equal(await page.locator('#battleDeck [data-remove]').count(),2);
 for(const c of normal)await page.locator('#battleCards [data-pick="'+c.id+'"]').click();
 await page.screenshot({path:path.join(out,width+'-deck.png')});
 await page.evaluate(c=>IconRoles.open(c),cards[0]);await page.locator('.ir-superiority').waitFor();
 assert.match(await page.locator('.ir-superiority').innerText(),/20%/);assert.match(await page.locator('.ir-superiority').innerText(),/최대 2장/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:path.join(out,width+'-detail.png')});await page.locator('.ir-close').click();
 if(mode==='PVP'){
  await page.evaluate(()=>{pvpState.tab='match';renderShell('pvp')});await page.locator('#rankedMatchStart:not([disabled])').waitFor();await page.locator('#rankedMatchStart').click();
 }else{
  if(await page.locator('#saveBattleDeck').isVisible())await page.locator('#saveBattleDeck').click();
  await page.locator('#pveV2GoHunt').click();await page.locator('#battleStart').click();
 }
 await page.locator('#modal canvas').waitFor({timeout:60000});
 await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics()?.iconRoles?.metrics?.skills>0,null,{timeout:60000});
 await page.screenshot({path:path.join(out,width+'-battle.png')});
 await page.locator('.v3-report-confirm, #pveResultConfirm').first().waitFor({timeout:120000});
 const diagnostics=await page.evaluate(()=>ProjectVPixiBattle.diagnostics().iconRoles);
 assert.equal(diagnostics.metrics.serverRows,diagnostics.metrics.appliedRows);
 await page.screenshot({path:path.join(out,width+'-result.png')});
 await page.locator('.v3-report-confirm, #pveResultConfirm').first().click();
 await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));
 assert.ok(posts.includes(mode==='PVE'?'battle/fight':'pvp/fight'));assert.deepEqual(errors,[]);
 report.push({width,mode,twoAllowedThreeBlocked:true,detail:true,realStartButton:true,resultAndReturn:true,diagnostics,posts,errors});console.log(JSON.stringify(report.at(-1)));await page.close();
}}catch(e){for(const c of browser.contexts())for(const p of c.pages()){await p.screenshot({path:path.join(out,'failure.png')});console.log((await p.locator('body').innerText()).slice(-3000));}throw e;}finally{fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();f.close();}

