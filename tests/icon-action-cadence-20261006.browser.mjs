// Actual main index, resource loader, registered SD adapters and live wrappers.
// Only local account/API fixtures; no production battles or inventory writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_CARD_ROSTER} from '../shared/icon-card-roster-v1.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.QA_OUTPUT_DIR;
assert(out&&!path.resolve(out).startsWith(path.resolve(root)));fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/helpers/icon-apocalypse-20261006.json')));
const roles=JSON.parse(fs.readFileSync(path.join(root,'tests/helpers/icon-cadence-roles-20261006.json')));
const suitManifest=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json')));
const suit=suitManifest.suits.find(s=>s.code==='BATTLE_SUIT_03'),weapon=suitManifest.weapons.find(w=>w.equipmentCode==='EQ_1785427638137');
assert(suit?.image&&weapon?.battleSprite);
const scenarios=[];
for(const indices of [[0,1],[2,3],[4,5],[6,3]])for(const mode of ['PVE','PVP']){
 const icons=indices.map(i=>{const d=ICON_ROLES[i],card={id:d.cardId,title:d.name,name:d.name,grade:'ICON',rarity:'ICON',power:180000,image:'/'+ICON_CARD_ROSTER[i].sourceArt,startingHpPercent:60};return {...card,iconRole:{...iconRoleSnapshot(card,roles.document,mode,roles.revision),supremacy:fixture.iconArgs.cards[2].iconRole.supremacy}};});
 const cards=[icons[0],...REVIEW_DECK.slice(1,4).map(c=>({...c,power:180000,startingHpPercent:60})),icons[1]];
 let battleV2;
 for(let seed=1;seed<=30;seed++){
  battleV2=mode==='PVE'?createPveBattleV2({...structuredClone(fixture.iconArgs),cards,characterBonus:10000000,seed,battleSuit:{code:suit.code,pvePower:300000,weapon:{code:weapon.equipmentCode},skillChips:['SKILL_CHIP_ROCKET_LAUNCHER']}}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerEquipmentBonus:2500000,defenderEquipmentBonus:2500000,seed});
  if(icons.every(c=>battleV2.result.timeline.some(e=>e.type==='ICON_SKILL'&&e.actorId===battleV2.teams.A.cards.find(a=>a.cardId===c.id).id)))break;
 }
 for(const c of icons)assert(battleV2.result.timeline.some(e=>e.type==='ICON_SKILL'&&e.actorId===battleV2.teams.A.cards.find(a=>a.cardId===c.id).id),c.title+' must cast in browser fixture');
 if(process.env.QA_EVENT_LIMIT)battleV2.result.timeline=battleV2.result.timeline.slice(0,Number(process.env.QA_EVENT_LIMIT));
 scenarios.push({mode,indices,cards,data:{battleV2,...(mode==='PVE'?{monster:fixture.iconArgs.monster,equippedBattleSuit:{code:suit.code,appearance:{battleSprite:suit.image,battleHeight:278}},equippedWeapon:{code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}}}:{}),result:battleV2.result.winner==='A'?'WIN':'LOSE',reward:0,coinReward:0,scoreAfter:1000,scoreChange:0,playerPower:10000000,monsterPower:7500000,opponent:'ICON 행동 검수'}});
}
const entryCards=scenarios[0].cards,entryDeck=entryCards.map(c=>c.id),entryMonster={id:1,name:'일반 토벌 검수',image:'assets/cards/monster/sla2.jfif',battlePower:4000000,battle_power:4000000,is_boss:1,isBoss:true,pveTab:'NORMAL'};
const entryBattles={PVE:createPveBattleV2({cards:entryCards,monster:entryMonster,characterBonus:2500000,seed:21}),PVP:scenarios[1].data.battleV2};
const energy={energy:10,maxEnergy:10,costPerBattle:1,rechargeMinutes:30};
const user={id:2,serverUserId:2,nickname:'ICON 행동 검수',role:'USER',coin:100,owned:entryDeck,quantities:Object.fromEntries(entryDeck.map(id=>[id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://qa.test'),p=url.pathname;
 if(p==='/qa-battle')return json(res,scenarios[Number(url.searchParams.get('i'))].data);
 if(p==='/review/'){
  const init='<base href="/"><script>localStorage.setItem("cnine_card_user_v10",'+JSON.stringify(JSON.stringify(user))+');localStorage.setItem("cnine_card_api_token","fixture-only");localStorage.setItem("cnine_battle_sound","OFF");localStorage.setItem("cnine_pve_view_mode","deck");</script>';
  res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head>'+init));
 }
 if(p.startsWith('/api/')){
  const config={settings:{enabled:true},deckRules:{deckSize:5,gradeLimits:{ICON:2,FUR:2,ZENITH:5,SUPERSTAR:5}},deck:entryDeck,monsters:[entryMonster],energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  if(p==='/api/battle/config')return json(res,config);
  if(p==='/api/pvp/config')return json(res,{...config,presets:{1:entryDeck,2:[],3:[]},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈',min:0}}});
  if(p==='/api/pvp/match')return json(res,{token:'local-entry',opponent:{id:3,nickname:'검수 상대',season_score:1000}});
  if(p==='/api/battle/fight'||p==='/api/pvp/fight'){
   const mode=p.includes('/pvp/')?'PVP':'PVE',b=entryBattles[mode];
   return json(res,{result:b.result.winner==='A'?'WIN':'LOSE',battleV2:b,...(mode==='PVE'?{monster:entryMonster}:{}),user,energy,reward:0,coinReward:0,scoreChange:0,scoreAfter:1000,attackerDeck:entryCards,defenderDeck:entryCards,difficulty:{difficulty:'NORMAL'},serverNow:new Date().toISOString()});
  }
  return json(res,(['me','me/summary'].includes(p.slice(5))?{user,prison:{incarcerated:false}}:p==='/api/me/collection'?{collection:user}:p==='/api/cards'?{cards:scenarios.flatMap(s=>s.cards)}:p==='/api/service/status'?{maintenance:{active:false}}:{visible:false,enabled:false,items:[],cards:[],packs:[],messages:[],unread:0,loadouts:[],settings:{}}));
 }
 let file=path.resolve(root,'.'+decodeURIComponent(p));assert(file.startsWith(root));if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.jpg':'image/jpeg'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 await Promise.all((process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[1440,390]).map(async width=>{
  const context=await browser.newContext({viewport:{width,height:width===390?844:1050},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(let i=0;i<scenarios.length;i++){
   if(process.env.QA_ENTRY_ONLY)continue;
   if(process.env.QA_CASE&&i!==Number(process.env.QA_CASE))continue;
   const s=scenarios[i],name=width+'-'+s.mode+'-'+s.indices.join('-');
   await page.goto(base+'/review/?screen=home');await page.waitForFunction(()=>typeof window.ensureFeatureResources==='function');
   await page.evaluate(async({i,mode})=>{
    const data=await fetch('/qa-battle?i='+i).then(r=>r.json());await window.ensureFeatureResources('battleV2');
    const modal=document.querySelector('#modal'),live=window.prepareBattleV2LiveLoading({modal,mode,playerName:'ICON 행동 검수',opponentName:'검수 상대'});
    window.__iconDone=false;window.__iconError=null;
    const play=mode==='PVE'?window.playPveBattleV2Live:window.playPvpBattleV2Live;
    play({...live,modal,data,monster:data.monster}).then(()=>{window.__iconDone=true;live.msg.innerHTML=window.ProjectVBattleV3Live.resultHtml({mode,data,win:data.result==='WIN',result:data.battleV2.result});}).catch(e=>{window.__iconError=e.message;});
   },{i,mode:s.mode});
   let visible;
   for(let n=0;n<240;n++){
    visible=await page.evaluate(async({ids,mode})=>{
     if(!document.querySelector('.battle-v3-canvas-host canvas')||!window.ProjectVPixiBattle?.diagnostics().mounted)return null;
     const e=await window.ProjectVPixiBattle.mount(),actors=[...e.allies,...e.enemies.filter(a=>a.battleActive)];
     if(!e.__iconTrace){e.__iconTrace=[];const play=e.playEvents.bind(e);e.playEvents=async(events,options)=>{const row={events:events.map(x=>({seq:x.seq,type:x.type,actorId:x.actorId,status:x.status,actorFound:!!e.combatantById(x.actorId)})),before:structuredClone(e.iconPlaybackMetrics||{}),epoch:e.playbackEpoch};e.__iconTrace.push(row);const result=await play(events,options);row.after=structuredClone(e.iconPlaybackMetrics||{});row.last=structuredClone(e.lastIconPlayback||{});row.endEpoch=e.playbackEpoch;return result;};const timeline=e.timeline.bind(e);e.timeline=async(...args)=>{const row={animationOwners:args[3]?.owners?.map(x=>x.id),releaseAt:args[3]?.releaseAt,time:performance.now()};e.__iconTrace.push(row);const result=await timeline(...args);row.result=result;row.ended=performance.now();return result;};}
     const rows=actors.map(a=>({id:a.cardId,url:(a.root.projectVBattleArt||a.root.projectVMonsterArt)?.primaryUrl,width:a.texture?.width,visible:a.root.visible&&a.root.alpha>.8}));
     return !e.activeFallbackArt.length&&ids.every(id=>e.allies.some(a=>a.cardId===id))&&rows.length>=(mode==='PVP'?10:6)&&rows.every(a=>a.url&&a.width>10&&a.visible)?{actors:rows,fallbacks:e.activeFallbackArt.length,runtime:ProjectVPixiBattle.runtimeVersion}:null;
    },{ids:s.indices.map(n=>ICON_ROLES[n].cardId),mode:s.mode});
    if(visible)break;await new Promise(r=>setTimeout(r,250));
   }
   assert(visible,name+' registered SDs must be visible');assert.equal(visible.fallbacks,0);
   await page.waitForTimeout(700);await page.screenshot({path:path.join(out,name+'-battle.png')});
   await page.waitForFunction(()=>window.__iconDone||window.__iconError,null,{timeout:180000});
   const state=await page.evaluate(async()=>{const e=await ProjectVPixiBattle.mount();return {error:window.__iconError,metrics:ProjectVPixiBattle.diagnostics().iconRoles.metrics,trace:e.__iconTrace,last:e.lastIconPlayback};});assert.equal(state.error,null);
   const expected=s.data.battleV2.result.timeline.filter(e=>e.type==='ICON_SKILL');
   fs.writeFileSync(path.join(out,name+'-trace.json'),JSON.stringify({state,expected,timeline:s.data.battleV2.result.timeline},null,2));
   assert.equal(state.metrics.skills,expected.length,name+' no missing skill playback');assert.equal(state.metrics.appliedRows,state.metrics.serverRows,name+' all impacts applied');
   assert.deepEqual([...state.metrics.roles].sort(),[...new Set(expected.map(e=>e.iconRole))].sort());
   await page.screenshot({path:path.join(out,name+'-result.png')});
   assert(await page.locator('.v3-report-confirm').isVisible());
   reports.push({name,mainLoader:true,serverSkills:expected.length,...state,visible});
   fs.writeFileSync(path.join(out,width+'-report.json'),JSON.stringify(reports.filter(r=>r.name.startsWith(width+'-')),null,2));console.log(name+' passed: '+expected.length+' skills, '+state.metrics.appliedRows+' impacts');
  }
  if(process.env.QA_ENTRY_ONLY)for(const mode of ['PVE','PVP']){
   const name=width+'-'+mode+'-entry',posts=[];
   const capture=request=>{if(request.method()==='POST')posts.push(new URL(request.url()).pathname);};page.on('request',capture);
   await page.goto(base+'/review/?screen='+(mode==='PVE'?'battle':'pvp'));
   if(mode==='PVE'){
    await page.locator('#pveV2GoHunt').waitFor();await page.locator('#pveV2GoHunt').click();await page.locator('#battleStart').click();
   }else{await page.locator('#rankedMatchStart:not([disabled])').waitFor();await page.locator('#rankedMatchStart').click();}
   await page.locator('#modal canvas').waitFor({timeout:60000});
   await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics()?.iconRoles?.metrics?.skills>0,null,{timeout:60000});
   await page.screenshot({path:path.join(out,name+'-battle.png')});
   const confirm=page.locator('.v3-report-confirm, #pveResultConfirm').first();await confirm.waitFor({timeout:120000});
   const metrics=await page.evaluate(()=>ProjectVPixiBattle.diagnostics().iconRoles.metrics);
   assert.equal(metrics.skills,entryBattles[mode].result.timeline.filter(e=>e.type==='ICON_SKILL').length);assert.equal(metrics.serverRows,metrics.appliedRows);
   await page.screenshot({path:path.join(out,name+'-result.png')});await confirm.click();await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));
   assert(posts.includes('/api/'+(mode==='PVE'?'battle':'pvp')+'/fight'));page.off('request',capture);
   reports.push({name,actualStartButton:true,resultAndReturn:true,metrics,posts});console.log(name+' passed: start button, battle, result and return');
  }
  assert.deepEqual(errors,[]);await context.close();
 }));
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({reports,errors:[]},null,2));
}catch(e){for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries())await p.screenshot({path:path.join(out,'failure-'+i+'.png')});throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));}
