import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve(import.meta.dirname,'..');
const {auctionLiveFixture}=await import(pathToFileURL(root+'/tests/helpers/auction-live-fixture-20261103.mjs'));
const publicRun=process.argv.includes('--public'),baseline=process.argv.includes('--baseline');
const evidence=process.env.AUCTION_BGM_MOBILE_OUTPUT||path.resolve(root,'../../../operations/auction-bgm-mobile-20261106');
const out=path.join(evidence,publicRun?'public':baseline?'before':'browser');fs.mkdirSync(out,{recursive:true});
const cache=new Map(),missing=[];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{
 const key=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(key==='/favicon.ico')return res.writeHead(204).end();
 if(key.startsWith('/api/')||!['GET','HEAD'].includes(req.method))return res.writeHead(403).end();
 const file=path.resolve(root,'.'+key);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 let bytes;
 if(!baseline&&fs.existsSync(file)&&fs.statSync(file).isFile())bytes=fs.readFileSync(file);
 else{if(!cache.has(key)){try{cache.set(key,execFileSync('git',['-c','gc.auto=0','show',(baseline?'699b6a64b6505c4afd53e2f839c56bf10376a9c3':'HEAD')+':'+key.slice(1)],{cwd:root,maxBuffer:64e6,windowsHide:true,stdio:['ignore','pipe','ignore']}));}catch{missing.push(key);return res.writeHead(404).end();}}bytes=cache.get(key);}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(bytes);
}catch(e){res.writeHead(500).end(e.message);}});
if(!publicRun)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=publicRun?'https://cnine-card.pages.dev':'http://127.0.0.1:'+server.address().port;
const reports=[],user={id:2,serverUserId:2,nickname:'현하루',role:'USER',coin:500e12,pigCoins:0,cardShards:0,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
function init({user,blocked=false}){
 localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-auction-fixture');localStorage.setItem('cnine_soop_watch_notice:20261026-v1:2','shown');
 window.__audioCalls=[];window.__audioInstances=[];window.__rejectTrack=blocked;
 window.Audio=class extends EventTarget{
  constructor(){super();this.src='';this.readyState=1;this.duration=60;this.currentTime=0;this.volume=1;this.paused=true;window.__audioInstances.push(this);}
  setAttribute(){}getAttribute(name){return this[name]||null;}removeAttribute(){this.src='';}load(){}
  play(){const track=!!this.src&&!this.src.startsWith('data:');window.__audioCalls.push({action:'play',src:this.src,volume:this.volume,track});if(track&&window.__rejectTrack)return Promise.reject(Error('Autoplay blocked'));this.paused=false;return Promise.resolve();}
  pause(){window.__audioCalls.push({action:'pause',src:this.src,track:!!this.src&&!this.src.startsWith('data:')});this.paused=true;}
 };
}
const rect=page=>page.locator('.auc-bgm-event').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:visualViewport?.height||innerHeight,offsetTop:visualViewport?.offsetTop||0,scrollX:scrollX,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1,position:localStorage.getItem('cnine_auction_bgm_position_v1')};});
const visible=r=>{assert(r.x>=0&&r.x+r.width<=r.viewportWidth+1,JSON.stringify(r));assert(r.y>=r.offsetTop+11&&r.y+r.height<=r.offsetTop+r.viewportHeight-11,JSON.stringify(r));assert.equal(r.bodyOverflow,false);};
const calls=page=>page.evaluate(()=>window.__audioCalls.filter(c=>c.track));
async function open(page){await page.goto(base+'/index.html',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.CNineUserAuction&&typeof window.renderShell==='function',{},{timeout:60000});await page.evaluate(()=>window.renderShell('auction'));await page.locator('#auc-amount').waitFor({timeout:45000});await page.evaluate(()=>document.fonts.ready);}
async function gesture(page,engine,dy){
 const b=await rect(page),x=b.x+30,y=b.y+Math.min(44,b.height/2),end=Math.max(0,Math.min(b.viewportHeight-1,y+dy));
 if(engine===chromium&&b.viewportWidth<560){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*i/8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,end,{steps:8});await page.mouse.up();}
 return rect(page);
}
const profiles=publicRun||baseline?[{name:publicRun?'public-webkit-390':'before-webkit-390',width:390,engine:webkit}]:[{name:'webkit-390',width:390,engine:webkit},{name:'touch-320',width:320,engine:chromium},{name:'webkit-430',width:430,engine:webkit},{name:'desktop-1440',width:1440,engine:chromium}];
try{for(const profile of profiles){
 const f=await auctionLiveFixture(),browser=await profile.engine.launch({headless:true,...(profile.engine===chromium?{channel:'chrome',args:['--mute-audio']}:{})});
 const errors=[],failed=[],external=[],writes=[];
 let page;
 try{
  f.sql.prepare('UPDATE users SET nickname=? WHERE id=2').run('현하루');
  const first=await f.service.host(f.user(3),{kind:'MERCENARY',ref:'V-971',quantity:1,startPrice:100e12,requestId:f.requestId()});
  f.sql.prepare("INSERT INTO auction_bgm_rules_v1554 VALUES(1,0,200700,200700,'/qa-auction-song.mp3#av=65',60,0)").run();
  const height=profile.width<560?664:900,context=await browser.newContext({viewport:{width:profile.width,height},isMobile:profile.width<560,hasTouch:profile.width<560,serviceWorkers:'block'});
  await context.addInitScript(init,{user});
  await context.route('**/*',async r=>{
   const url=new URL(r.request().url());
   if(url.origin!==new URL(base).origin){external.push(url.origin);return r.abort();}
   if(!url.pathname.startsWith('/api/'))return r.continue();
   const key=url.pathname.slice(5),body=r.request().method()==='POST'?r.request().postDataJSON():undefined;if(body)writes.push(key);
   if(key.startsWith('auction/user/')){const result=await f.route(2,key.slice('auction/user/'.length)+url.search,body);return r.fulfill({status:result.status,json:result.body});}
   const data={'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}};
   return r.fulfill({json:data[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{},members:[],users:[],logs:[],rankings:[]}});
  });
  const monitor=p=>{p.on('pageerror',e=>{if(!/ResizeObserver loop/.test(e.message))errors.push(e.message);});p.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});};
  page=await context.newPage();monitor(page);await open(page);
  await page.locator('#auc-amount').scrollIntoViewIfNeeded();
  await f.service.bid(f.user(2),{lotId:first.lot.id,amount:200700,requestId:f.requestId()});
  await page.locator('.auc-bgm-event:not([hidden])').waitFor();await page.waitForFunction(()=>window.__audioCalls.some(c=>c.track&&c.action==='play'));
  const initial=await rect(page);await page.screenshot({path:path.join(out,profile.name+'-compact.png')});
  if(baseline){reports.push({profile:profile.name,initial});continue;}
  visible(initial);assert.equal(initial.width,Math.min(profile.width<560?300:420,profile.width-24));assert(initial.height<=(profile.width<560?190:210));assert(Math.abs(initial.y+initial.height/2-initial.viewportHeight/2)<2);
  const playing=await calls(page);
  assert.equal(playing.at(-1).volume,.65,'Unconfigured users retain the catalog volume');
  const volume=page.locator('.auc-bgm-event [data-bgm-volume]');
  assert.equal(await volume.inputValue(),'65');
  await volume.focus();await volume.press('Home');
  assert.equal(await page.evaluate(()=>window.__audioInstances.find(a=>a.src.includes('qa-auction-song')).muted),true);
  assert.equal(await page.locator('[data-bgm-volume-value]').innerText(),'0%');
  await volume.press('End');assert.equal(await volume.inputValue(),'100');
  await volume.press('ArrowLeft');assert.equal(await volume.inputValue(),'99');
  assert.equal(await page.evaluate(()=>window.__audioInstances.find(a=>a.src.includes('qa-auction-song')).volume),.99);
  await page.locator('[data-bgm-mute]').click();assert.equal(await volume.inputValue(),'0');
  await page.locator('[data-bgm-mute]').click();assert.equal(await volume.inputValue(),'99');
  const sliderBox=await volume.boundingBox();
  await page.mouse.click(sliderBox.x+sliderBox.width*.4,sliderBox.y+sliderBox.height/2);
  const selected=Number(await volume.inputValue());assert(selected>0&&selected<99);
  assert(Math.abs((await rect(page)).y-initial.y)<1,'Volume input must not drag the banner');
  assert.deepEqual(await calls(page),playing,'Volume changes must not restart the song');
  await page.getByRole('button',{name:'♪ BGM 발동표'}).click();
  const guideVolume=page.locator('.auc-dialog [data-bgm-volume]');assert.equal(Number(await guideVolume.inputValue()),selected);
  await guideVolume.press('ArrowRight');const savedVolume=Number(await guideVolume.inputValue());
  assert.equal(Number(await volume.inputValue()),savedVolume);
  assert.equal(await page.evaluate(()=>window.__audioInstances.find(a=>a.src.includes('qa-auction-song')).volume),savedVolume/100);
  await page.screenshot({path:path.join(out,profile.name+'-volume-settings.png')});
  await page.locator('.auc-close').click();assert.deepEqual(await calls(page),playing);
  await page.screenshot({path:path.join(out,profile.name+'-volume.png')});
  const up=await gesture(page,profile.engine,-80),down=await gesture(page,profile.engine,130);assert(up.y<initial.y-60);assert(down.y>up.y+110);assert.equal(up.x,initial.x);assert.equal(down.x,initial.x);assert.deepEqual(await calls(page),playing);
  const bottom=await gesture(page,profile.engine,2000),top=await gesture(page,profile.engine,-2000);visible(bottom);visible(top);assert.equal(Math.round(top.y),12);assert(Math.abs(bottom.y+bottom.height-bottom.viewportHeight+12)<2);
  const moved=await gesture(page,profile.engine,100);assert(moved.y>90);await page.screenshot({path:path.join(out,profile.name+'-moved.png')});
  const preferred=await page.evaluate(()=>localStorage.getItem('cnine_auction_bgm_position_v1'));assert(preferred!==null);
  await page.locator('#auc-amount').fill('2000000000000');assert.equal(await page.locator('#auc-amount').inputValue(),'2000000000000');assert.deepEqual(await calls(page),playing);
  f.sql.prepare('UPDATE users SET nickname=? WHERE id=2').run('아주긴닉네임도화면안에서보이는지확인');
  await f.service.bid(f.user(2),{lotId:first.lot.id,amount:200700,message:'함께하는 경매! '.repeat(4),requestId:f.requestId()});f.advance(61000);
  await page.waitForFunction(()=>document.querySelector('[data-bgm-message]')?.textContent.includes('함께하는'),{},{timeout:15000});
  const next=await rect(page);visible(next);assert.equal(next.position,preferred);assert.equal(await page.locator('[data-bgm-message]').isVisible(),true);
  assert.equal(Number(await volume.inputValue()),savedVolume);assert.equal((await calls(page)).filter(c=>c.action==='play').at(-1).volume,savedVolume/100);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(180);const landscape=await rect(page);visible(landscape);assert.equal(landscape.position,preferred);
  await page.setViewportSize({width:profile.width<560?profile.width:390,height:360});await page.waitForTimeout(180);const keyboardViewport=await rect(page);visible(keyboardViewport);assert.equal(keyboardViewport.position,preferred);
  await page.setViewportSize({width:profile.width,height});await page.waitForTimeout(180);
  // WebKit does not expose native touch injection in Playwright; exercise its
  // touch PointerEvent path in addition to the real pointer/capture drag above.
  if(profile.engine===webkit){
   await page.locator('.auc-bgm-event').evaluate(el=>{const y=el.getBoundingClientRect().top+30;for(const [type,clientY] of [['pointerdown',y],['pointermove',y+40],['pointercancel',y+40]])el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:77,pointerType:'touch',isPrimary:true,button:0,clientX:el.getBoundingClientRect().left+30,clientY}));});
   assert.equal(await page.locator('.auc-bgm-event.is-dragging').count(),0);visible(await rect(page));
  }
  const saved=await page.evaluate(()=>localStorage.getItem('cnine_auction_bgm_position_v1'));
  await open(page);await page.locator('.auc-bgm-event:not([hidden])').waitFor();const reload=await rect(page);visible(reload);assert.equal(reload.position,saved);
  assert.equal(Number(await volume.inputValue()),savedVolume);assert.equal((await calls(page)).find(c=>c.action==='play').volume,savedVolume/100);
  const viewer=await context.newPage();monitor(viewer);await viewer.addInitScript(()=>{window.__rejectTrack=true;});await open(viewer);await viewer.locator('[data-bgm-play]:not([hidden])').waitFor();
  const blocked=await rect(viewer);visible(blocked);assert.equal(blocked.position,saved);assert(await viewer.locator('[data-bgm-play]').evaluate(el=>el.getBoundingClientRect().height>=44));
  await viewer.evaluate(()=>window.__rejectTrack=false);await viewer.locator('[data-bgm-play]').click();await viewer.locator('[data-bgm-play]').waitFor({state:'hidden'});assert.equal(await viewer.evaluate(()=>window.__audioInstances.some(a=>a.src.includes('qa-auction-song')&&!a.paused)),true);
  await viewer.locator('.auc-bgm-event').focus();await viewer.keyboard.press('Home');assert.equal(Math.round((await rect(viewer)).y),12);await viewer.keyboard.press('End');visible(await rect(viewer));
  await viewer.screenshot({path:path.join(out,profile.name+'-long-message.png')});
  await page.evaluate(()=>{window.__auctionMedia=window.__audioInstances.find(a=>a.src.includes('qa-auction-song'));window.renderShell('home');});await page.locator('.auc-bgm-event').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__auctionMedia.paused),true);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({profile:profile.name,initial,up,down,top,bottom,moved,next,landscape,keyboardViewport,reload,blocked,volume:{savedVolume,mute:true,restore:true,liveSync:true,queue:true,reload:true,catalogDefault:true},realTouch:profile.engine===chromium&&profile.width<560,webkitTouch:'synthetic touch pointer plus real mouse pointer capture',audioUninterrupted:true,positionRemembered:true,playButtonWorks:true,keyboardMovement:true,destroyedOnExit:true,errors,failed,externalOrigins:[...new Set(external)],apiRequestsIntercepted:true,liveAccountWrites:0,physicalIphone:false});
 }catch(e){if(page)await page.screenshot({path:path.join(out,profile.name+'-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,profile.name+'-failure.json'),JSON.stringify({error:e.stack,errors,failed,external,missing},null,2));throw e;}finally{await browser.close();f.close();}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({profile:profile.name,status:'passed',initial:reports.at(-1).initial}));
}}finally{server.closeAllConnections();if(!publicRun)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,missing},null,2));}
