import {variantPaths} from '../shared/onestore-web-assets-v1.mjs';
import {mock} from 'node:test';
import {htmlForStore} from '../functions/_onestore_web.js';
import {canonicalDocument} from '../shared/onestore-web-v1.mjs';
import fs from 'node:fs';import os from 'node:os';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';import {pathToFileURL} from 'node:url';import http from 'node:http';import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.NOX_PLAYWRIGHT_PATH
  ?pathToFileURL(process.env.NOX_PLAYWRIGHT_PATH)
  :'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const sourceRoot=process.env.NOX_QA_SOURCE||path.resolve(import.meta.dirname,'..');
const sourceImport=file=>import(pathToFileURL(path.join(sourceRoot,file)));
const {noxFixture,NOX_DECK}=await sourceImport('tests/helpers/nox-live-fixture.mjs');
const {handleNoxLive}=await sourceImport('functions/_raid_nox_live.js');
const {tickNoxRoom,actNoxRoom,NOX_RULES,noxView,noxBattlePayload}=await sourceImport('functions/_raid_nox.js');
const {noxTrack,NOX_TRACKS}=await sourceImport('shared/nox-raid-chart-v1.mjs');
import sharp from 'sharp';
const root=sourceRoot,out=process.env.NOX_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'nox-browser-')),profile=process.argv[2]||'mobile',mobile=['mobile','webkit','h5'].includes(profile);
const f=await noxFixture(),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.woff2':'font/woff2','.mp3':'audio/mpeg'},requests=[],errors=[],broken=[];
const difficulty=process.env.NOX_DIFFICULTY||'NORMAL',steps=difficulty==='HELL'?5:3;
const official=process.env.NOX_OFFICIAL==='1';
const practice=process.env.NOX_PRACTICE==='1';
const verifyRyujin=process.env.NOX_QA_RYUJIN==='1';
const ryujinIndex=difficulty==='HELL'?2:0;
const ryujinItem=['류진의 목걸이','류진의 신발','류진의 가면'][ryujinIndex];
if(verifyRyujin){
  assert(official&&!practice);
  await f.pg.exec("INSERT INTO inventory_items VALUES('SCAR_BLUEPRINT_CHAPTER_1',1),('SCAR_BLUEPRINT_CHAPTER_3',1),('RYUJIN_NECKLACE',1),('RYUJIN_BOOTS',1),('RYUJIN_MASK',1)");
}
const verifyLongNotes=process.env.NOX_QA_LONG_NOTES==='1';
const verifyDeath=process.env.NOX_QA_DEATH==='1'||process.env.NOX_QA_DEATH==='rhythm';
const rhythmDeath=process.env.NOX_QA_DEATH==='rhythm';
const verifyCombo=process.env.NOX_QA_COMBO==='1';
const verifyKeys=process.env.NOX_QA_KEYS==='1';
const rhythmTestCodes=verifyKeys?['KeyZ','ArrowDown','Space','Numpad1']:['KeyD','KeyF','KeyJ','KeyK'];
const testKeyLabels=['Z','↓','Space','Num 1'];
if(verifyDeath)f.decks.set(1,{cards:NOX_DECK,mercenary:{code:'V-001',name:'아우렌',rank:'C',role:'VANGUARD',position:'FRONT',level:1,basePower:10000,stats:{hp:10000,attack:1000,defense:100,speed:100},skills:[],sourceArt:'/assets/ui/project-v/mercenaries/codex-v1/v-001-art-640.webp',battleSprite:'/assets/ui/project-v/mercenaries/codex-v1/v-001-sd-640.webp'}});
if(official)await f.configure({mode:'ON'});
if(practice)await f.pg.query('UPDATE users SET coin=0 WHERE id=1');
const {entryCoins}= (await f.call('feature')).body;
const user={id:1,serverUserId:1,nickname:'녹스 검수',role:'OWNER',coin:999999999999999999,cardShards:0,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
let origin,actionResponses=0;
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,origin),store=url.pathname.startsWith('/onestore/'),pathname=store?url.pathname.slice('/onestore'.length):url.pathname;
  if(pathname==='/qa-host'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%}</style><iframe src="/onestore/?screen=home" title="H5 host"></iframe>');return;}
  if(pathname.startsWith('/api/')){const endpoint=pathname.slice(5),chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const started=performance.now();
    const request=new Request(url,{method:req.method,headers:{...req.headers,origin},...(body.length?{body}:{})});
    const packet=endpoint==='raid/nox/action'?JSON.parse(body):null,receivedAt=Date.now(),delay=packet?Number(process.env.NOX_ACTION_PROCESS_DELAY_MS||0)/(packet.seq%3===1?1:packet.seq%3===2?3:2):0;
    const deps=delay?{...f.deps,authenticate:async(...args)=>{await new Promise(r=>setTimeout(r,delay));return f.deps.authenticate(...args);}}:f.deps;
    let response=await handleNoxLive({path:endpoint,request,env:f.env,deps});
    if(!response){const data={'admin/dashboard':{role:'OWNER',admin:user,stats:{users:8,cards:5,totalCoin:0,draws24h:0},recentUsers:[],recentLogs:[],logs:[],recent:[]},'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]}}[endpoint]||{ok:true,visible:false,accessible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],rooms:[],settings:{}};response=Response.json(data);}
    if(replayMembers&&['raid/nox/create','raid/nox/ready'].includes(endpoint)&&response.ok){const result=await response.json();await replayParty(result.roomId);const room=JSON.parse((await f.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[result.roomId])).state_json),release=result.state.release;result.state={...result.state,...noxView(room,'1'),release};result.payload={...noxBattlePayload(room,'1'),reviewOnly:false};response=Response.json(result);}
    if(process.env.NOX_FIXED_PLAYLIST==='1'&&['raid/nox/create','raid/nox/practice'].includes(endpoint)&&response.ok){const result=await response.json();const playlist=NOX_TRACKS.slice(0,3).map(t=>t.id);await f.changeRoom(result.roomId,r=>{r.playlist=playlist;});result.state.playlist=playlist;response=Response.json(result);}
    const injected=!!(packet&&response.ok&&process.env.NOX_LOST_ACK==='1'&&actionResponses++===0);
    if(injected){const result=await response.json();response=Response.json({error:'검수: 처리 후 응답 유실',code:'NOX_RETRYABLE',serverNow:result.serverNow,serverReceivedAt:result.serverReceivedAt},{status:503});}
    requests.push({endpoint,at:receivedAt,ms:performance.now()-started,status:response.status,cancelled:res.destroyed,...(packet?{seq:packet.seq,stream:packet.stream,oldestInputAgeMs:receivedAt-packet.inputs[0].at,newestInputAgeMs:receivedAt-packet.inputs.at(-1).at}:{}),...(injected?{injected:true}:{})});if(packet&&process.env.NOX_ACTION_RESPONSE_DELAY_MS)await new Promise(r=>setTimeout(r,Number(process.env.NOX_ACTION_RESPONSE_DELAY_MS)));res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());return;
  }
  const storeAsset=variantPaths.includes(pathname)||['/h5-policy.js','/h5-sdk.js','/h5.css'].includes(pathname);if(store&&!storeAsset&&!canonicalDocument(url.pathname))throw Error('Unregistered store document');
  let name=decodeURIComponent(pathname).replace(/^\//,'');if(store&&(storeAsset||pathname==='/'))name='onestore/'+name;if(!name||name.endsWith('/'))name+='index.html';if(name.includes('..'))throw Error('path');let bytes;if(process.env.NOX_LIVE_ASSETS){const remote=await fetch(process.env.NOX_LIVE_ASSETS+'/'+name.split('/').map(encodeURIComponent).join('/'));if(!remote.ok)throw Error('Public asset '+name+' '+remote.status);bytes=Buffer.from(await remote.arrayBuffer());}else try{const changed=new Set(['js/nox-input-v1.mjs','shared/nox-raid-chart-v1.mjs','raid/nox/index.html','raid/nox/raid.css','raid/nox/raid.mjs']);const localRoot=process.env.NOX_QA_UNCHANGED_ROOT&&!changed.has(name)?process.env.NOX_QA_UNCHANGED_ROOT:root;bytes=fs.readFileSync(path.join(localRoot,name));}catch{bytes=execFileSync('git',['show','HEAD:'+name],{cwd:root,maxBuffer:30e6,windowsHide:true,stdio:['ignore','pipe','ignore']});}if(store&&name.endsWith('.html')&&!process.env.NOX_LIVE_ASSETS)bytes=Buffer.from(htmlForStore(bytes.toString(),pathname));res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'public,max-age=600'});res.end(bytes);
}catch(error){res.writeHead(404,{'content-type':'text/plain'});res.end(error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await (profile==='webkit'?webkit:chromium).launch(profile==='webkit'?{headless:true,executablePath:'C:/Users/User/AppData/Local/ms-playwright/webkit-2336/Playwright.exe'}:{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
const context=await browser.newContext({viewport:process.env.NOX_VIEWPORT?JSON.parse(process.env.NOX_VIEWPORT):mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,serviceWorkers:'block'});
if(verifyRyujin&&!mobile){
  // The raid must initialize its matching engine and loader even if stale globals exist.
  await context.addInitScript(()=>{
    if(location.pathname.includes('/raid/nox/')){
      window.ProjectVPixiBattle={runtimeVersion:'previous-nox-build'};
      window.ProjectVBattleV3Live={ready:()=>false};
    }
  });
}
await context.addInitScript(user=>{window.ONEstoreH5={on:()=>{},off:()=>{},onBackPressed:()=>{},openDeeplink:async()=>{},initializeAsync:async()=>({playerId:'isolated',safeArea:{},ringerSilent:true}),setLoadingProgress:()=>{},startGameAsync:async()=>{},getUserIdAsync:async()=>({userId:'isolated'})};localStorage.setItem('cnine_card_api_token','qa-1');localStorage.setItem('cnine_admin_token','qa-1');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_soop_watch_notice:20261026-v1:1','shown');},user);
await context.route('https://h5sdk.onestore.net/lib/v1.1.0/onestore-h5-sdk.min.js',route=>route.fulfill({contentType:'text/javascript',body:'export function createSDK(){return window.ONEstoreH5;}'}));
await context.addInitScript(()=>{
 if(!location.pathname.includes('/raid/nox/'))return;
 window.__noxPerf={decodes:[],longTasks:[]};try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(window.__noxPerf.longTasks.length<200)window.__noxPerf.longTasks.push({start:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
 const proto=(window.AudioContext||window.webkitAudioContext)?.prototype,decode=proto?.decodeAudioData;if(decode)proto.decodeAudioData=function(...args){const started=performance.now();return decode.apply(this,args).then(buffer=>{(window.__noxDecodedContexts??=new Map()).set(Math.round(buffer.duration*1000),this);window.__noxPerf.decodes.push({ms:performance.now()-started,duration:buffer.duration,bytes:buffer.length*buffer.numberOfChannels*4});return buffer;});};
});
const warnings=[];
const page=await context.newPage();page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push({type:m.type(),text:m.text()});});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))broken.push({url:r.url().replace(origin,''),status:r.status()});});
if(process.env.NOX_REDUCED_MOTION==='1')await page.emulateMedia({reducedMotion:'reduce'});
await page.addLocatorHandler(page.locator('.soop-consent-dialog[open]'),d=>d.locator('[data-soop-close]').first().click());
if(profile==='h5')await page.addLocatorHandler(page.frameLocator('iframe').locator('.soop-consent-dialog[open]'),d=>d.locator('[data-soop-close]').first().click());
const report={profile,sourceRoot,unchangedFilesRoot:process.env.NOX_QA_UNCHANGED_ROOT||sourceRoot,fixedPlaylist:process.env.NOX_FIXED_PLAYLIST==='1',emulation:true,physicalDevice:false,network:'Windows loopback / PGlite; browser cache cold then warm',...(profile==='h5'?{h5Entry:'generated onestore/index.html with actual route allowlist; SDK host emulated'}:{}),visits:[],errors,broken,warnings};
const captureStages=process.env.NOX_CAPTURE_STAGES==='1';
const replayMembers=process.env.NOX_REPLAY_FILE?JSON.parse(fs.readFileSync(process.env.NOX_REPLAY_FILE,'utf8')).rooms.find(r=>r.stage==='MEMORY').members:null;
async function replayParty(roomId){if(!replayMembers)return;await f.changeRoom(roomId,r=>{r.members.forEach((m,i)=>{const source=replayMembers[i%replayMembers.length];for(const key of ['cards','fighters','supports','pet'])m[key]=structuredClone(source[key]);for(const actor of [...m.fighters,...(m.supports||[])]){actor.hp=actor.maxHp;actor.alive=true;actor.memberName='검수 공대원';}m.maxHp=m.hp=m.fighters.reduce((n,a)=>n+a.maxHp,0);});});}
async function captureStage(raid,label){
  await page.screenshot({path:path.join(out,profile+'-'+label+'.png')});
  const details=await raid.evaluate(()=>{const d=window.NoxRaid.diagnostics(),canvas=document.querySelector('canvas');return {stage:d.state.stage,round:d.state.round,hp:d.state.me.hp,canvas:canvas?.getBoundingClientRect().toJSON(),canvasWidth:canvas?.width,canvasHeight:canvas?.height,visible:d.battle.engine?.visible,errors:document.getElementById('toast')?.textContent,mechanic:document.querySelector('.nox-mechanic-layer')?.isConnected,floor:d.battle.floor,scene:d.battle.scene,playing:d.playing};});
  (report.stageCaptures??=[]).push({label,...details});
}
async function assertFloorPainted(raid){
  const scene=await raid.evaluate(()=>{const d=window.NoxBattle.diagnostics();return {visible:d.engine.visible,ticking:d.scene?.ticking,art:d.art,tips:d.floor.tiles.map(t=>t.points[0])};});
  assert.deepEqual(scene.art,{poses:6,fxFrames:48,invalid:0},'every retry must use live boss/fx textures');
  assert(scene.visible,'the live renderer must be visible at MEMORY entry');
  assert.notEqual(scene.ticking,false,'the live renderer must keep ticking during cues');
  assert(scene.tips.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'floor projection must be finite');
  const {data,info}=await sharp(await raid.locator('canvas').screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let painted=0;for(const p of scene.tips){let found=false;for(let y=Math.floor(p.y)-4;y<=Math.ceil(p.y)+4&&!found;y++)for(let x=Math.floor(p.x)-4;x<=Math.ceil(p.x)+4;x++){if(x<0||y<0||x>=info.width||y>=info.height)continue;const i=(y*info.width+x)*info.channels,[r,g,b]=data.subarray(i,i+3);if(r>190&&g<150&&b<180||g>160&&b>150&&r<170){found=true;break;}}if(found)painted++;}
  assert(painted>=24,'mine/safe outlines must be visibly painted at the projected targets: '+painted+'/30');
  (report.floorPaint??=[]).push({painted,total:scene.tips.length,ticking:scene.ticking});
}
async function observeDeaths(raid){
  await raid.evaluate(async()=>{
    const engine=await window.ProjectVPixiBattle.mount();
    window.__noxDeaths=[];
    for(const id of window.NoxRaid.diagnostics().state.fighters.map(f=>f.id)){
      const actor=engine.combatantById(id),setState=actor.setState;
      const sample={id,mercenary:!!actor.isMercenary,deaths:0,revivals:0};
      window.__noxDeaths.push(sample);
      actor.setState=function(next){
        const before=this.state,result=setState.call(this,next);
        if(before!=='DEAD'&&this.state==='DEAD')sample.deaths++;
        if(before==='DEAD'&&this.state!=='DEAD')sample.revivals++;
        return result;
      };
    }
  });
}
async function verifyDeathPlayback(raid,roomId){
  await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.me.hp===0);
  if(!practice){
    await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.status==='ACTIVE');
    for(let i=0;i<5;i++){await raid.evaluate(()=>window.NoxRaid.sync());await page.waitForTimeout(200);}
    await f.changeRoom(roomId,room=>tickNoxRoom(room,room.challenge.deadline+NOX_RULES.receiptGraceMs));
  }
  await raid.locator('#resultDialog').waitFor({state:'visible'});
  await raid.evaluate(async()=>{
    const current=window.NoxRaid.diagnostics().state;
    await window.NoxBattle.visible(false);await window.NoxBattle.visible(true);
    window.NoxBattle.update(current,current.events);await window.NoxRaid.sync();
  });
  const sample=await raid.evaluate(()=>({actors:window.__noxDeaths,ticking:window.NoxBattle.diagnostics().scene.ticking}));
  report.mechanicFailure={stage:rhythmDeath?'RHYTHM':'MEMORY',...sample};
  assert.equal(sample.actors.length,6,JSON.stringify(sample));
  assert(sample.actors.some(a=>a.mercenary));
  assert(sample.actors.every(a=>a.deaths===1&&a.revivals===0),JSON.stringify(sample));
  assert.equal(sample.ticking,false);
}
async function verifyKeyEditor(raid){
  const open=raid.locator('#lobby [data-key-settings]'),dialog=raid.locator('#keySettings'),buttons=dialog.locator('[data-bind-lane]');
  await open.click();
  await dialog.locator('#resetRhythmKeys').click();
  assert.deepEqual(await buttons.locator('kbd').allTextContents(),['D','F','J','K']);
  await buttons.nth(0).click();
  await page.keyboard.press('KeyF');
  assert.deepEqual(await buttons.locator('kbd').allTextContents(),['F','D','J','K']);
  await buttons.nth(1).click();
  await page.keyboard.press('Escape');
  assert(await dialog.isVisible());
  assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'false');
  await dialog.locator('#resetRhythmKeys').click();
  assert.deepEqual(await buttons.locator('kbd').allTextContents(),['D','F','J','K']);
  for(const [lane,code] of rhythmTestCodes.entries()){
    await buttons.nth(lane).click();
    await page.keyboard.press(code);
  }
  assert.deepEqual(await buttons.locator('kbd').allTextContents(),testKeyLabels);
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:path.join(out,profile+'-key-settings.png')});
  await dialog.locator('#closeKeySettings').click();
  await raid.goto(raid.url());
  await raid.locator('#createButton:enabled').waitFor();
  assert.equal(await raid.locator('#guideRhythmKeys').textContent(),testKeyLabels.join(' · '));
}
async function pressMemory(raid,roomId,label){
  await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.stage==='MEMORY');
  await raid.waitForFunction(()=>!document.querySelector('.nox-floor-target')?.disabled);
  const boxes=await raid.locator('.nox-floor-target').evaluateAll(bs=>bs.map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,transform:b.style.transform})));
  (report.floorTargets??=[]).push({label,boxes});assert.equal(boxes.length,30);assert(boxes.every(b=>b.width>10&&b.height>10&&b.transform),'all 30 fresh buttons need projected click areas: '+label);
  await assertFloorPainted(raid);if(captureStages)await captureStage(raid,label);
  const memory=JSON.parse((await f.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json).challenge;
  for(const tile of memory.sequence){const b=raid.locator('[data-nox-tile="'+tile+'"]');if(mobile)await b.tap();else await b.click();}
  await raid.waitForFunction(steps=>window.NoxRaid.diagnostics().state.me.memoryIndex===steps,steps,{timeout:7000});
}
async function finishCoop(raid,roomId){
  await f.changeRoom(roomId,r=>{for(const m of r.members)if(m.id!=='1')m.memoryIndex=steps;});
  await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.stage==='COOP');
  await raid.waitForFunction(()=>{const d=window.NoxRaid.diagnostics();return d.serverNowEstimate>=d.state.challenge.targetAt;},{},{polling:'raf'});
  await raid.evaluate(()=>{const code=['KeyD','KeyF','KeyJ'][window.NoxRaid.diagnostics().state.me.role];document.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));});
  await f.changeRoom(roomId,r=>{for(const m of r.members)if(m.id!=='1'){m.cooperated=true;r.challenge.strikes[m.id]=r.challenge.targetAt;}});
  await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.me.cooperated);
}
try{
  if(profile==='admin'){
    await page.goto(origin+'/admin/');await page.locator('#nav [data-view=raid]').click();const panel=page.locator('#noxRaidAdmin');await panel.locator('select[name=mode]').waitFor();
    assert.equal(await panel.locator('select[name=mode]').inputValue(),'TEST');
    for(const mode of ['OFF','ON','TEST']){await panel.locator('select[name=mode]').selectOption(mode);await panel.locator('button[type=submit]').click();await panel.locator('[data-status]').filter({hasText:'저장 완료 · '+mode}).waitFor();assert.equal((await f.call('admin/raid/nox/settings')).body.settings.mode,mode);}
    await panel.screenshot({path:path.join(out,'admin-panel.png')});report.pass=true;report.modes=['TEST','OFF','ON','TEST'];
  }else{
  const started=performance.now();await page.goto(origin+(profile==='h5'?'/qa-host':'/?screen=home'+(profile==='windows'?'&source=windows-client':'')));
  const shell=profile==='h5'?page.frames().find(f=>f!==page.mainFrame()):page;
  if(profile==='h5')await page.addLocatorHandler(page.frameLocator('iframe').locator('.soop-consent-dialog[open]'),d=>d.locator('[data-soop-close]').first().click());
  await shell.locator('soop-adventure-lobby [data-category=all]:visible').first().waitFor({timeout:25000});
  report.shellMs=performance.now()-started;
  await shell.locator('soop-adventure-lobby [data-category=all]:visible').first().click();
  const raidMenu=shell.locator('#menu-dialog [data-route="raid"]:visible').first();
  if(!await raidMenu.count()){console.log('routes',await shell.locator('[data-route]:visible').evaluateAll(es=>es.map(e=>({route:e.dataset.route,text:e.textContent.slice(0,30)}))));throw Error('raid menu missing');}
  await raidMenu.click();await shell.locator('#noxRaidTab').waitFor({state:'visible'});
  if(official)assert.match(await shell.locator('#noxRaidTab small').innerText(),/3조/);
  let retainedRaid;
  for(let visit=0;visit<Number(process.env.NOX_QA_VISITS||2);visit++){
    const openAt=performance.now();if(!retainedRaid)await shell.locator('#noxRaidTab').click();let raid=retainedRaid;for(let i=0;i<100&&!raid;i++){raid=page.frames().find(f=>f.url().includes('/raid/nox/'));if(!raid)await page.waitForTimeout(50);}assert(raid);
    if(process.env.NOX_SAME_PAGE==='1'){retainedRaid=raid;(report.timeOrigins??=[]).push(await raid.evaluate(()=>performance.timeOrigin));}
    await raid.locator('#createButton:enabled').waitFor({state:'visible'});const lobbyMs=performance.now()-openAt;
    if(verifyKeys&&visit===0)await verifyKeyEditor(raid);
    if(practice)await raid.locator('input[name=size][value="6"]').check();
    const viewport=await raid.evaluate(()=>({w:innerWidth,h:innerHeight,root:document.querySelector('#lobby').getBoundingClientRect().toJSON(),fee:document.getElementById('feeMode').textContent}));
    assert.match(viewport.fee,official?/공식 레이드/:/TEST.*무료/);
    if(official){
      assert.match(await raid.locator('#feeDetail').innerText(),/출전 시 1인 3조/);
      assert.match(await raid.locator('#createButton').innerText(),/10조 코인/);
      assert.match(await raid.locator('#normalReward').innerText(),/100조.*10억/);
      assert.match(await raid.locator('#hellReward').innerText(),/300조.*25억/);
      assert.match(await raid.locator('#weeklyReward').innerText(),/노말·헬 합산 보상/);
    }
    assert.match(await raid.locator('label:has(input[name=difficulty][value="HELL"])').innerText(),/낙하 0.8초 · 노트 \+75%/);
    assert.equal(await raid.locator('#joinCode,#copyCode').count(),0);
    const openDirectory=raid.getByRole('button',{name:'대기방 목록',exact:true});
    const directory=raid.locator('#roomDirectory');
    await openDirectory.waitFor({state:'visible'});
    assert.equal(await directory.isVisible(),false);
    assert.equal(await raid.locator('#createForm #roomDirectory,#createForm #openRoomDirectory').count(),0);
    if(verifyLongNotes&&visit===0){
      assert.equal(requests.filter(r=>r.endpoint==='raid/nox/rooms').length,0);
      await openDirectory.click();
      await directory.getByText('현재 모집 중인 공대가 없습니다.').waitFor();
      assert(await directory.evaluate(el=>el.matches(':modal')));
      if(mobile)await directory.getByRole('button',{name:'대기방 목록 닫기'}).tap();
      else await page.keyboard.press('Escape');
      await directory.waitFor({state:'hidden'});
      const fee=official?{acceptedCreateCoins:'10000000000000'}:{};
      const listed=await f.command('create',{size:6,difficulty:'HELL',...fee},2);
      const normal=await f.command('create',{size:3,difficulty:'NORMAL',...fee},3);
      assert.equal(listed.status,200,JSON.stringify(listed));
      assert.equal(normal.status,200,JSON.stringify(normal));
      await openDirectory.click();
      const row=directory.locator('#roomList li').filter({hasText:'헬'});
      await directory.locator('#roomList li').filter({hasText:'노말'}).waitFor();
      await directory.getByRole('button',{name:'새로고침'}).click();
      await row.waitFor({state:'visible'});
      assert.equal(await row.locator('.nox-room-seats').innerText(),'1/6명');
      assert.equal(await directory.locator('.nox-room-columns').isVisible(),viewport.w>520);
      await page.screenshot({path:path.join(out,profile+'-room-list.png')});
      await row.getByRole('button',{name:'참가'}).click();
      await raid.locator('#assembly').waitFor({state:'visible'});
      assert.equal(await directory.isVisible(),false);
      assert.equal(await openDirectory.isVisible(),false);
      assert.equal(await raid.evaluate(()=>window.NoxRaid.diagnostics().state.id),listed.body.roomId);
      await raid.locator('#lobbyLeave').click();
      await raid.waitForFunction(()=>!document.getElementById('createButton')?.disabled);
      await openDirectory.waitFor({state:'visible'});
      assert.equal((await f.command('leave',{roomId:listed.body.roomId},2)).status,200);
      assert.equal((await f.command('leave',{roomId:normal.body.roomId},3)).status,200);
      assert.equal((await f.one('SELECT count(*)::int n FROM coin_logs WHERE user_id=2')).n,official?1:0);
      report.listedRoomJoined=true;
    }
    await raid.locator('input[name=difficulty][value="'+difficulty+'"]').check();
    await raid.locator('input[name=size][value="'+(practice?1:3)+'"]').check();
    if(practice){
      assert.match(await raid.locator('#feeDetail').innerText(),/도전 비용 0 코인/);
      assert.equal(await raid.locator('#weeklyReward').isVisible(),false);
    }
    if(visit===0)await page.screenshot({path:path.join(out,profile+'-lobby.png')});
    await raid.locator('#createButton').click();await raid.locator('#assembly').waitFor({state:'visible'});
    const {id:roomId,practice:solo,size}=await raid.evaluate(()=>window.NoxRaid.diagnostics().state);
    assert.equal(solo,practice);
    assert.equal(size,practice?1:3);
    assert.equal(await raid.locator('#roomDifficulty').innerText(),(difficulty==='HELL'?'헬':'노말')+(practice?' · 1인 연습':''));
    if(practice){
      assert.equal(await raid.locator('#memberList li').count(),1);
      assert.match(await raid.locator('#readyButton').innerText(),/연습 준비/);
    }else for(const id of [2,3]){assert.equal((await f.command('join',{roomId},id)).status,200);assert.equal((await f.command('ready',{roomId,ready:true,acceptedCoins:entryCoins},id)).status,200);}
    await replayParty(roomId);
    const prepareAt=performance.now();await raid.locator('#readyButton').click();await raid.locator('#startButton').waitFor({state:'visible',timeout:30000});const prepareMs=performance.now()-prepareAt;
    const preparation=await raid.evaluate(()=>({...window.__noxPerf,slowResources:performance.getEntriesByType('resource').sort((a,b)=>b.duration-a.duration).slice(0,10).map(r=>({file:new URL(r.name).pathname,ms:r.duration,bytes:r.transferSize}))}));
    (report.loading??=[]).push({visit,lobbyMs,prepareMs,...preparation});
    await replayParty(roomId);
    if(process.env.NOX_RESIZE_WAITING==='1'){
      const box=page.viewportSize();await page.setViewportSize({width:box.width-24,height:box.height-24});await page.waitForTimeout(500);await page.setViewportSize(box);await page.waitForTimeout(500);
    }
    if(practice)assert.equal(await raid.locator('#startButton').innerText(),'연습 시작');
    if(process.env.NOX_COMBAT_VIEWPORT)await page.setViewportSize(JSON.parse(process.env.NOX_COMBAT_VIEWPORT));
    await raid.locator('#startButton').click();await raid.waitForFunction(()=>window.NoxRaid?.diagnostics().state?.status==='ACTIVE');
    await raid.waitForFunction(()=>document.getElementById('rhythm')&&!document.getElementById('rhythm').hidden);
    if(verifyCombo){
      const initial=await raid.evaluate(()=>{
        const counter=document.getElementById('rhythmCombo'),value=document.getElementById('rhythmComboValue');
        const box=counter.getBoundingClientRect(),row=counter.closest('header').getBoundingClientRect(),chart=document.getElementById('chart').getBoundingClientRect();
        window.__noxComboChanges=[];
        new MutationObserver(()=>{
          const frames=counter.getAnimations().flatMap(a=>a.effect.getKeyframes());
          window.__noxComboChanges.push({value:Number(value.textContent),glow:frames.some(key=>key.textShadow&&key.boxShadow)});
        }).observe(value,{childList:true});
        return {text:counter.textContent.trim(),right:row.right-box.right,top:box.top-row.top,above:box.bottom<=chart.top,oldLabel:!!document.getElementById('rhythmTrack')};
      });
      assert.equal(initial.text,'0 COMBO');assert(initial.above&&!initial.oldLabel&&initial.right<10&&initial.top<7,JSON.stringify(initial));
    }
    const comboScreenshot=()=>page.screenshot({path:path.join(out,profile+'-combo.png')});
    const comboPicture=verifyCombo&&!mobile?raid.waitForFunction(()=>window.__noxComboChanges.some(s=>s.value>=5),null,{timeout:23000,polling:'raf'}).then(comboScreenshot):Promise.resolve();
    // Full feedback run: play the complete chart through the real input listener,
    // at +110ms without calibration. Only other fixture members are simulated.
    if(process.env.NOX_CAPTURE_HIT==='1')await raid.evaluate(()=>{const s=document.getElementById('judgement');window.__noxHitObserver=new MutationObserver(()=>{if(!['PERFECT','GOOD'].includes(s.textContent))return;window.__noxHitSample={grade:s.textContent,at:performance.now(),voices:window.NoxRaid.diagnostics().hitVoices,animations:document.getAnimations().filter(a=>a.playState==='running').length};});window.__noxHitObserver.observe(s,{childList:true});});
    const captureHit=process.env.NOX_CAPTURE_HIT==='1'?raid.waitForFunction(()=>window.__noxHitSample?.voices>0).then(async()=>{report.hitFeedback=await raid.evaluate(()=>window.__noxHitSample);await page.screenshot({path:path.join(out,profile+'-hit-'+visit+'.png')});}):Promise.resolve();
    if(verifyKeys){
      assert.deepEqual(await raid.locator('.nox-keys button').allTextContents(),testKeyLabels);
      await raid.locator('#combat [data-guide]').click();
      await raid.locator('#guideDialog [data-key-settings]').click();
      await raid.locator('[data-bind-lane="0"]').click();
      await page.keyboard.down(rhythmTestCodes[0]);
      assert.equal(await raid.evaluate(()=>window.NoxRaid.diagnostics().held),0);
      await page.keyboard.up(rhythmTestCodes[0]);
      await raid.locator('#closeKeySettings').click();
      await raid.locator('#closeGuide').click();
    }
    const full=process.env.NOX_FULL_RHYTHM==='1'&&visit===0&&!mobile;
    const music=await raid.evaluate(()=>{const d=window.NoxRaid.diagnostics();return {playlist:d.state.playlist,trackId:d.state.challenge.trackId,travelMs:d.state.challenge.travelMs,notes:d.state.challenge.chart.length,url:d.trackUrl,prepared:d.preparedTracks,bufferBytes:d.audioBufferBytes,calibration:document.getElementById('calibration').value};});
    assert.equal(music.url,noxTrack(music.trackId).source);assert.equal(music.prepared,3);assert.equal(music.calibration,'0');assert(music.bufferBytes<=3*68*48000*2*4);
    assert.equal(music.travelMs,difficulty==='HELL'?800:1250);
    assert.equal(music.notes,Math.round(noxTrack(music.trackId).notes.length*(difficulty==='HELL'?1.75:1)));
    const receptor=await raid.evaluate(travelMs=>{
      const chart=document.getElementById('chart'),line=chart.querySelector('.nox-hit-line');
      const height=parseFloat(getComputedStyle(chart).getPropertyValue('--note-height'));
      const y=parseFloat(getComputedStyle(chart).getPropertyValue('--hit-y'));
      const oldY=(chart.clientHeight-height/2-6)/(1+160/travelMs);
      const laneWidth=chart.clientWidth/4,center=rect=>rect.x+rect.width/2;
      const targets=[...line.children].map((bar,lane)=>{
        const rect=bar.getBoundingClientRect(),key=document.querySelectorAll('.nox-keys button')[lane].getBoundingClientRect();
        return {width:rect.width,centerError:Math.abs(center(rect)-(chart.getBoundingClientRect().left+(lane+.5)*laneWidth)),
          keyOffset:Math.abs(center(rect)-center(key)),keyHeight:key.height,keyWidth:key.width};
      });
      return {y,oldY,chartHeight:chart.clientHeight,chartWidth:chart.clientWidth,
        actual:line.getBoundingClientRect().top-chart.getBoundingClientRect().top+height/2,viewport:[innerWidth,innerHeight],targets};
    },music.travelMs);
    assert(receptor.y+1>=receptor.oldY&&Math.abs(receptor.actual-receptor.y)<2,JSON.stringify(receptor));
    if(!mobile)assert(receptor.y>receptor.oldY+8,JSON.stringify(receptor));
    assert(receptor.targets.every(t=>t.width<receptor.chartWidth/4*.66&&t.centerError<1&&t.keyOffset<2&&t.keyWidth>=44&&t.keyHeight>=44),JSON.stringify(receptor));
    if(receptor.viewport.join('x')==='1440x900')assert(receptor.chartWidth<=600&&receptor.y>=530,JSON.stringify(receptor));
    if(receptor.viewport.join('x')==='390x844')assert(receptor.chartWidth<350&&receptor.y>=465,JSON.stringify(receptor));
    if(receptor.viewport[0]>=650&&receptor.viewport[1]<=480){
      const fits=await raid.evaluate(()=>{
        const row=document.querySelector('.nox-rhythm-readout').getBoundingClientRect(),score=document.getElementById('rhythmScore').getBoundingClientRect(),judge=document.getElementById('judgement').getBoundingClientRect(),chart=document.getElementById('chart').getBoundingClientRect();
        return score.left>=judge.right&&score.right<=row.right+1&&score.top>=row.top-1&&score.bottom<=chart.top;
      });
      assert(fits,'Landscape score must fit beside the judgement and above the first note');
    }
    report.receptor=receptor;
    // Drive the real input listener at the audio clock's first eight notes.
    let hits;
    if(mobile&&profile!=='webkit'){
      const notes=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.challenge.chart.slice(0,8));
      const keys=await Promise.all([0,1,2,3].map(lane=>raid.locator('.nox-keys [data-nox-lane="'+lane+'"]').boundingBox()));
      for(const n of notes){const b=keys[n.lane];await raid.waitForFunction(at=>window.NoxRaid.diagnostics().audioPositionMs>=at-10,n.at,{timeout:15000,polling:'raf'});await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
      if(verifyCombo)await comboScreenshot();
      await page.waitForTimeout(900);hits=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.me.hits.length);report.realTouchKeys=true;
    }else{
      hits=await raid.evaluate(async({full,delay,keys})=>{
        const notes=window.NoxRaid.diagnostics().state.challenge.chart.slice(0,full?undefined:8);
        const presses=notes.flatMap(note=>[
          {at:note.at+(full?delay:0),lane:note.lane,hold:note.endAt!==undefined},
          ...(note.endAt===undefined?[]:[{at:note.endAt+24,lane:note.lane,release:true}])
        ]).sort((a,b)=>a.at-b.at);
        return new Promise(resolve=>{let next=0;const run=()=>{const age=window.NoxRaid.diagnostics().audioPositionMs;
          if(age!==null)while(next<presses.length&&age>=presses[next].at){const n=presses[next++],code=keys[n.lane];if(!n.release)document.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));if(!n.hold)document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));}
          if(next===presses.length){setTimeout(()=>resolve(window.NoxRaid.diagnostics().state.me.hits.length),600);return;}requestAnimationFrame(run);
        };run();});
      },{full,delay:Number(process.env.NOX_INPUT_DELAY_MS??110),keys:rhythmTestCodes});
    }
    await Promise.all([captureHit,comboPicture]);
    if(verifyCombo){
      const changes=await raid.evaluate(()=>window.__noxComboChanges);
      const reduced=process.env.NOX_REDUCED_MOTION==='1';
      assert(changes.some(s=>s.value>=5&&s.glow===!reduced),JSON.stringify(changes));
      report.comboFeedback={highest:Math.max(...changes.map(s=>s.value)),glow:changes.some(s=>s.glow),reduced};
    }
    if(process.env.NOX_ACTION_RESPONSE_DELAY_MS||process.env.NOX_ACTION_PROCESS_DELAY_MS){await page.waitForTimeout(Math.max(Number(process.env.NOX_ACTION_RESPONSE_DELAY_MS||0),Number(process.env.NOX_ACTION_PROCESS_DELAY_MS||0))*2+300);hits=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.me.hits.length);}
    assert(hits>=(process.env.NOX_ACTION_RESPONSE_DELAY_MS||process.env.NOX_ACTION_PROCESS_DELAY_MS?8:7),'key inputs should score: '+hits);
    const holdCount=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.challenge.chart.filter(n=>n.endAt!==undefined).length);
    assert.equal(holdCount>0,difficulty==='HELL');
    report.chartHolds=holdCount;
    if(verifyLongNotes&&difficulty==='HELL'&&!full&&visit===0){
      const audioState=await raid.evaluate(async duration=>{
        const context=window.__noxDecodedContexts.get(duration);
        await context.suspend();
        return window.NoxRaid.diagnostics().audio;
      },noxTrack(music.trackId).durationMs);
      assert.equal(audioState,'suspended');
      await page.waitForTimeout(NOX_RULES.receiptGraceMs+250);
      await raid.locator('#audioResume').click();
      await raid.waitForFunction(()=>{
        const d=window.NoxRaid.diagnostics();
        return d.playing&&Math.abs(d.audioPositionMs-(d.serverNowEstimate-d.state.challenge.musicStartAt))<150;
      },null,{timeout:3000});
      report.audioResumedOnBeat=true;
      const tapWidth=await raid.locator('#notes .nox-note:not(.is-long)').first().evaluate(node=>node.getBoundingClientRect().width);
      const note=await raid.evaluate(()=>{
        const d=window.NoxRaid.diagnostics();
        return d.state.challenge.chart.find(n=>n.endAt!==undefined&&n.at>d.audioPositionMs+400);
      });
      assert(note,'A long note should follow the initial taps');
      const held=raid.locator(`.nox-note.is-long[data-note-id="${note.id}"]`);
      await held.waitFor({state:'visible',timeout:45000});
      const cdp=mobile?await context.newCDPSession(page):null;
      const key=raid.locator(`.nox-keys [data-nox-lane="${note.lane}"]`);
      const {x,y,width,height}=await key.boundingBox();
      const initialCombo=await raid.evaluate(()=>{
        const label=document.getElementById('judgement'),detail=document.getElementById('timingDetail'),combo=document.getElementById('rhythmCombo');
        window.__holdFeedback={};
        const observer=new MutationObserver(()=>{
          const d=window.NoxRaid.diagnostics(),sample={voices:d.hitVoices,animations:d.hitAnimations,combo:combo.textContent};
          if(label.textContent==='HOLD')window.__holdFeedback.start=sample;
          if(detail.textContent==='롱노트 성공'){window.__holdFeedback.end=sample;observer.disconnect();}
        });
        observer.observe(label,{childList:true});
        return combo.textContent;
      });
      await raid.waitForFunction(at=>window.NoxRaid.diagnostics().audioPositionMs>=at,note.at,{polling:'raf'});
      const physicalKey=rhythmTestCodes[note.lane];
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+width/2,y:y+height/2,id:1}]});
      else{await page.keyboard.down(physicalKey);await page.keyboard.down(physicalKey);}
      await held.and(raid.locator('.is-holding')).waitFor({state:'visible',timeout:2500});
      const bar=await held.evaluate(node=>{
        const chart=document.getElementById('chart');
        const receptor=parseFloat(getComputedStyle(chart).getPropertyValue('--hit-y'));
        return {width:node.getBoundingClientRect().width,height:node.offsetHeight,head:node.getBoundingClientRect().bottom-chart.getBoundingClientRect().top,receptor,
          skin:getComputedStyle(node,'::before').borderImageSource,after:getComputedStyle(node,'::after').content};
      });
      assert(bar.height>0&&Math.abs(bar.head-bar.receptor)<2,JSON.stringify(bar));
      assert.match(bar.skin,/raid-nox-v2\/note\.webp/);
      assert.equal(bar.after,'none');
      assert(!(await raid.evaluate(id=>window.NoxRaid.diagnostics().state.me.hits.includes(id),note.id)));
      await page.screenshot({path:path.join(out,profile+'-long-note.png')});
      await raid.waitForFunction(id=>window.NoxRaid.diagnostics().state.me.hits.includes(id),note.id,{timeout:3500});
      if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
      else await page.keyboard.up(physicalKey);
      const feedback=await raid.evaluate(()=>window.__holdFeedback);
      assert(feedback.start?.voices>0&&feedback.start.animations>0,JSON.stringify(feedback));
      assert.equal(feedback.start.combo,initialCombo);
      assert.equal(feedback.end?.voices,0);
      assert.equal(parseInt(feedback.end.combo),(parseInt(initialCombo)||0)+1);
      const texture=sharp(path.join(root,'assets/ui/raid-nox-v2/note.webp'));
      const original=await texture.metadata(),{info}=await texture.trim({threshold:2}).toBuffer({resolveWithObject:true});
      const tapPx=tapWidth*info.width/original.width,holdPx=bar.width*info.height/original.height;
      const receptorPx=receptor.targets[note.lane].width*info.width/original.width;
      assert(Math.abs(tapPx-holdPx)<1,`Visible widths: tap ${tapPx}, hold ${holdPx}`);
      assert(Math.abs(tapPx-receptorPx)<1,`Visible widths: tap ${tapPx}, receptor ${receptorPx}`);
      report.noteWidths={tapPx,holdPx,receptorPx};
      report.longNote={input:cdp?'touch':'keyboard',durationMs:note.endAt-note.at,scoredThroughTail:true,feedback};
    }
    if(full){const result=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.me);assert(result.score/result.hits.length>=.9);assert.equal(result.hits.length,music.notes);report.fullRhythm={hits:result.hits.length,score:result.score,totalNotes:music.notes,durationMs:noxTrack(music.trackId).durationMs,lastNoteAt:noxTrack(music.trackId).notes.at(-1).at,calibration:0,targetDelayMs:Number(process.env.NOX_INPUT_DELAY_MS??110)};}
    await page.screenshot({path:path.join(out,profile+'-rhythm-'+visit+'.png')});
    const stats=await raid.evaluate(()=>{const d=window.NoxRaid.diagnostics(),a=d.frameTimes.sort((a,b)=>a-b);return {wholeRun:d.frameSummary,samples:a.length,p95:a[Math.floor(a.length*.95)]||0,max:a.at(-1)||0,over50:a.filter(t=>t>50).length,hits:d.state.me.hits.length,score:d.state.me.score,clockError:d.serverNowEstimate-Date.now(),inflight:d.inflight};});
    if(process.env.NOX_INTERRUPTED_RENDERER==='1'){
      await raid.evaluate(async()=>{await window.NoxBattle.visible(false);const c=document.querySelector('canvas');c.width=c.width;});
    }
    if(verifyCombo&&!full){
      const empty=await raid.evaluate(keys=>new Promise(resolve=>{
        const attempt=()=>{
          const d=window.NoxRaid.diagnostics(),lane=[0,1,2,3].find(l=>!d.state.challenge.chart.some(n=>n.lane===l&&Math.abs(n.at-d.audioPositionMs)<200));
          if(lane===undefined){requestAnimationFrame(attempt);return;}
          const code=keys[lane];
          document.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
          resolve([document.getElementById('judgement').textContent,document.getElementById('rhythmCombo').textContent.trim()]);
        };attempt();
      }),rhythmTestCodes);
      assert.deepEqual(empty,['EMPTY','0 COMBO']);
      await raid.waitForFunction(()=>{const d=window.NoxRaid.diagnostics();return !d.pendingInputs&&!d.inputRequests;});
    }
    if(verifyDeath)await observeDeaths(raid);
    await f.changeRoom(roomId,r=>{for(const m of r.members){if((full||rhythmDeath)&&m.id==='1')continue;m.hits=r.challenge.chart.map(n=>n.id);m.score=r.challenge.chart.length;}if(!full){r.challenge.deadline=Date.now();tickNoxRoom(r,Date.now());}});
    if(!rhythmDeath){
      await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.stage==='MEMORY');assert(await raid.evaluate(()=>window.NoxRaid.diagnostics().state.me.hp>0));await raid.locator('.nox-floor-target').first().waitFor({state:'visible'});assert.equal(await raid.locator('.nox-floor-target').count(),30);
      const memory=JSON.parse((await f.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json).challenge;
      assert.equal(memory.sequence.length,steps);
      await raid.waitForFunction(()=>!document.querySelector('.nox-floor-target').disabled);
      if(captureStages)await captureStage(raid,'memory-first-'+visit);
      await assertFloorPainted(raid);
      if(verifyDeath){
        const mine=raid.locator('[data-nox-tile="'+memory.tiles.find(t=>t.kind==='mine').id+'"]');
        if(mobile)await mine.tap();else await mine.click();
      }else{
        for(const tile of memory.sequence){const b=raid.locator('[data-nox-tile="'+tile+'"]');if(mobile)await b.tap();else await b.click();}
        await raid.waitForFunction(steps=>window.NoxRaid.diagnostics().state.me.memoryIndex===steps,steps,{timeout:5000});
        await page.screenshot({path:path.join(out,profile+'-floor-'+visit+'.png')});
      }
    }
    if(verifyDeath)await verifyDeathPlayback(raid,roomId);
    if(!verifyDeath&&(full||captureStages)){
      await f.changeRoom(roomId,r=>{for(const m of r.members)if(m.id!=='1')m.memoryIndex=steps;});
      await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.stage==='COOP');
      if(captureStages)await captureStage(raid,'coop-first-'+visit);
      await raid.waitForFunction(()=>{const d=window.NoxRaid.diagnostics();return d.serverNowEstimate>=d.state.challenge.targetAt;},{},{polling:'raf'});
      await raid.evaluate(()=>{const code=['KeyD','KeyF','KeyJ'][window.NoxRaid.diagnostics().state.me.role];document.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));});
      await f.changeRoom(roomId,r=>{for(const m of r.members)if(m.id!=='1'){m.cooperated=true;r.challenge.strikes[m.id]=r.challenge.targetAt;}});
      await raid.waitForFunction(()=>{const d=window.NoxRaid.diagnostics();return d.state.round===2&&d.state.stage==='RHYTHM'&&d.playing;},{},{timeout:25000});
      const next=await raid.evaluate(()=>{const d=window.NoxRaid.diagnostics();return {trackId:d.state.challenge.trackId,url:d.trackUrl,prepared:d.preparedTracks,hp:d.state.me.hp,role:d.state.me.role};});
      assert.notEqual(next.trackId,music.trackId);assert.equal(next.url,noxTrack(next.trackId).source);assert.equal(next.prepared,3);assert(next.hp>0);if(practice)assert.equal(next.role,1);report.nextRound=next;
      if(captureStages){for(const delay of [0,500,1500,3000]){await page.waitForTimeout(delay);await captureStage(raid,'round2-'+visit+'-'+delay);}}
      if(process.env.NOX_ALL_ROUNDS==='1')for(const round of [2,3]){
        await raid.waitForFunction(round=>{const d=window.NoxRaid.diagnostics();return d.state.round===round&&d.state.stage==='RHYTHM'&&d.playing;},round,{timeout:25000});
        await f.changeRoom(roomId,r=>{for(const m of r.members){m.hits=r.challenge.chart.map(n=>n.id);m.score=r.challenge.chart.length;}r.challenge.deadline=Date.now();tickNoxRoom(r,Date.now());});
        await pressMemory(raid,roomId,'memory-round'+round+'-'+visit);await finishCoop(raid,roomId);
      }
    }
    if(verifyDeath)await raid.locator('#retryButton').click();
    else if(official||practice){
      const dropRoll=verifyRyujin?mock.method(crypto,'getRandomValues',values=>values.fill(ryujinIndex)):null;
      await f.changeRoom(roomId,room=>{
        const now=Date.now();
        room.round=3;room.stage='EXPOSED';room.boss.hp=1;room.lastAttackAt=now-1500;
        room.challenge={id:roomId+':3:EXPOSED',stage:'EXPOSED',startsAt:now-1500,deadline:now+5000};
      });
      await raid.locator('#resultReward').waitFor({state:'visible'});
      dropRoll?.mock.restore();
      if(verifyRyujin){
        const material=raid.getByRole('dialog',{name:'류진 제작 재료 획득'});
        await material.waitFor();
        await material.locator('.bp-reveal-art').evaluate(img=>img.decode());
        assert.equal(await material.locator('.bp-reveal-item').innerText(),ryujinItem);
        assert.match(await material.locator('.bp-reveal-bg').getAttribute('src'),/blueprint-reveal-nox/);
        await material.screenshot({path:path.join(out,profile+'-ryujin.png'),animations:'disabled'});
        await material.getByRole('button',{name:'확인'}).click();
        const blueprint=raid.getByRole('dialog',{name:'희귀 설계도 획득'});
        await blueprint.getByRole('button',{name:'확인'}).click();
        assert((await raid.locator('#resultReward').innerText()).includes(ryujinItem+' 1개 획득'));
        assert.equal(await raid.locator('dialog.bp-reveal[open]').count(),0);
        report.ryujin={item:ryujinItem,blueprintAlsoShown:true};
      }
      assert.match(await raid.locator('#resultReward').innerText(),practice?/연습 보상 없음/:difficulty==='HELL'?/300조.*25억/:/100조.*10억/);
      if(practice){
        assert.equal(await raid.locator('#resultTitle').innerText(),'연습 클리어');
        assert.equal((await f.one('SELECT coin::text FROM users WHERE id=1')).coin,'0');
        assert.equal((await f.one('SELECT count(*)::int n FROM coin_logs WHERE user_id=1')).n,0);
        assert.equal((await f.one('SELECT count(*)::int n FROM raid_nox_entry_fees_v1')).n,0);
      }
      await page.screenshot({path:path.join(out,profile+'-reward-'+visit+'.png')});
      const used=(await f.call('feature?weekly=1')).body.weeklyReward?.used??0;
      const policyReload=official?page.waitForResponse(response=>response.url().includes('/api/raid/nox/feature?weekly=1')):Promise.resolve();
      await raid.locator('#retryButton').click();await policyReload;
      if(practice){
        assert.equal(used,0);
        assert.equal(await raid.locator('#weeklyReward').isVisible(),false);
      }else await raid.locator('#weeklyReward').filter({hasText:used+'/3회 수령'}).waitFor();
    }else if(process.env.NOX_RETRY_FAILURE==='1'){
      await f.changeRoom(roomId,r=>{r.status='FAILED';r.failure={code:'QA_RETRY',reason:'연속 재도전 검수'};r.revision++;});
      await raid.locator('#resultDialog').waitFor({state:'visible'});await raid.locator('#retryButton').click();
    }else await raid.locator('#leaveButton').click();
    await raid.waitForFunction(()=>!window.NoxRaid.diagnostics().mounted);
    const exitAt=Date.now();await page.waitForTimeout(Math.max(650,Number(process.env.NOX_ACTION_PROCESS_DELAY_MS||0)+100));const cleanup=await raid.evaluate(()=>{window.__noxHitObserver?.disconnect();return window.NoxRaid.diagnostics();});assert.equal(cleanup.poll,false);assert.equal(cleanup.raf,false);assert.equal(cleanup.playing,false);assert.equal(cleanup.preparedTracks,0);assert.equal(cleanup.hitVoices||0,0);assert.equal(cleanup.hitAnimations||0,0);assert.equal(cleanup.inputRequests,0);assert.equal(cleanup.inputPackets,0);assert.equal(cleanup.battle.canvases,0);assert.equal(cleanup.battle.viewportObserved,false);assert.deepEqual(cleanup.battle.art,{poses:0,fxFrames:0,invalid:0});assert.equal(requests.filter(r=>r.at>exitAt&&['raid/nox/state','raid/nox/action'].includes(r.endpoint)).length,0);
    if(!practice)for(const id of [2,3])await f.command('leave',{roomId},id);
    report.visits.push({visit,lobbyMs,prepareMs,viewport,music,frames:stats,exit:{poll:cleanup.poll,raf:cleanup.raf,playing:cleanup.playing,preparedTracks:cleanup.preparedTracks,canvases:cleanup.battle.canvases}});
    if(!retainedRaid||visit===Number(process.env.NOX_QA_VISITS||2)-1){await raid.locator('#exitRaid').click();await shell.locator('#noxLiveOverlay').waitFor({state:'detached'});}
  }
  if(report.timeOrigins)assert.equal(new Set(report.timeOrigins).size,1,'retry must reuse the same document without any refresh');
  report.api={count:requests.filter(r=>r.endpoint.startsWith('raid/nox/')).length,maxMs:Math.max(...requests.filter(r=>r.endpoint.startsWith('raid/nox/')).map(r=>r.ms)),failures:requests.filter(r=>r.endpoint.startsWith('raid/nox/')&&r.status>=400&&!r.injected&&!r.cancelled),actions:requests.filter(r=>r.endpoint==='raid/nox/action')};assert.equal(report.api.failures.length,0,JSON.stringify(report.api.failures));
  assert.equal(errors.length,0,JSON.stringify(errors));report.pass=true;
  }
}catch(error){report.pass=false;report.failure=error.stack;report.failureUi=await page.frames().find(f=>f.url().includes('/raid/nox/'))?.evaluate(()=>({toast:document.getElementById('toast')?.textContent,diagnostics:window.NoxRaid?.diagnostics()})).catch(()=>null);await page.screenshot({path:path.join(out,profile+'-failure.png')}).catch(()=>{});console.error(error.message);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'browser-'+profile+'.json'),JSON.stringify(report,null,2));const proof={command:'node tests/nox-live.browser.mjs',exitCode:report.pass?0:1,sources:['tests/nox-live.browser.mjs','raid/nox/raid.css','raid/nox/raid.mjs','raid/nox/floor.mjs','raid/nox/battle.src.js','raid/nox/battle.bundle.js','raid/nox/index.html'].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).digest('hex')}))};fs.writeFileSync(path.join(out,'browser-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(report));await browser.close();await f.close();await new Promise(r=>server.close(r));}
