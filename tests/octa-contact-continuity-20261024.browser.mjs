// Actual lobby entry buttons + production battle renderer, isolated API fixtures.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CLOCK,skillChipByCode} from '../shared/battle-suit-skill-chips.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
const root=path.resolve(import.meta.dirname,'..'),publicBase=process.env.QA_PUBLIC_BASE||'',baseline=process.env.QA_BASELINE==='1';
const out=process.env.QA_OUT||path.join(root,'docs/qa/octa-contact-continuity-20261024/local');fs.mkdirSync(out,{recursive:true});
if(publicBase)assert.equal(new URL(publicBase).hostname,'cnine-card.pages.dev');
const CODE='SKILL_CHIP_OCTA_SEEKER',chip=skillChipByCode(CODE),errors=[],missing=[],traffic=[],checks=[],publicFiles=new Map();
async function publicFile(url){
 const key=new URL(url,publicBase).href;
 if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(key,{signal:AbortSignal.timeout(30000)});assert(r.ok,key+': '+r.status);return {bytes:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')};})());
 return publicFiles.get(key);
}
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const cards=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,rarity:c.grade,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,power:400000,basePower:400000,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'))).sprites.find(m=>m.monsterId===68);
const monster={id:68,name:m.name,title:m.name,image:'/'+m.sourceArt,battlePower:1e7,battle_power:1e7,isBoss:false,is_boss:0,pveTab:'NORMAL',pve_hp_percent:1200,pve_attack_percent:1,pve_shield_percent:0,pve_speed_percent:1};
const suit={code:'BATTLE_SUIT_03',pvePower:300000,weapon:{code:'EQ_1785427638137'},skillChips:[CODE]};
const battle=createPveBattleV2({cards,battleSuit:suit,monster,seed:2011});
const cast=battle.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'),target=battle.teams.B.cards[0];
const rows=[{...cast,combatAtMs:0},...chip.impactOffsetsMs.map((at,i)=>({type:'SKILL_CHIP_HIT',chipCode:CODE,castId:cast.castId,targetId:cast.targetId,hitIndex:i,hitCount:8,damage:10,targetHpAfter:target.maxHp*(1-(i+1)/8),targetMaxHp:target.maxHp,combatAtMs:at})),{type:'RESULT',winner:'A',combatAtMs:4500}];
rows.splice(2,0,{type:'KO',targetId:'qa-retiring-slot',combatAtMs:1040},{type:'TURN',targetId:'qa-retiring-slot',combatAtMs:1050,combatGroupDurationMs:500});
battle.result.timeline=rows.map((e,i)=>({...e,seq:i+1,combatClock:SKILL_CHIP_CLOCK,combatGroup:i}));battle.result.winner='A';
const energy={energy:5,maxEnergy:5,costPerBattle:1,rechargeMinutes:30},deck=cards.map(c=>c.id);
const roster=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}).cards.filter(c=>['V-999','V-998','V-997'].includes(c.code));
assert.equal(roster.length,3);
const rankedSeries={codes:roster.map(c=>c.code),cards:roster,ownedCount:3,ready:true,revision:1};
const user={id:7,serverUserId:7,nickname:'유도탄 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:deck,quantities:Object.fromEntries(deck.map(id=>[id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;
 if(route.startsWith('/api/')){
  const key=route.slice(5);let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw||'{}');let data;
  if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};
  else if(key==='cards')data={cards};
  else if(key==='battle/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,monsters:[monster],energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  else if(key==='pvp/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,presets:{1:deck,2:[],3:[]},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈'}},battleEngine:{active:true},rankedSeries,energy,serverNow:new Date().toISOString()};
  else if(key==='battle/deck')data={deck:body.cardIds};
  else if(key==='battle/fight'){traffic.push(key);data={result:'WIN',reward:0,coinReward:0,battleV2:structuredClone(battle),monster,equippedBattleSuit:{code:suit.code,pvePower:suit.pvePower},equippedWeapon:{code:suit.weapon.code},user,energy,serverNow:new Date().toISOString()};}
  else if(key==='pvp/match'){traffic.push(key);data={token:'local-pvp-test',opponent:{id:3,nickname:'입장 회귀 상대',power:10000}};}
  else if(key==='pvp/fight'){traffic.push(key);const battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards.map(c=>({...c,power:10,basePower:10})),seed:21});data={result:'WIN',scoreAfter:1020,scoreChange:20,coinReward:0,coinAfter:100,opponent:'입장 회귀 상대',energy,battleV2,serverNow:new Date().toISOString()};}
  else data={'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return json(res,data);
 }
 if(publicBase){const file=await publicFile(route+url.search);res.writeHead(200,{'content-type':file.type,'cache-control':'no-store'});return res.end(file.bytes);}
 let file=path.resolve(root,'.'+decodeURIComponent(route));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){missing.push(route);return res.writeHead(404).end();}
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.mp4':'video/mp4'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){errors.push(e.stack);json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,width,height]of (baseline?[['before',1440,1000]]:[['desktop',1440,1000],['mobile',390,844]])){
  const page=await browser.newPage({viewport:{width,height},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
  page.on('pageerror',e=>errors.push(label+': '+e.stack));page.on('dialog',d=>void d.accept());
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','octa-local-review');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_pve_view_mode','deck');},user);
  await page.goto(base+'/?screen=battle');await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:30000});
  if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();
  await page.evaluate(async()=>{
   await ensureFeatureResources('battleV2');
   const api=ProjectVPixiBattle,mount=api.mountForBattle;
   api.mountForBattle=async(...args)=>{const e=await mount(...args);window.octaEngine=e;const play=e.playEvents;
    e.playEvents=async function(events,options){if(options?.timedInternal&&events[0]?.targetId==='qa-retiring-slot'){if(events[0].type==='KO')await new Promise(r=>window.releaseRetirement=r);return;}return play.call(this,events,options);};
    return e;};
  });
  await page.locator('#battleStart').click();
  await page.waitForFunction(()=>window.octaEngine?.skillChipPlayback?.fx.size===1,null,{timeout:60000});
  await page.evaluate(()=>{const p=octaEngine.skillChipPlayback;p.timeline.pause();window.contactSamples=[];const show=octaEngine.showAccountBattleUnitDamage;octaEngine.showAccountBattleUnitDamage=function(...args){contactSamples.push(p.clock.time);return show.apply(this,args);};p.audio.presentationLead=()=>.18;});
  const samples=[];
  for(const time of [.34,.72,1,1.02,1.04,1.08,1.14,1.2,1.26,1.32,1.38,1.44,1.7,2.1,3.3]){
   const sample=await page.evaluate(async time=>{const p=octaEngine.skillChipPlayback;p.timeline.time(time,true);p.pump();await new Promise(r=>requestAnimationFrame(r));const fx=[...p.fx.values()][0]?.fx;return {time,hits:p.hits,waiting:p.waiting,fx:fx?.diagnostics(),rockets:fx?.rockets.map(r=>({visible:r.body.visible,x:r.body.x,y:r.body.y,frame:r.body.texture.uid})),contacts:[...contactSamples],canvas:document.querySelectorAll('#pvPixiBattle canvas').length};},time);samples.push(sample);
   if([.72,1.14,1.7].includes(time))await page.screenshot({path:path.join(out,label+'-'+time+'.png')});
  }
  if(baseline){assert.equal(samples.at(-1).hits,1);assert.equal(samples.at(-1).fx.activeRockets,7);checks.push({label,reproduced:true,samples});console.log('BEFORE: seven missiles frozen behind unrelated retirement');await page.close();continue;}
  assert.equal(samples.at(-1).hits,8);assert.equal(samples.at(-1).fx,undefined);assert(samples.every(s=>s.canvas===1));
  const contacts=samples.at(-1).contacts;assert.equal(contacts.length,8);for(let i=0;i<8;i++)assert(Math.abs(contacts[i]-chip.impactOffsetsMs[i]/1000)<.015);
  const completed=await page.evaluate(async()=>{releaseRetirement();for(let i=0;i<20;i++)await Promise.resolve();const p=octaEngine.skillChipPlayback;p.timeline?.time(4.6,true);p.pump();return {hits:p.hits,allies:octaEngine.allies.length,enemies:octaEngine.enemies.length};});
  await page.locator('#pveResultConfirm').waitFor({timeout:30000});await page.screenshot({path:path.join(out,label+'-result.png')});await page.locator('#pveResultConfirm').click();await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));
  // The unchanged PVP button still enters and leaves the newly versioned engine.
  await page.goto(base+'/?screen=pvp');await page.locator('#rankedMatchStart').waitFor({timeout:30000});await page.locator('#rankedMatchStart').click();
  await page.waitForFunction(()=>!!document.querySelector('#modal.show canvas'),null,{timeout:60000});
  await page.locator('#pvpResultConfirm').waitFor({timeout:90000});await page.locator('#pvpResultConfirm').click();await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));
  checks.push({label,samples,completed,pveEntryResultReturn:true,pvpEntryResultReturn:true});console.log(label+' actual entry, eight impacts and return PASS');await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:baseline?'REPRODUCED':'PASS',publicBase,publicFiles:publicFiles.size,checks,traffic,errors,missing},null,2)+'\n');
}catch(e){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({message:e.stack,checks,errors,missing,traffic},null,2)+'\n');throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
