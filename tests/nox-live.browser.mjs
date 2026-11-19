import {variantPaths} from '../shared/onestore-web-assets-v1.mjs';
import {htmlForStore} from '../functions/_onestore_web.js';
import {canonicalDocument} from '../shared/onestore-web-v1.mjs';
import fs from 'node:fs';import os from 'node:os';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {noxFixture} from './helpers/nox-live-fixture.mjs';
import {handleNoxLive} from '../functions/_raid_nox_live.js';
import {tickNoxRoom,actNoxRoom,NOX_RULES} from '../functions/_raid_nox.js';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.NOX_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'nox-browser-')),profile=process.argv[2]||'mobile',mobile=['mobile','webkit','h5'].includes(profile);
const f=await noxFixture(),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.woff2':'font/woff2','.mp3':'audio/mpeg'},requests=[],errors=[],broken=[];
const user={id:1,serverUserId:1,nickname:'녹스 검수',role:'OWNER',coin:999999999999999999,cardShards:0,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
let origin;
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,origin),store=url.pathname.startsWith('/onestore/'),pathname=store?url.pathname.slice('/onestore'.length):url.pathname;
  if(pathname==='/qa-host'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%}</style><iframe src="/onestore/?screen=home" title="H5 host"></iframe>');return;}
  if(pathname.startsWith('/api/')){const endpoint=pathname.slice(5),chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const started=performance.now();
    const request=new Request(url,{method:req.method,headers:{...req.headers,origin},...(body.length?{body}:{})});
    let response=await handleNoxLive({path:endpoint,request,env:f.env,deps:f.deps});
    if(!response){const data={'admin/dashboard':{role:'OWNER',admin:user,stats:{users:8,cards:5,totalCoin:0,draws24h:0},recentUsers:[],recentLogs:[],logs:[],recent:[]},'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]}}[endpoint]||{ok:true,visible:false,accessible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],rooms:[],settings:{}};response=Response.json(data);}
    requests.push({endpoint,at:Date.now(),ms:performance.now()-started,status:response.status});res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());return;
  }
  const storeAsset=variantPaths.includes(pathname)||['/h5-policy.js','/h5-sdk.js','/h5.css'].includes(pathname);if(store&&!storeAsset&&!canonicalDocument(url.pathname))throw Error('Unregistered store document');
  let name=decodeURIComponent(pathname).replace(/^\//,'');if(store&&(storeAsset||pathname==='/'))name='onestore/'+name;if(!name||name.endsWith('/'))name+='index.html';if(name.includes('..'))throw Error('path');let bytes;try{bytes=fs.readFileSync(path.join(root,name));}catch{bytes=execFileSync('git',['show','HEAD:'+name],{cwd:root,maxBuffer:30e6,windowsHide:true,stdio:['ignore','pipe','ignore']});}if(store&&name.endsWith('.html'))bytes=Buffer.from(htmlForStore(bytes.toString(),pathname));res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'public,max-age=600'});res.end(bytes);
}catch(error){res.writeHead(404,{'content-type':'text/plain'});res.end(error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await (profile==='webkit'?webkit:chromium).launch(profile==='webkit'?{headless:true,executablePath:'C:/Users/User/AppData/Local/ms-playwright/webkit-2336/Playwright.exe'}:{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,serviceWorkers:'block'});
await context.addInitScript(user=>{window.ONEstoreH5={on:()=>{},off:()=>{},onBackPressed:()=>{},openDeeplink:async()=>{},initializeAsync:async()=>({playerId:'isolated',safeArea:{},ringerSilent:true}),setLoadingProgress:()=>{},startGameAsync:async()=>{},getUserIdAsync:async()=>({userId:'isolated'})};localStorage.setItem('cnine_card_api_token','qa-1');localStorage.setItem('cnine_admin_token','qa-1');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_soop_watch_notice:20261026-v1:1','shown');},user);
await context.route('https://h5sdk.onestore.net/lib/v1.1.0/onestore-h5-sdk.min.js',route=>route.fulfill({contentType:'text/javascript',body:'export function createSDK(){return window.ONEstoreH5;}'}));
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))broken.push({url:r.url().replace(origin,''),status:r.status()});});
await page.addLocatorHandler(page.locator('.soop-consent-dialog[open]'),d=>d.locator('[data-soop-close]').first().click());
const report={profile,emulation:true,physicalDevice:false,network:'Windows loopback / PGlite; browser cache cold then warm',...(profile==='h5'?{h5Entry:'generated onestore/index.html with actual route allowlist; SDK host emulated'}:{}),visits:[],errors,broken};
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
  for(let visit=0;visit<2;visit++){
    const openAt=performance.now();await shell.locator('#noxRaidTab').click();let raid;for(let i=0;i<100&&!raid;i++){raid=page.frames().find(f=>f.url().includes('/raid/nox/'));if(!raid)await page.waitForTimeout(50);}assert(raid);
    await raid.waitForFunction(()=>!document.getElementById('createButton')?.disabled);const lobbyMs=performance.now()-openAt;
    const viewport=await raid.evaluate(()=>({w:innerWidth,h:innerHeight,root:document.querySelector('#lobby').getBoundingClientRect().toJSON(),fee:document.getElementById('feeMode').textContent}));assert.match(viewport.fee,/TEST.*무료/);
    if(visit===0)await page.screenshot({path:path.join(out,profile+'-lobby.png')});
    await raid.locator('input[name=size][value="3"]').check();await raid.locator('#createButton').click();await raid.locator('#assembly').waitFor({state:'visible'});const roomId=await raid.locator('#roomCode').innerText();
    for(const id of [2,3]){assert.equal((await f.command('join',{roomId},id)).status,200);assert.equal((await f.command('ready',{roomId,ready:true,acceptedCoins:'0'},id)).status,200);}
    const prepareAt=performance.now();await raid.locator('#readyButton').click();await raid.locator('#startButton').waitFor({state:'visible',timeout:30000});const prepareMs=performance.now()-prepareAt;
    await raid.locator('#startButton').click();await raid.waitForFunction(()=>window.NoxRaid?.diagnostics().state?.status==='ACTIVE');
    await raid.waitForFunction(()=>document.getElementById('rhythm')&&!document.getElementById('rhythm').hidden);
    // Drive the real input listener at the audio clock's first eight notes.
    let hits;if(mobile&&profile!=='webkit'){const notes=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.challenge.chart.slice(0,8));for(const n of notes){const b=await raid.locator('.nox-keys [data-nox-lane="'+n.lane+'"]').boundingBox();await raid.waitForFunction(at=>window.NoxRaid.diagnostics().audioPositionMs>=at-10,n.at,{timeout:15000,polling:'raf'});await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}await page.waitForTimeout(900);hits=await raid.evaluate(()=>window.NoxRaid.diagnostics().state.me.hits.length);report.realTouchKeys=true;}else hits=await raid.evaluate(async()=>{const notes=window.NoxRaid.diagnostics().state.challenge.chart.slice(0,8),keys=['KeyD','KeyF','KeyJ','KeyK'];return await new Promise(resolve=>{let next=0;const run=()=>{const d=window.NoxRaid.diagnostics(),age=d.audioPositionMs;if(age!==null)while(next<notes.length&&age>=notes[next].at){const n=notes[next++],k=keys[n.lane];document.dispatchEvent(new KeyboardEvent('keydown',{code:k,key:k.slice(3).toLowerCase(),bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:k,key:k.slice(3).toLowerCase(),bubbles:true}));}if(next===notes.length){setTimeout(()=>resolve(window.NoxRaid.diagnostics().state.me.hits.length),900);return;}requestAnimationFrame(run);};run();});});assert(hits>=7,'key inputs should score: '+hits);
    await page.screenshot({path:path.join(out,profile+'-rhythm-'+visit+'.png')});
    const stats=await raid.evaluate(()=>{const d=window.NoxRaid.diagnostics(),a=d.frameTimes.sort((a,b)=>a-b);return {samples:a.length,p95:a[Math.floor(a.length*.95)]||0,max:a.at(-1)||0,over50:a.filter(t=>t>50).length,hits:d.state.me.hits.length,score:d.state.me.score,clockError:d.serverNowEstimate-Date.now(),inflight:d.inflight};});
    await f.changeRoom(roomId,r=>{for(const m of r.members){m.hits=r.challenge.chart.map(n=>n.id);m.score=r.challenge.chart.length;}r.challenge.deadline=Date.now();tickNoxRoom(r,Date.now());});
    await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.stage==='MEMORY');await raid.locator('.nox-floor-target').first().waitFor({state:'visible'});assert.equal(await raid.locator('.nox-floor-target').count(),30);
    const memory=JSON.parse((await f.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json).challenge;
    await raid.waitForFunction(()=>!document.querySelector('.nox-floor-target').disabled);
    for(const tile of memory.sequence)await raid.locator('[data-nox-tile="'+tile+'"]').click({force:true});
    await raid.waitForFunction(()=>window.NoxRaid.diagnostics().state.me.memoryIndex===3,{},{timeout:5000});
    await page.screenshot({path:path.join(out,profile+'-floor-'+visit+'.png')});
    await raid.locator('#leaveButton').click();await raid.waitForFunction(()=>!window.NoxRaid.diagnostics().mounted);
    const exitAt=Date.now();await page.waitForTimeout(650);const cleanup=await raid.evaluate(()=>window.NoxRaid.diagnostics());assert.equal(cleanup.poll,false);assert.equal(cleanup.raf,false);assert.equal(cleanup.playing,false);assert.equal(cleanup.battle.canvases,0);assert.equal(requests.filter(r=>r.at>exitAt&&r.endpoint.startsWith('raid/nox/')).length,0);
    for(const id of [2,3])await f.command('leave',{roomId},id);
    report.visits.push({visit,lobbyMs,prepareMs,viewport,frames:stats,exit:{poll:cleanup.poll,raf:cleanup.raf,playing:cleanup.playing,canvases:cleanup.battle.canvases}});
    await raid.locator('#exitRaid').click();await shell.locator('#noxLiveOverlay').waitFor({state:'detached'});
  }
  report.api={count:requests.filter(r=>r.endpoint.startsWith('raid/nox/')).length,maxMs:Math.max(...requests.filter(r=>r.endpoint.startsWith('raid/nox/')).map(r=>r.ms)),failures:requests.filter(r=>r.endpoint.startsWith('raid/nox/')&&r.status>=400)};assert.equal(report.api.failures.length,0,JSON.stringify(report.api.failures));
  assert.equal(errors.length,0,JSON.stringify(errors));report.pass=true;
  }
}catch(error){report.pass=false;report.failure=error.stack;report.failureUi=await page.frames().find(f=>f.url().includes('/raid/nox/'))?.evaluate(()=>({toast:document.getElementById('toast')?.textContent,diagnostics:window.NoxRaid?.diagnostics()})).catch(()=>null);await page.screenshot({path:path.join(out,profile+'-failure.png')}).catch(()=>{});console.error(error.message);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'browser-'+profile+'.json'),JSON.stringify(report,null,2));const proof={command:'node tests/nox-live.browser.mjs',exitCode:report.pass?0:1,sources:['tests/nox-live.browser.mjs','raid/nox/raid.css','raid/nox/raid.mjs','raid/nox/floor.mjs'].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).digest('hex')}))};fs.writeFileSync(path.join(out,'browser-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(report));await browser.close();await f.close();await new Promise(r=>server.close(r));}
