import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {startAuctionPreview} from './helpers/auction-user-preview-server-20261103.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const out=process.env.AUCTION_BGM_BROWSER_OUTPUT?path.resolve(process.env.AUCTION_BGM_BROWSER_OUTPUT):path.resolve(import.meta.dirname,'../../../../operations/auction-user-20261103/bgm/audio');fs.mkdirSync(out,{recursive:true});const report=[];
function instrumentAudio({blocked=false}={}){
 const realNow=Date.now;window.__clockShift=0;Date.now=()=>realNow()+window.__clockShift;
 window.__audioCalls=[];window.__audioInstances=[];window.__rejectTrack=blocked;
 window.Audio=class extends EventTarget{
  constructor(){super();this._src='';this.currentTime=0;this.duration=60;this.readyState=1;this.volume=1;this.paused=true;window.__audioInstances.push(this);}
  get src(){return this._src;}set src(value){this._src=String(value);this.currentTime=0;}
  setAttribute(){}removeAttribute(name){if(name==='src')this.src='';}load(){}
  play(){const track=!!this.src&&!this.src.startsWith('data:');window.__audioCalls.push({action:'play',track,src:this.src,volume:this.volume,currentTime:this.currentTime});if(track&&window.__rejectTrack)return Promise.reject(Error('Autoplay requires a gesture'));this.paused=false;return Promise.resolve();}
  pause(){window.__audioCalls.push({action:'pause',track:!!this.src&&!this.src.startsWith('data:'),src:this.src});this.paused=true;}
 };
}
const trackCalls=page=>page.evaluate(()=>window.__audioCalls.filter(x=>x.track));
async function bid(page,amount,message=''){
 await page.locator('#auc-amount').fill(String(amount));await page.locator('#auc-bid-message').fill(message);
 await page.locator('.auc-bid').click();await page.locator('.auc-dialog [data-submit]').click();await page.locator('.auc-dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('#auc-amount')?.value==='');
}
for(const profile of [{name:'desktop',width:1440,engine:chromium},{name:'small',width:320,engine:chromium},{name:'webkit',width:390,engine:webkit}]){
 const server=await startAuctionPreview(),browser=await profile.engine.launch({headless:true,...(profile.engine===chromium?{channel:'chrome'}:{})});
 try{
  const f=server.fixture;
  f.sql.prepare('INSERT INTO auction_bgm_rules_v1554 VALUES(?,?,?,?,?,?,?)').run(1,0,123,123,'/existing/first_song.mp3#av=65',60,0);
  f.sql.prepare('INSERT INTO auction_bgm_rules_v1554 VALUES(?,?,?,?,?,?,?)').run(2,0,456,456,'/existing/second_song.mp3#av=20',40,1);
  const context=await browser.newContext({viewport:{width:profile.width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  const monitor=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()});});};monitor(page);
  await page.addInitScript(instrumentAudio);await page.goto(server.origin+'/preview/auction-user-20261103/index.html');await page.locator('#auc-amount').waitFor();
  await page.getByRole('button',{name:'♪ BGM 발동표'}).click();assert.equal(await page.locator('.auc-bgm-guide-list article').count(),2);assert.match(await page.locator('.auc-bgm-guide-list').innerText(),/first song/);
  await page.locator('.auc-close').click();assert.deepEqual(await trackCalls(page),[]);
  await bid(page,123,'<b>음악 그대로</b>');await page.locator('.auc-bgm-event:not([hidden])').waitFor();await page.waitForFunction(()=>window.__audioCalls.some(x=>x.track&&x.action==='play'));
  const playing=await trackCalls(page);assert.equal(playing.length,1);assert.equal(playing[0].volume,.65);assert.match(playing[0].src,/\/existing\/first_song\.mp3\?auctionAudio=\d+$/);
  assert.equal(await page.locator('[data-bgm-message]').innerText(),'<b>음악 그대로</b>');assert.equal(await page.locator('[data-bgm-message] b').count(),0);
  const centered=await page.locator('.auc-bgm-event').evaluate(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,centerX:b.x+b.width/2,centerY:b.y+b.height/2,viewportWidth:innerWidth,viewportHeight:innerHeight};});
  assert.ok(Math.abs(centered.centerX-centered.viewportWidth/2)<1);assert.ok(Math.abs(centered.centerY-centered.viewportHeight/2)<1);assert.equal(centered.width,Math.min(560,profile.width-32));assert.ok(centered.height>=210);assert.ok(centered.x>=0&&centered.y>=0);
  await bid(page,1e7,'일반 입찰');await page.locator('[data-tab="QUEUE"]').click();await page.locator('[data-tab="LIVE"]').click();
  assert.deepEqual(await trackCalls(page),playing);assert.equal(await page.evaluate(()=>window.__audioInstances.length),1);
  assert.equal(await page.locator('[data-bgm-message]').innerText(),'<b>음악 그대로</b>');
  f.advance(5000);await page.evaluate(()=>window.__clockShift+=5000);
  const viewer=await context.newPage();monitor(viewer);await viewer.addInitScript(instrumentAudio,{blocked:true});await viewer.goto(server.origin+'/preview/auction-user-20261103/index.html');
  await viewer.locator('[data-bgm-play]:not([hidden])').waitFor();assert.match(await viewer.locator('[data-bgm-status]').innerText(),/버튼/);
  const late=(await trackCalls(viewer))[0];assert.ok(late.currentTime>=5&&late.currentTime<25);assert.equal(late.volume,.65);
  await viewer.evaluate(()=>window.__rejectTrack=false);await viewer.locator('[data-bgm-play]').click();await viewer.waitForFunction(()=>window.__audioCalls.filter(x=>x.track&&x.action==='play').length===2);
  assert.equal(await viewer.locator('[data-bgm-play]').isVisible(),false);assert.equal(await viewer.evaluate(()=>window.__audioInstances[0].paused),false);
  await bid(page,456,'입찰했습니다!');assert.deepEqual(await trackCalls(page),playing);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,profile.name+'-playing.png'),fullPage:false});
  f.advance(60000);await page.evaluate(()=>window.__clockShift+=60000);await viewer.evaluate(()=>window.__clockShift+=60000);
  for(const p of [page,viewer]){
   await p.waitForFunction(()=>window.__audioCalls.some(x=>x.action==='play'&&x.src.includes('second_song')));
   const calls=await trackCalls(p),next=calls.find(x=>x.action==='play'&&x.src.includes('second_song'));assert.equal(next.volume,.2);assert.ok(next.currentTime>=0&&next.currentTime<40);
   assert.ok(calls.some(x=>x.action==='pause'&&x.src.includes('first_song')));assert.equal(await p.locator('[data-bgm-message]').innerText(),'입찰했습니다!');
  }
  await page.screenshot({path:path.join(out,profile.name+'-centered-preview.png'),fullPage:false});
  await page.locator('[data-lobby]').click();assert.equal(await page.locator('.auc-bgm-event').count(),0);assert.equal(await page.evaluate(()=>window.__audioInstances[0].paused),true);
  await viewer.locator('[data-lobby]').click();assert.equal(await viewer.evaluate(()=>window.__audioInstances[0].paused),true);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  report.push({profile:profile.name,width:profile.width,centered,guide:true,volumePreserved:true,normalBidDoesNotInterrupt:true,singleAudioElement:true,messageEscaped:true,lateJoinSeeks:true,autoplayFallback:true,sharedQueueOrder:true,stopsOnExit:true,overflow:false,pageErrors:errors,failedResponses:failed,audio:'instrumented; no real audible track or physical device tested'});
 }finally{await browser.close();await server.close();}
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
