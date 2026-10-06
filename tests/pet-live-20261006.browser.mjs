import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.QA_OUTPUT_DIR;
if(!out||path.resolve(out).startsWith(path.resolve(root)))throw Error('External QA output required');
await mkdir(out,{recursive:true});const f=await petLiveFixture(),hunt=await legionFixture(),errors=[],results=[],traffic=[];let truncate=false;
const cards=REVIEW_DECK.map(c=>({...c,rarity:c.grade,basePower:c.power,power:c.power*10})),deck=cards.map(c=>c.id);
const monster={id:1,name:'슬라임',battle_power:1800000,battlePower:1800000,image:'assets/cards/monster/sla2.jfif'};
const energy={energy:30,maxEnergy:30,costPerBattle:1,rechargeMinutes:30};
const user={id:2,serverUserId:2,nickname:'펫 전투 검수',role:'USER',coin:100000,pigCoin:0,masterStars:0,owned:deck,quantities:Object.fromEntries(deck.map(c=>[c,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const policy=await hunt.configure();policy.mode='ON';await hunt.call('admin/legion-hunt',{policy},{method:'PATCH'});hunt.setUser(hunt.player);hunt.deps.now=()=>Date.now();
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://qa.test'),p=url.pathname;
  if(p==='/review/'){
   const init='<base href="/"><script>localStorage.setItem("cnine_card_user_v10",'+JSON.stringify(JSON.stringify(user))+');localStorage.setItem("cnine_card_api_token","fixture-user");localStorage.setItem("cnine_battle_sound","OFF");localStorage.setItem("cnine_pve_view_mode","deck");</script>';
   res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});res.end((await readFile(path.join(root,'index.html'),'utf8')).replace('<head>','<head>'+init));return;
  }
  if(p.startsWith('/api/')){
   let body='';for await(const chunk of req)body+=chunk;
   const key=p.slice(5),input=JSON.parse(body||'{}');traffic.push(key);
   if(key.startsWith('legion-hunt/')){
    hunt.setDeck({ids:deck,cards,pet:await loadPetBattleSnapshot(f.env,2),battleSettings:{engine:{}},characterBonus:{}});
    const r=await hunt.call(key,req.method==='GET'?undefined:input);return json(res,r.body,r.status);
   }
   if(!key.startsWith('pets/')&&!key.startsWith('admin/')){
    let data;
    if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};
    else if(key==='cards')data={cards};
    else if(key==='battle/config')data={deck,deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},monsters:[monster],settings:{enabled:true},energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
    else if(key==='battle/deck')data={deck:input.cardIds};
    else if(key==='battle/fight'){
     const battleV2=createPveBattleV2({cards,pet:await loadPetBattleSnapshot(f.env,2),monster,seed:37});
     data={battleV2,monster,result:battleV2.result.winner==='A'?'WIN':'LOSE',reward:100,user,energy,playerPower:3000000,monsterPower:1800000,serverNow:new Date().toISOString()};
    }else if(key==='pvp/fight'){
     const pet=await loadPetBattleSnapshot(f.env,2,'PVP'),battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:pet,defenderPet:{...pet,ownerId:3},seed:37});
     data={battleV2,result:battleV2.result.winner==='A'?'WIN':'LOSE',opponent:'상대 펫 검수',scoreAfter:1020,scoreChange:20,coinReward:100,coinAfter:100100,attackerPower:3000000,defenderPower:3000000,energy,serverNow:new Date().toISOString()};
    }else data={'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    return json(res,data);
   }
   const r=await f.call(p.slice(5),{method:req.method,...(body?{body:JSON.parse(body)}:{}),user:p.startsWith('/api/admin/')?9:2});
   res.writeHead(r.status,{'content-type':'application/json'});
   if(truncate&&p.endsWith('/potential')&&req.method==='POST'&&r.status===200){truncate=false;res.end();return;}res.end(JSON.stringify(r.body));return;
  }
  let route=decodeURIComponent(p);if(route.endsWith('/'))route+='index.html';
  const file=path.resolve(root,'.'+route);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('outside');
  const data=await readFile(file),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg'};
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch(e){res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const shot=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
const fit=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
  if(process.env.QA_VIEWPORT&&process.env.QA_VIEWPORT!==label)continue;
  await f.write('pet_potentials_v1:2',{revision:0,pets:{}});await f.pg.query("UPDATE cnine_user_inventory SET quantity=5,unseen_quantity=5");
  const context=await browser.newContext({viewport,hasTouch:label==='mobile',isMobile:label==='mobile',serviceWorkers:'block'});await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','fixture-user');localStorage.setItem('cnine_admin_token','fixture-owner');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(label+': '+e.message));page.on('dialog',d=>d.accept());
  if(!process.env.QA_BATTLE_ONLY){
  await page.goto(base+'/pets/');await page.locator('[data-pet-select]').first().waitFor();
  if(await page.locator('[data-pet-equip]').isEnabled()){await page.locator('[data-pet-equip]').click();await page.locator('[data-pet-status]').filter({hasText:/장착을 저장/}).waitFor();}
  assert.match(await page.locator('[data-pet-equipped]').textContent(),/봉순/);await fit(page);
  const cms=await context.newPage();cms.on('pageerror',e=>errors.push(label+' CMS: '+e.message));
  await cms.goto(base+'/preview/companion-preparation-v2/');await cms.locator('[data-status]').filter({hasText:/설정을 불러왔습니다/}).waitFor();await cms.locator('[data-potential-save]:enabled').waitFor();
  await cms.locator('[data-potential-chance]').fill('0');await cms.locator('[data-potential-enabled]').check();await cms.locator('[data-potential-save]').click();await cms.locator('[data-potential-status]').filter({hasText:/저장 완료/}).waitFor();await fit(cms);await shot(cms,label+'-cms');
  await page.locator('[data-pet-refresh]').click();await page.locator('[data-pet-potential-attempt]:enabled').waitFor();await page.locator('[data-pet-potential-attempt]').click();await page.locator('[data-pet-status]').filter({hasText:/얻지 못했습니다/}).waitFor();assert.equal(await f.balance(),4);await shot(page,label+'-potion');
  await cms.locator('[data-potential-chance]').fill('100');await cms.locator('[data-potential-save]').click();await cms.locator('[data-potential-status]').filter({hasText:/저장 완료/}).waitFor();
  await page.locator('[data-pet-refresh]').click();await page.locator('[data-pet-potential-attempt]:enabled').waitFor();truncate=true;await page.locator('[data-pet-potential-attempt]').click();await page.locator('[data-pet-potential-attempt]').filter({hasText:'도전 결과 재확인'}).waitFor();assert.equal(await f.balance(),3);
  await page.reload();await page.locator('[data-pet-potential-attempt]').filter({hasText:'도전 결과 재확인'}).click();await page.locator('[data-pet-status]').filter({hasText:/획득했습니다/}).waitFor();assert.equal(await f.balance(),3);assert(await page.locator('[data-pet-potential-attempt]').isDisabled());await fit(page);await shot(page,label+'-magnet');
  }else{await f.equip();await f.write('pet_potentials_v1:2',{revision:1,pets:{'PET-BONGSOON':{potential:'MAGNET',attempts:1}}});}
  const battles=[];
  for(const mode of ['pve','pvp']){
   await page.goto(base+'/review/?screen=battle');
   await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:45000});
   if(mode==='pve'){
    if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();
    await page.locator('#battleStart').click();
   }else await page.evaluate(async()=>{
    const data=await fetch('/api/pvp/fight',{method:'POST',body:'{}'}).then(r=>r.json());
    await window.ensureFeatureResources('battleV2');const modal=document.querySelector('#modal');
    const live=window.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName:'펫 전투 검수',opponentName:'상대 펫 검수'});
    window.__pvpDone=false;window.playPvpBattleV2Live({...live,modal,data}).then(()=>window.__pvpDone=true);
   });
   let diag;
   for(let tries=0;tries<360;tries++){
    diag=await page.evaluate(async count=>{
    if(!document.querySelector('.battle-v3-canvas-host canvas')||!window.ProjectVPixiBattle?.diagnostics().mounted)return null;
    const e=await window.ProjectVPixiBattle.mount(),actor=a=>({cardId:a.cardId,kind:(a.root.projectVBattleArt||a.root.projectVMonsterArt)?.kind,url:(a.root.projectVBattleArt||a.root.projectVMonsterArt)?.primaryUrl,textureWidth:a.texture?.width,visible:a.root.visible&&a.root.alpha>0});
    if(e.petSupports?.size!==count||![...e.petSupports.values()].every(r=>r.applied&&r.root.visible&&r.root.alpha>.8))return null;
    return {runtime:ProjectVPixiBattle.runtimeVersion,allies:e.allies.map(actor),enemies:e.enemies.filter(a=>a.battleActive).map(actor),pets:[...e.petSupports.values()].map(r=>({code:r.snapshot.definition.code,applied:r.applied,visible:r.root.visible&&r.root.alpha>0,textureWidth:r.sprite.texture.width})),fallbacks:e.activeFallbackArt.length};
    },mode==='pvp'?2:1);
    if(diag)break;await new Promise(resolve=>setTimeout(resolve,250));
   }
   assert(diag,'main battle must apply the pet opening');
   assert.equal(diag.allies.length,5);assert.equal(diag.enemies.length,mode==='pvp'?5:1);assert.equal(diag.fallbacks,0);
   assert(diag.allies.concat(diag.enemies).every(a=>a.url&&a.textureWidth>10&&a.visible),'registered SD textures must be visible');
   assert(diag.pets.every(p=>p.applied&&p.visible&&p.textureWidth>10));
   await shot(page,label+'-'+mode);battles.push({mode,...diag});console.log(label,mode,'real main V3 with registered SD',diag.allies.map(a=>a.cardId));
   if(process.env.QA_CAPTURE_ONLY)continue;
   if(mode==='pve')await page.locator('#pveResultConfirm').waitFor({timeout:120000});
   else await page.waitForFunction(()=>window.__pvpDone,null,{timeout:120000});
  }
  await page.goto(base+'/review/?screen=battle');await page.waitForFunction(()=>typeof window.openLegionHunt==='function');
  await page.evaluate(()=>window.openLegionHunt());await page.locator('[data-hunt-enter]:enabled').click();
  const frame=page.frameLocator('iframe[title="군단토벌 전투"]');
  await frame.locator('#hunt-picked').filter({hasText:/[1-9]/}).waitFor({timeout:120000});
  assert.equal(traffic.filter(p=>p==='legion-hunt/claim').length,0,'magnet must not fabricate manual clicks');
  await shot(page,label+'-legion');await frame.locator('#hunt-stop').click();await frame.locator('#hunt-result[open]').waitFor({timeout:30000});
  assert.match(await frame.locator('#result-picked').textContent(),/[1-9]/);
  results.push({viewport:label,potentialUi:process.env.QA_BATTLE_ONLY?'not-run':'passed including lost-reply recovery',battles,mainBattleResults:process.env.QA_CAPTURE_ONLY?'not-run':'passed',mainLegionAutomaticPickup:true,legionSettlement:true});await writeFile(path.join(out,label+'-report.json'),JSON.stringify(results.at(-1),null,2));await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'browser-report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}catch(error){
 const pages=browser.contexts().flatMap(c=>c.pages());for(let i=0;i<pages.length;i++){await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png'),fullPage:true});await writeFile(path.join(out,'failure-'+i+'.html'),await pages[i].content());}
 console.error(JSON.stringify({errors,traffic:traffic.slice(-20)}));throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();await hunt.close();}
