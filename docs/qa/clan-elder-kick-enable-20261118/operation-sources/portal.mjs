import {handleOrganization as baselineOrganization} from './runtime-before.mjs';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {chromium, webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {htmlForStore} from '../../operations/coop-pc-performance-20261108/source/functions/_onestore_web.js';
import {runInNewContext} from 'node:vm';

const [phase='candidate',platform='desktop',widthArg]=process.argv.slice(2);
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const mobile=['ios','android','h5'].includes(platform), native=platform==='windows', h5=platform==='h5';
const width=Number(widthArg)||(mobile?390:1440), height=mobile?844:900;
const src=path.resolve(import.meta.dirname,'../../operations/coop-pc-performance-20261108/source');
const launch=process.argv.includes('--launch'),sample=process.argv.find(x=>/^--sample=\d+$/.test(x))?.split('=')[1];
const out=path.join(import.meta.dirname,'portal',phase+'-'+platform+'-'+width+(launch?'-launch':'')+(sample?'-sample'+sample:''));
fs.mkdirSync(out,{recursive:true});
const baseline=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'service-before.json'))).head, publicOrigin='https://cnine-card.pages.dev';
const repo=(...args)=>execFileSync('git',['-c','gc.auto=0',...args],{cwd:src,windowsHide:true,maxBuffer:64000000});
const revision=phase==='before'?baseline:'HEAD';
const changedSinceBaseline=new Set(phase==='before'?repo('diff','--name-only',baseline).toString().trim().split('\n'):[]);
const blobs=spawn('git',['-c','gc.auto=0','cat-file','--batch'],{cwd:src,stdio:['pipe','pipe','ignore'],windowsHide:true});
const chunks=blobs.stdout[Symbol.asyncIterator]();let pending=Buffer.alloc(0),chain=Promise.resolve();
async function more(){const {value,done}=await chunks.next();if(done)throw Error('Git stream closed');pending=Buffer.concat([pending,value]);}
async function blob(file){blobs.stdin.write(revision+':'+file+'\n');while(!pending.includes(10))await more();
 const nl=pending.indexOf(10),header=pending.subarray(0,nl).toString();pending=pending.subarray(nl+1);
 if(header.endsWith(' missing'))return null;const n=Number(header.split(' ').at(-1));assert(Number.isSafeInteger(n));
 while(pending.length<=n)await more();const body=pending.subarray(0,n);pending=pending.subarray(n+1);return body;}
const mime={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',webp:'image/webp',avif:'image/avif',png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg',jfif:'image/jpeg',woff2:'font/woff2',ttf:'font/ttf',mp3:'audio/mpeg'};
const cache=new Map();
function asset(file){if(!cache.has(file)){
 const disk=path.join(src,file);const data=!changedSinceBaseline.has(file)&&fs.existsSync(disk)?fs.promises.readFile(disk):(chain=chain.then(()=>blob(file)));
 cache.set(file,data);
 }return cache.get(file);}
const cards=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../all-platform-runtime-performance-20261108/public-cards.json'))).cards;
const owned=cards.slice(0,38).map(c=>c.id), deck=owned.slice(0,5);
const user={id:2,serverUserId:2,nickname:'전장 검수',role:'USER',coin:100000,owned,quantities:Object.fromEntries(owned.map(id=>[id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const monster={id:1,name:'토벌 수호자',battle_power:350000,battlePower:350000,image:'assets/cards/monster/sla2.jfif',mode:'NORMAL'};
const monsters=[
 {...monster,id:1,name:'슬라임',rewardCoin:15000},
 {...monster,id:2,name:'푸른 수호자',image:'assets/cards/monster/blue2.jfif',rewardCoin:30000},
 {...monster,id:3,name:'광휘의 제독',image:'assets/cards/monster/kizaru2.webp',rewardCoin:50000},
 {...monster,id:4,name:'심연의 용',image:'assets/cards/monster/dragon1.jfif',pveTab:'HARD',rewardCoin:120000},
 {...monster,id:81,name:'카르겐',pveTab:'APOCALYPSE',image:'assets/cards/monster/dragon1.jfif',recommendedPower:2200000000,rewardCoin:1500000000,apocalypse:{skill:{minionCount:6}}}
];
let saved=[...deck];
const api=[],errors=[],metrics={phase,platform,width,height,entry:[],errors};

const liveFeed=await (await fetch(publicOrigin+'/api/live-operations',{cache:'no-store'})).json();
let items=liveFeed.items;
const {seasonKickFixture}=await import('file:///'+src.replaceAll('\\','/')+'/tests/helpers/clan-season-kick-fixture.mjs');
const f=await seasonKickFixture();let actor=2;const current=f.c;
metrics.conditions='Windows headless browser; isolated PostgreSQL; actual lobby entry; Windows URL/H5 iframe emulation, not physical devices';
function fixture(p,req){
 api.push({path:p,method:req.method(),at:Date.now()});
 if(p==='battle/deck'&&req.method!=='GET'){const body=req.postDataJSON?.()||{};saved=body.cardIds||body.deck||saved;return{ok:true,deck:saved};}
 if(p==='live-operations')return {items,serverNow:new Date().toISOString(),pollSeconds:30};
 if(p==='clan/overview')return {ok:true,restoration:{restored:true,message:'시즌 5 원로 모집'},resumption:{enabled:true,nextSeasonCalendar:current},season:{id:9,phase:'COMPLETE',seasonNo:4},teams:[],roster:[],organizationPreparation:{restored:true}};
 if(p==='battle/config')return {settings:{enabled:true},deck:saved,monsters,energy:{energy:30,maxEnergy:30},apocalypseEnergy:{energy:10,maxEnergy:10},characterBonus:{equipmentPve:12500000,garagePve:1250000,pve:43200000},battleEngine:{active:true,version:'V3'},serverNow:new Date().toISOString()};
 if(p==='loot-shop/balance')return{pigCoins:0,balance:0};
 if(p==='chief/status')return{chief:{active:false,viewerAvatar:{code:'AVATAR-F01',name:'서리 전략가',lobbyImage:'/assets/ui/avatars-v1/lobby-v1/avatar-f01-azure-frost-strategist-lobby-v1-1024.webp',lobbyMobileImage:'/assets/ui/avatars-v1/lobby-v1/avatar-f01-azure-frost-strategist-lobby-v1-640.webp'}}};
 return ({cards:{cards},packs:{packs:[]},'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},'me/menu-favorites':{userId:2,routes:[],revision:1},'live-operations':{items:[],pollSeconds:60,serverNow:new Date().toISOString()},'legion-hunt/status':{canEnter:true,access:{mode:'ON'}},'pve/v3/feature':{enabled:true,publicContent:{COW_ROOM:{enabled:true}}},'loot-shop/balance':{pigCoins:0},'tower/config':{enabled:true},'coop/feature':{visible:true,mode:'ON'},'messages':{messages:[],unread:0}})[p]||{ok:true,enabled:false,visible:false,items:[],settings:{},cards:[],list:[],presets:[],routes:[],loadouts:[],profiles:[]};
}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let file=decodeURIComponent(url.pathname.slice(1));if(file.includes('..')||file.includes('\\'))return res.writeHead(400).end();if(!file||file.endsWith('/'))file+='index.html';const bytes=await asset(file);res.writeHead(bytes?200:404,{'content-type':mime[file.split('.').at(-1)]||'application/octet-stream','cache-control':/\.(js|html|css|mjs)$/.test(file)?'no-cache':'public, max-age=86400'});res.end(bytes);}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
const origin=phase==='public'?publicOrigin:local;
let browser,ctx,child,page,host;
try{
 browser=await(platform==='ios'?webkit:chromium).launch(platform==='ios'?{headless:true}:{headless:true,channel:'chrome',args:['--mute-audio']});ctx=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,locale:'ko-KR',deviceScaleFactor:1,serviceWorkers:'block'});host=await ctx.newPage();
 page=host;metrics.knownWarnings=[];host.on('pageerror',e=>{if(e.message==='ResizeObserver loop completed with undelivered notifications.')metrics.knownWarnings.push(e.message);else errors.push(e.message);});host.on('dialog',d=>d.accept());host.setDefaultTimeout(10000);
 await ctx.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','isolated-pve-entry');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_sfx_volume','0');localStorage.setItem('soop-lobby-bgm-muted-v1','1');performance.setResourceTimingBufferSize(6000);
 const records=new Map();for(const [name,target] of [['window',window],['viewport',window.visualViewport]])if(target){const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);target.addEventListener=(type,fn,options)=>{if(['scroll','resize'].includes(type)){const key=name+':'+type,m=records.get(key)||new Map(),flags=m.get(fn)||new Set();flags.add(options===true||options?.capture===true);m.set(fn,flags);records.set(key,m);}return add(type,fn,options);};target.removeEventListener=(type,fn,options)=>{const m=records.get(name+':'+type),flags=m?.get(fn);flags?.delete(options===true||options?.capture===true);if(flags&&!flags.size)m.delete(fn);return remove(type,fn,options);};}window.qaListenerCounts=()=>Object.fromEntries(['window:scroll','window:resize','viewport:scroll','viewport:resize'].map(key=>[key,[...(records.get(key)?.values()||[])].reduce((n,s)=>n+s.size,0)]));
 localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+u.serverUserId,'shown');
 const lobby=()=>{const root=document.querySelector('soop-adventure-lobby')?.shadowRoot,btn=[...(root?.querySelectorAll('#depart-button,[data-category="all"],[data-category="pve"],.mobile-more')||[])].find(b=>b.getClientRects().length);if(btn){window.qaLobby=performance.now();return;}requestAnimationFrame(lobby);};if(location.pathname==='/'||location.pathname==='/onestore/'){
  requestAnimationFrame(lobby);
  const ready=()=>{const c=document.querySelector('#lobby-operations-summary [data-live-operations-count]');
    if(c?.textContent.includes('건')){requestAnimationFrame(()=>{window.qaStatusReady=performance.now()});return;}requestAnimationFrame(ready);};requestAnimationFrame(ready);
 }},user);
 await ctx.routeWebSocket('**/*',ws=>ws.close());
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());
  if(phase==='public'&&u.origin===publicOrigin&&u.pathname==='/api/live-operations'&&route.request().method()==='GET'){
    const response=await route.fetch({headers:{accept:'application/json'},timeout:20000});
    assert.equal(response.status(),200);const actual=await response.json();
    const target=list=>list.find(e=>e.kind==='ORGANIZATION');
    assert.equal(target(actual.items)?.deadlineAt,target(liveFeed.items)?.deadlineAt);
    assert.match(target(actual.items)?.title,/클랜/);
    metrics.publicFeed={status:response.status(),serverNow:actual.serverNow,nextTerritoryChangeAt:actual.nextTerritoryChangeAt,items:actual.items};
    api.push({path:'live-operations',method:'GET',at:Date.now()});
    return route.fulfill({response});
  }
  if(u.pathname.startsWith('/api/organization/')){
   const endpoint=u.pathname.slice(5),method=route.request().method();
   api.push({path:endpoint,method,at:Date.now()});const args={user:actor,method,...(method==='POST'?{body:route.request().postDataJSON()}:{} )};
   let response;
   if(endpoint.startsWith('organization/faction/'))response=await f.call(endpoint,args);
   else if(phase==='before'){
    const r=await baselineOrganization({path:endpoint,env:f.env,deps:f.deps,request:new Request('https://example.test/api/'+endpoint,{method,headers:{'x-user':String(actor),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(args.body)}:{})})});
    response={status:r.status,data:await r.json()};
   }else response=await f.organizationCall(endpoint,args);
   return route.fulfill({json:response.data,status:response.status});
  }
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixture(u.pathname.slice(5),route.request())});
  if(h5&&u.origin===publicOrigin&&phase!=='public'){
   const doc=u.pathname==='/onestore/'?'/':u.pathname==='/onestore/defense/'?'/defense/':null;
   const source=doc&&doc!=='/'?doc:u.pathname;
   const r=await fetch(local+source+u.search);const body=Buffer.from(await r.arrayBuffer());
   return route.fulfill({status:r.status,contentType:r.headers.get('content-type')||'',body:doc?htmlForStore(body.toString(),doc):body});
  }
  if(u.origin===origin||u.protocol==='data:'||['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'].includes(u.hostname)||u.hostname.endsWith('.cnine-card.pages.dev')||u.hostname==='cnine-card.pages.dev')return route.continue();
  return route.abort();});
 if(h5){const h=repo('show','HEAD:tests/onestore-web-20261026.browser.mjs').toString().split('const hostHtml=`')[1].split('</iframe>`;')[0].replaceAll('${gameOrigin}',publicOrigin)+'</iframe>';
  await ctx.route('https://h5sdk.onestore.net/**',r=>r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(import.meta.dirname,'../all-platform-runtime-performance-20261108/onestore-h5-sdk.min.js'))}));
  await ctx.route('https://qa.onestore.net/**',r=>r.fulfill({contentType:'text/html',body:h}));await host.goto('https://qa.onestore.net/',{waitUntil:'domcontentloaded'});await host.frameLocator('iframe').locator('soop-adventure-lobby').waitFor({timeout:60000});page=host.frames().find(f=>f.url().startsWith(publicOrigin));assert(page);
 }else await page.goto(origin+'/?screen=home'+(native?'&source=windows-client':''),{waitUntil:'domcontentloaded',timeout:90000});
 await host.addLocatorHandler(h5?host.frameLocator('iframe').locator('.soop-consent-dialog[open]'):page.locator('.soop-consent-dialog[open]'),d=>d.evaluate(el=>el.querySelector('[data-soop-close]')?.click(),null,{timeout:1200}).catch(()=>{}));



 const board=page.locator('soop-adventure-lobby [data-category="all"]:visible').first();
 await board.waitFor({timeout:45000});
 metrics.coldLobbyMs=await page.evaluate(()=>Math.round(performance.now()));
 for(let i=0;i<2;i++){
  await board.waitFor();const first=api.length;const start=performance.now();
  await board.click();const entry=page.locator('soop-adventure-lobby [data-route="clan"]:visible').first();metrics.entrySurface='로비 전체 메뉴 → 클랜';
  await entry.click();
  const frame=page.frameLocator('iframe.org-live-frame');
  await frame.locator('.org-nav [data-tab="mine"]').waitFor({timeout:40000});await frame.locator('.org-nav [data-tab="mine"]').click();await frame.locator('.org-member-grid').waitFor();
  const buttons=await frame.locator('[data-org-kick]').count();assert.equal(buttons,phase==='before'?0:6);
  metrics.entry.push({ms:Math.round(performance.now()-start),kickButtons:buttons,calls:api.slice(first).filter(a=>a.path.startsWith('organization/')||a.path==='clan/overview').map(a=>a.path)});
  if(i===0){await frame.locator('.org-member-section').scrollIntoViewIfNeeded();await host.screenshot({path:path.join(out,'elder-roster.png')});}
  if(i===1){
   await frame.locator('body').evaluate(()=>{window.qaFrames=[];let p;const tick=t=>{if(p)qaFrames.push(t-p);p=t;window.qaFrame=requestAnimationFrame(tick);};window.qaFrame=requestAnimationFrame(tick);});
   if(phase!=='before'){
    const n=api.filter(a=>a.path==='organization/member/kick').length,listenerBaseline=await page.evaluate(()=>qaListenerCounts());
    await frame.locator('[data-org-kick="5"]').click();await frame.locator('[data-kick-cancel]').click();assert.equal(api.filter(a=>a.path==='organization/member/kick').length,n);metrics.cancelWithoutMutation=true;assert.deepEqual(await page.evaluate(()=>qaListenerCounts()),listenerBaseline);
    await frame.locator('[data-org-kick="5"]').click();await host.screenshot({path:path.join(out,'elder-confirmation.png')});await frame.locator('[data-kick-confirm]').click();
    await frame.locator('.org-kick-dialog').waitFor({state:'detached'});await frame.locator('[data-org-kick="5"]').waitFor({state:'detached'});assert.equal(await frame.locator('[data-org-kick]').count(),5);
    assert.equal((await f.q('SELECT user_id FROM organization_members_v1 WHERE round_id=$1 AND user_id=5',[f.season.roundId])).length,0);
    assert.equal((await f.q('SELECT user_id FROM clan_members WHERE season_id=$1 AND user_id=5',[f.season.seasonId])).length,0);
    assert.equal((await f.q("SELECT target_id FROM admin_logs WHERE action_type='ORGANIZATION_ELDER_MEMBER_KICK' AND target_id='5'")).length,1);metrics.removedBothRostersOnce=true;assert.deepEqual(await page.evaluate(()=>qaListenerCounts()),listenerBaseline);metrics.dialogListenersReleased=true;
   }
   await host.waitForTimeout(850);
   metrics.frames=await frame.locator('body').evaluate(()=>{cancelAnimationFrame(qaFrame);const a=qaFrames.sort((x,y)=>x-y);return {samples:a.length,p95Ms:+(a[Math.floor(a.length*.95)]||0).toFixed(1),maxMs:+(a.at(-1)||0).toFixed(1),over50:a.filter(x=>x>50).length,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.equal(metrics.frames.overflow,false);
  }
  const home=page.locator('.v21-route-command-head [data-v21-home]:visible').first();await home.click();
  await board.waitFor();await page.waitForFunction(()=>!document.querySelector('iframe.org-live-frame'));
 }
 const count=api.filter(a=>a.path.startsWith('organization/')).length;await host.waitForTimeout(1450);metrics.postExit=api.filter(a=>a.path.startsWith('organization/')).length-count;assert.equal(metrics.postExit,0);
 metrics.isolatedAccount=true;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify({platform,phase,entrySurface:metrics.entrySurface,entry:metrics.entry,afterExit:metrics.postExit,frames:metrics.frames,removedBothRostersOnce:metrics.removedBothRostersOnce,cancelWithoutMutation:metrics.cancelWithoutMutation}));
}catch(e){metrics.failure=e.message;metrics.calls=api;metrics.body=await page.locator('body').innerText().catch(()=>null);await host.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(metrics,null,2));throw e;}finally{await browser?.close().catch(()=>{});child?.kill();blobs.stdin.end();blobs.kill();server.closeAllConnections();server.close();await f.closeDb();}
