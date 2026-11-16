// Actual index.html, native navigation and V3 playback. All accounts are isolated.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {emptyHideout,HIDEOUT_KEY,changeHideout} from '../shared/personal-hideout-v1.mjs';
import {handlePersonalHideout,hideoutAwardStatements,readHideout} from '../functions/_personal_hideout.js';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {htmlForStore} from '../functions/_onestore_web.js';
import {canonicalDocument} from '../shared/onestore-web-v1.mjs';
import prestige from '../assets/ui/project-v/characters/prestige/manifest-v1.json' with {type:'json'};
const root=path.resolve(import.meta.dirname,'..'),project='C:/Users/User/Downloads/upload/cnine-card';
const out=path.join(root,'docs/qa/personal-hideout-20261116');fs.mkdirSync(out,{recursive:true});
const cache=new Map(),missing=[],errors=[],traffic=[],reports=[];
let f,variant='after',loseNext=false;
const baseline='a6fc4b936';
const old=new Map(['index.html','js/app.js','js/battle-v2-live.js','js/battle-v3-live.js','js/adventure-lobby-v2107.js','js/soopketmon-v21-exact-shell-adapter.js','js/soopketmon-v21-runtime-router.js'].map(file=>[file,execFileSync('git',['show',baseline+':'+file],{cwd:root,windowsHide:true,maxBuffer:15e6})]));
const read=relative=>{if(variant==='before'&&old.has(relative))return old.get(relative);if(cache.has(relative))return cache.get(relative);let bytes;for(const base of [root,project]){try{bytes=fs.readFileSync(path.join(base,relative));break;}catch{}}if(!bytes)bytes=execFileSync('git',['show','HEAD:'+relative],{cwd:root,windowsHide:true,maxBuffer:40e6,stdio:['ignore','pipe','pipe']});cache.set(relative,bytes);return bytes;};
const cards=prestige.characters.slice(0,5).map((c,i)=>({id:c.cardId,title:c.title,name:c.member,grade:'PRESTIGE',rarity:'PRESTIGE',type:['ATTACK','DEFENSE','SPEED','HP','BALANCED'][i],power:20000000,basePower:20000000,image:c.sourceArt,sourceArt:c.sourceArt}));
const deck=cards.map(c=>c.id),user={id:7,serverUserId:7,nickname:'은신처 격리 검수',role:'USER',coin:1000000,pigCoin:0,masterStars:0,owned:deck,quantities:Object.fromEntries(deck.map(id=>[id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const monster={id:1,name:'검수용 몬스터',image:'/assets/cards/monster/sla2.jfif',image_url:'/assets/cards/monster/sla2.jfif',battlePower:1000,battle_power:1000,rewardCoin:1000,isBoss:false,is_boss:0,pveTab:'NORMAL',pve_difficulty:'NORMAL'},energy={energy:10,maxEnergy:10,costPerBattle:1,rechargeMinutes:15};
const battle=createPveBattleV2({cards,monster,seed:56});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jfif':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webm':'video/webm'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host),endpoint=url.pathname.slice(5),send=(data,status=200,type='application/json')=>res.writeHead(status,{'content-type':type,'cache-control':url.pathname.startsWith('/api/')?'no-store':'public,max-age=3600'}).end(data);
 if(url.pathname.startsWith('/api/')){
  let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text||'{}'),started=performance.now();let data;
  if(endpoint==='hideout'||endpoint.startsWith('hideout/')){
   const response=await handlePersonalHideout({path:endpoint,env:f.env,deps:{json:(data,status)=>Response.json(data,{status}),authenticate:async()=>({id:7}),withUserMutationLock:(_e,_u,_p,fn)=>fn()},request:new Request(url,{method:req.method,headers:{...req.headers,origin:url.origin},...(text?{body:text}:{})})});
   const json=await response.json();traffic.push({variant,path:endpoint,method:req.method,status:response.status,ms:performance.now()-started});
   if(loseNext&&req.method==='POST'&&response.status===200){loseNext=false;return send(JSON.stringify({error:'검수 응답 유실'}),503);}
   return send(JSON.stringify(json),response.status);
  }
  if(['me','me/summary'].includes(endpoint))data={user,prison:{incarcerated:false}};
  else if(endpoint==='cards')data={cards};
  else if(endpoint==='battle/config')data={settings:{enabled:true},deckRules:{gradeLimits:{PRESTIGE:5}},deck,monsters:[monster],energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
  else if(endpoint==='battle/deck')data={deck:body.cardIds};
  else if(endpoint==='battle/fight'){
   const writes=hideoutAwardStatements(f.env,{userId:7,eventId:body.requestId,source:'HUNT',won:true});await f.DB.batch(writes);
   data={result:'WIN',reward:1000,battleV2:structuredClone(battle),monster,difficulty:{difficulty:'NORMAL'},hideoutReward:writes.hideoutAward,user,energy,serverNow:new Date().toISOString()};
  }else if(endpoint==='battle/auto'){
   const count=Number(body.requestedBattles),gains={};
   for(let i=0;i<count;i++){const writes=hideoutAwardStatements(f.env,{userId:7,eventId:body.requestId+'-'+i,source:'HUNT',won:true});await f.DB.batch(writes);for(const [code,n]of Object.entries(writes.hideoutAward))gains[code]=(gains[code]||0)+n;}
   data={status:'COMPLETED',mode:'PVE_SWEEP',difficulty:'NORMAL',energyKind:'STANDARD',energy,user,battles:count,requestedBattles:count,wins:count,losses:0,totalReward:999000000000000*count,magicCrystalTotal:count*100,hideoutRewards:gains,equipmentRewards:Array.from({length:30},(_,i)=>({name:'검수용 장비 '+i,quantity:count})),outcomes:Array.from({length:count},()=>({result:'WIN'})),serverNow:new Date().toISOString()};
  }else data={'loot-shop/balance':{pigCoins:0},'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:null},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[endpoint]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  traffic.push({variant,path:endpoint,method:req.method,status:200,ms:performance.now()-started});return send(JSON.stringify(data));
 }
 if(url.pathname==='/favicon.ico')return send('',204);
 let file=decodeURIComponent(url.pathname).replace(/^\//,'');if(!file||file.endsWith('/'))file+='index.html';assert(!file.includes('..'));
 return send(read(file),200,mime[path.extname(file)]||'application/octet-stream');
}catch(e){missing.push({url:req.url,error:e.message.slice(0,160)});res.writeHead(404).end('not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const frameStats=(page,ms=1000)=>page.evaluate(ms=>new Promise(resolve=>{const times=[];let first,last;const frame=t=>{first??=t;if(last)times.push(t-last);last=t;if(t-first<ms)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);resolve({frames:times.length,p95:times[Math.floor(times.length*.95)],max:Math.max(...times),over50:times.filter(t=>t>50).length});}};requestAnimationFrame(frame);}),ms);
const gameOrigin='https://cnine-card.pages.dev',hostOrigin='https://qa.onestore.net';
const hostHtml=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><script>window.calls=[];addEventListener('message',event=>{if(event.origin!=='${gameOrigin}')return;const data=event.data;if(data?.ch!=='onestore-h5')return;const send=msg=>event.source.postMessage({ch:'onestore-h5',v:1,...msg},event.origin);if(data.type==='hello')return send({type:'handshake'});const msg=data.msg;if(!msg)return;calls.push(msg);if(msg.requestId)send({msg:{requestId:msg.requestId,success:true,data:msg.action==='core.getConfig'?{playerId:'isolated-qa',locale:'ko-KR',safeArea:{top:2,bottom:3,left:0,right:0},ringerSilent:false,supportedActions:['core.ready','core.loadingProgress','core.openDeeplink','core.backConsumed','analytics.report']}:{}}});});</script><iframe onload="this.contentWindow.postMessage({ch:'onestore-h5',v:1,type:'handshake'},'${gameOrigin}')" src="${gameOrigin}/onestore/" allow="autoplay; fullscreen"></iframe>`;
async function openPage(browser,profile){
 cache.clear(); // Identical server memory-cache state for fresh client contexts.
 const context=await browser.newContext({viewport:{width:profile.width,height:profile.width===1440?1000:844},isMobile:profile.width<800,hasTouch:profile.width<800,serviceWorkers:'block'}),outer=await context.newPage();outer.setDefaultTimeout(20000);
 outer.on('pageerror',e=>errors.push({profile:profile.name,variant,error:e.message}));outer.on('dialog',d=>d.accept());
 await context.addInitScript(user=>{if(location.protocol.startsWith('http')){localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');}},user);
 if(profile.h5)await context.route('**/*',async r=>{
  const request=r.request(),url=new URL(request.url());
  if(url.origin===hostOrigin)return r.fulfill({contentType:'text/html',body:hostHtml});
  if(url.hostname==='h5sdk.onestore.net')return r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(project+'/operations/all-platform-runtime-performance-20261108/onestore-h5-sdk.min.js')});
  if(url.origin!==gameOrigin)return r.abort();
  const doc=url.pathname.startsWith('/onestore')?canonicalDocument(url.pathname):null;
  if(doc)return r.fulfill({contentType:'text/html',body:htmlForStore(read(doc==='/'?'onestore/index.html':doc.replace(/^\//,'')).toString(),doc)});
  const response=await fetch(base+url.pathname+url.search,{method:request.method(),headers:{'content-type':request.headers()['content-type']||'application/json'},...(request.postData()?{body:request.postData()}:{})});
  return r.fulfill({status:response.status,contentType:response.headers.get('content-type')||'',body:Buffer.from(await response.arrayBuffer())});
 });else await context.route('https://**/*',r=>r.abort());
 await outer.goto(profile.h5?hostOrigin:base+'/',{waitUntil:'domcontentloaded'});
 if(profile.h5)await outer.frameLocator('iframe').locator('body').waitFor();
 const game=profile.h5?outer.frames().find(frame=>frame.url().startsWith(gameOrigin)):outer;
 if(profile.h5){await game.waitForFunction(()=>window.CNineStoreWeb?.state.status==='ready');assert((await outer.evaluate(()=>calls)).some(call=>call.action==='core.ready'));}
 await outer.addLocatorHandler((profile.h5?outer.frameLocator('iframe'):game).locator('.soop-consent-dialog[open]'),()=>game.locator('[data-soop-close]').first().click());
 const lobby=game.locator('soop-adventure-lobby');await lobby.locator('#depart-button').waitFor();return {context,page:game,outer,lobby};
}
async function seed(){f=await collectionFixture();f.env.PERSONAL_HIDEOUT_ENABLED='1';let state=emptyHideout();for(const key of Object.keys(state.parts))state.parts[key]=10000;state=changeHideout(state,'upgrade',{revision:0,target:'room'});for(const code of Object.keys(state.facilities))state=changeHideout(state,'upgrade',{revision:state.revision,target:code});for(let i=0;i<2;i++)state=changeHideout(state,'upgrade',{revision:state.revision,target:'room'});state=changeHideout(state,'expand',{revision:state.revision,room:'gallery'});state=changeHideout(state,'decorate',{revision:state.revision,item:'trophy',room:'main'},{newId:'display-1'});state.placements.find(p=>p.id==='display-1').x=585;state.placements.find(p=>p.id==='display-1').y=450;await f.write(HIDEOUT_KEY(7),state);}
const saveReport=()=>fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({reports,traffic,errors,missing,condition:'Windows headless Chrome/WebKit; mobile and H5 emulation; localhost assets, isolated SQLite handlers; no real device or production account writes'},null,2));
try{
 const profiles=[{name:'pc',width:1440,engine:chromium},{name:'android-emulated',width:390,engine:chromium},{name:'iphone-webkit-emulated',width:390,engine:webkit},{name:'onestore-h5-emulated',width:390,engine:chromium,h5:true}];
 for(const profile of profiles){
  if(process.env.HIDEOUT_QA_PROFILE&&process.env.HIDEOUT_QA_PROFILE!==profile.name)continue;
  const browser=await profile.engine.launch({headless:true,...(profile.engine===chromium?{channel:'chrome',args:['--mute-audio','--enable-unsafe-swiftshader']}:{})});
  try{for(variant of (process.env.HIDEOUT_QA_AFTER_ONLY||profile.h5?['after']:['before','after'])){
   await seed();let {context,page,outer,lobby}=await openPage(browser,profile);
   const row={profile:profile.name,variant};reports.push(row);
   if(variant==='after'){
    const enter=async()=>{const started=performance.now();await lobby.locator('.hideout-shortcut').click();await page.locator('[data-ph-action="edit"]').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.ph-backdrop')].every(i=>i.complete&&i.naturalWidth));return performance.now()-started;};
    row.hideoutFirstMs=await enter();row.hideoutIdleFrames=await frameStats(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const beforeLayout=(await readHideout(f.env,7)).state.placements[0];await page.locator('[data-ph-action="edit"]').click();const prop=page.locator('[data-ph-prop="facility-workbench"]');await prop.focus();await prop.press('ArrowRight');await prop.press('Shift+ArrowDown');assert(await page.locator('[data-ph-action="save"]').isEnabled());
    await page.locator('[data-ph-action="save"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();let stored=(await readHideout(f.env,7)).state;assert.equal(stored.placements[0].x,beforeLayout.x+10);assert.equal(stored.placements[0].y,beforeLayout.y+50);
    await prop.scrollIntoViewIfNeeded();const box=await prop.boundingBox(),floor=await page.locator('[data-ph-floor]').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.55;
    const sampling=frameStats(page,1300);const dx=floor.width*.04,dy=floor.height*.035;
    if(profile.width<800&&profile.engine===chromium){const cdp=await context.newCDPSession(outer);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y:y+dy*i/10}]});await outer.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();row.dragInput='Chromium CDP touch';}
    else{await outer.mouse.move(x,y);await outer.mouse.down();await outer.mouse.move(x+dx,y+dy,{steps:12});await outer.mouse.up();row.dragInput='mouse pointer';}
    row.hideoutDragFrames=await sampling;assert(await page.locator('[data-ph-action="save"]').isEnabled());await page.locator('[data-ph-action="save"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();stored=(await readHideout(f.env,7)).state;assert(stored.placements[0].x>beforeLayout.x+10&&stored.placements[0].y>beforeLayout.y+50,'drag persists a changed floor position');

    await page.locator('[data-ph-piece-select]').selectOption('display-1');await page.locator('[data-ph-action="trophies"]').click();await page.locator('[data-ph-action="load-trophies"]').click();await page.locator('[data-ph-action="trophy"][data-trophy]:not([data-trophy=""])').first().click();await page.getByText('저장했습니다.',{exact:true}).waitFor();assert((await readHideout(f.env,7)).state.placements.find(p=>p.id==='display-1').trophyCode);
    const cabinetSampling=frameStats(page,1300);
    for(const [slot,last]of [[1,true],[4,false]]){await page.locator('[data-ph-action="slot"][data-slot="'+slot+'"]').click();const choices=page.locator('[data-ph-action="trophy"][data-trophy]:not([data-trophy=""]):enabled');await (last?choices.last():choices.first()).click();await page.getByText('저장했습니다.',{exact:true}).waitFor();}
    row.hideoutCabinetFrames=await cabinetSampling;
    assert.equal((await readHideout(f.env,7)).state.placements.find(p=>p.id==='display-1').trophyCodes.filter(Boolean).length,3);assert.equal(await page.locator('.ph-cabinet-focus [data-ph-action="slot"]').count(),6);
    const cabinet=await page.locator('.ph-cabinet-focus .ph-cabinet-art').boundingBox();assert(cabinet.width>230,'cabinet close-up keeps trophies readable');await page.locator('.ph-scene').scrollIntoViewIfNeeded();if(profile.width<800)assert(await page.locator('[data-ph-action="slot"][data-slot="5"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'bottom cabinet tier stays visible and usable');await outer.screenshot({path:path.join(out,profile.name+'-trophy-cabinet.png'),fullPage:true});

    await page.locator('[data-ph-action="tab"][data-tab="facilities"]').click();loseNext=true;await page.locator('[data-ph-action="upgrade"][data-target="fridge"]').click();await page.locator('[data-ph-action="retry"]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-ph-notice]')?.dataset.error==='true');await page.locator('[data-ph-action="retry"]').click();await page.getByText('저장된 결과를 복구했습니다.',{exact:true}).waitFor();assert.equal((await readHideout(f.env,7)).state.facilities.fridge,2);
    await page.locator('[data-ph-action="tab"][data-tab="rooms"]').click();await page.locator('[data-ph-action="expand"][data-room="workshop"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();assert((await readHideout(f.env,7)).state.rooms.includes('workshop'));
    await page.locator('[data-ph-action="tab"][data-tab="decor"]').click();await page.locator('[data-ph-action="decorate"][data-item="sofa"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
    const extra=(await readHideout(f.env,7)).state.placements.at(-1).id;await page.locator('[data-ph-action="edit"]').click();await page.locator('[data-ph-piece-select]').selectOption('facility-workbench');await prop.focus();await prop.press('Shift+ArrowLeft');await prop.press('Shift+ArrowLeft');
    for(const id of ['facility-garage','facility-armory',extra]){await page.locator('[data-ph-piece-select]').selectOption(id);await page.locator('[data-ph-room-select]').selectOption('workshop');}
    await page.locator('[data-ph-action="save"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();await page.locator('[data-ph-action="edit"]').click();

    await page.locator('.ph-toolbar').scrollIntoViewIfNeeded();await outer.screenshot({path:path.join(out,profile.name+'-hideout.png'),fullPage:true});
    const home=lobby.locator('[data-home]:visible').first();await home.click();await lobby.locator('.hideout-shortcut').waitFor();const afterExit=traffic.filter(r=>r.path.startsWith('hideout')).length;await page.waitForTimeout(1200);assert.equal(traffic.filter(r=>r.path.startsWith('hideout')).length,afterExit);row.hideoutExitRequests=0;
    row.hideoutReentryMs=await enter();await page.locator('[data-ph-action="tab"][data-tab="trophies"]').click();assert(await page.locator('.ph-displayed-trophy').count());await home.click();await lobby.locator('#depart-button').waitFor();
    // Both revisions start combat in a fresh context: no hideout art/cache warming.
    await context.close();({context,page,outer,lobby}=await openPage(browser,profile));
   }
   if(!process.env.HIDEOUT_QA_NO_BATTLE)for(const entry of ['First','Reentry']){
    await lobby.locator('#depart-button').click();await lobby.locator('.menu-result[data-route="hunt"]').click();await page.locator('#battleStart').waitFor();const started=performance.now();await page.locator('#battleStart').click();await page.locator('#pveResultConfirm').waitFor({timeout:90000});row['huntResult'+entry+'Ms']=performance.now()-started;row['resultFrames'+entry]=await frameStats(page);
    if(variant==='after'){assert.match(await page.locator('.hunt-report').innerText(),/은신처 부품/);const heading=await page.locator('.hunt-report h2').boundingBox();assert(heading.y>=0&&heading.y+heading.height<=outer.viewportSize().height);const confirmBox=await page.locator('#pveResultConfirm').boundingBox();assert(confirmBox.y+confirmBox.height<=outer.viewportSize().height);await page.locator('.hunt-report summary').click();assert(await page.locator('#pveResultConfirm').isVisible());if(entry==='First')await outer.screenshot({path:path.join(out,profile.name+'-hunt-result.png')});}
    await page.locator('#pveResultConfirm').click();await page.locator('#battleStart').waitFor();await lobby.locator('[data-home]:visible').first().click();await lobby.locator('#depart-button').waitFor();
   }
   if(variant==='after'&&!process.env.HIDEOUT_QA_NO_BATTLE){
    await lobby.locator('#depart-button').click();await lobby.locator('.menu-result[data-route="hunt"]').click();await page.locator('#battleAuto').check();await page.locator('#battleStart').click();await page.locator('#pveSweepConfirm').waitFor({timeout:90000});
    const report=page.locator('.hunt-report');assert.match(await report.innerText(),/10회 완료/);assert.equal(await report.locator('.hunt-report-loot li').count(),30);assert.match(await report.locator('.hunt-report-summary').innerText(),/조/);
    await report.locator('summary').click();assert(await page.locator('#pveSweepConfirm').isVisible());
    const bounds=await report.boundingBox(),confirm=await page.locator('#pveSweepConfirm').boundingBox();await outer.screenshot({path:path.join(out,profile.name+'-sweep-result.png')});assert(bounds.y>=0&&confirm.y+confirm.height<=outer.viewportSize().height);assert(await report.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    row.sweep={count:10,aggregateLootRows:30,scrollable:await report.locator('.hunt-report-scroll').evaluate(el=>el.scrollHeight>el.clientHeight),frames:await frameStats(page)};
    await outer.screenshot({path:path.join(out,profile.name+'-sweep-result.png')});await page.locator('#pveSweepConfirm').click();await page.locator('#battleStart').waitFor();
   }
   row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);await context.close();await f.close();f=null;saveReport();console.log(JSON.stringify(row));
  }}finally{await browser.close();}
 }
}finally{saveReport();if(f)await f.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
