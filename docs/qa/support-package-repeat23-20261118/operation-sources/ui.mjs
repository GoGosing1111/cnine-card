import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {packageFixture} from '../coop-pc-performance-20261108/source/tests/helpers/support-package-fixture.mjs';
import {handleSupportPackage as baselinePackage} from './runtime-before.mjs';
import {out,source,git,read,save} from './common.mjs';
const [phase='candidate',platform='desktop']=process.argv.slice(2),before=phase==='before',h5=platform==='h5',mobile=['android','ios','h5'].includes(platform),base='https://cnine-card.pages.dev';
const f=await packageFixture({postgres:true});f.clock.now=Date.parse('2026-11-18T12:00:00+09:00');await f.activate();
await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','support_package_bonus_20261115_v1:2',JSON.stringify({version:1,policyCode:'SUPPORT_PACKAGE_PURCHASE_BONUS_20261115_V1',paidPurchases:10,totalBonusCoins:'28000000000000000',totalBonusCubes:190}));
const {cards}=read('../all-platform-runtime-performance-20261108/public-cards');
const user={id:2,serverUserId:2,nickname:'패키지 검수',role:'USER',coin:1234,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const files=read('ui-files').files.filter(p=>!p.startsWith('scripts/')).concat(['shared/support-package-v1.mjs']);
const browser=await(platform==='ios'?webkit:chromium).launch({headless:true,...(platform==='ios'?{}:{channel:'chrome',args:['--mute-audio']})}),ctx=await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:1000},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR',serviceWorkers:'block'}),host=await ctx.newPage(),errors=[],requests=[];
let page=host;const blockedPosts=[];const report={phase,platform,emulated:true,conditions:'Windows headless browser, actual lobby → all menu → server information → package; CDN assets with current/baseline source overrides; isolated PostgreSQL APIs. Windows URL and H5 iframe are emulated, not physical devices or an installed app.',entries:[],errors,knownWarnings:[],productionWrites:0};
try{
 await ctx.routeWebSocket('**/*',ws=>ws.close());
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),endpoint=u.pathname.slice(5);
  if(u.pathname.startsWith('/api/')){
   if(req.method()!=='GET'){blockedPosts.push({endpoint,method:req.method()});return route.fulfill({status:403,json:{error:'Isolated read-only UI test'}});}
   if(endpoint.startsWith('server-support/')){requests.push(endpoint);if(before&&endpoint==='server-support/package'){const body=await baselinePackage({path:endpoint,request:new Request(req.url()),env:f.env,user:{id:2},deps:f.deps,now:f.clock.now});return route.fulfill({json:body});}const r=await f.call(endpoint,{user:2});return route.fulfill({status:r.status,json:r.body});}
   const mocks={cards:{cards},me:{user},'me/summary':{user,prison:{incarcerated:false}},'me/menu-favorites':{userId:2,routes:[],revision:1},'service/status':{maintenance:{active:false}},'live-operations':{items:[],pollSeconds:60},'messages':{messages:[],unread:0}};
   return route.fulfill({json:mocks[endpoint]||{ok:true,enabled:false,visible:false,items:[],rows:[],events:[],messages:[],unread:0,settings:{},routes:[],list:[]}});
  }
  if(h5)return route.continue(); // This package remains absent from the unchanged deployed store variant.
  const file=u.pathname==='/'?'index.html':u.pathname.slice(1);
  if(phase!=='public'&&files.includes(file)){const body=before?git('show',read('baseline').head+':'+file):fs.readFileSync(path.join(source,file));return route.fulfill({body,contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript; charset=utf-8'});}
  return route.continue();
 });
 await ctx.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','isolated-package-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_sfx_volume','0');localStorage.setItem('soop-lobby-bgm-muted-v1','1');localStorage.setItem('cnine_soop_watch_notice:20261026-v1:2','shown');},user);
 host.on('pageerror',e=>{if(e.message==='ResizeObserver loop completed with undelivered notifications.')report.knownWarnings.push(e.message);else errors.push(e.message);});
 if(h5){const html=git('show','HEAD:tests/onestore-web-20261026.browser.mjs').split('const hostHtml=`')[1].split('</iframe>`;')[0].replaceAll('${gameOrigin}',base)+'</iframe>';
  await ctx.route('https://h5sdk.onestore.net/**',r=>r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(out,'../all-platform-runtime-performance-20261108/onestore-h5-sdk.min.js'))}));await ctx.route('https://qa.onestore.net/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await host.goto('https://qa.onestore.net/',{waitUntil:'domcontentloaded'});await host.frameLocator('iframe').locator('soop-adventure-lobby').waitFor({timeout:60000});page=host.frames().find(f=>f.url().startsWith(base));assert(page);
 }else await page.goto(base+'/?screen=home'+(platform==='windows'?'&source=windows-client':''),{waitUntil:'domcontentloaded',timeout:65000});
 await host.addLocatorHandler(h5?host.frameLocator('iframe').locator('.soop-consent-dialog[open]'):page.locator('.soop-consent-dialog[open]'),d=>d.evaluate(el=>el.querySelector('[data-soop-close]')?.click()));
 if(!h5)await host.addLocatorHandler(page.locator('[data-ss-resume]:visible'),b=>b.click());
 const lobby=page.locator('soop-adventure-lobby');await lobby.locator('[data-category=all]:visible').first().waitFor({timeout:60000});report.coldLobbyMs=await page.evaluate(()=>Math.round(performance.now()));
 for(let i=0;i<2;i++){
  const started=performance.now();await lobby.locator('[data-category=all]:visible').first().click();
  if(h5){await lobby.locator('#menu-dialog[open]').waitFor();assert.equal(await lobby.getByRole('button',{name:'서버 안내',exact:true}).count(),0);assert.equal(await lobby.locator('[data-ss-package]').count(),0);report.entries.push({interactiveMs:Math.round(performance.now()-started),packageHidden:true});await lobby.locator('#menu-dialog').evaluate(el=>el.close());continue;}
  await lobby.getByRole('button',{name:'서버 안내',exact:true}).click();await lobby.locator('[data-ss-package]').click();await lobby.locator('[data-package-apply]').waitFor();
  const interactiveMs=Math.round(performance.now()-started),root=lobby.locator('.spkg');
  assert.equal(await root.locator('.spkg-rewards article').count(),8);assert.equal(await root.locator('[data-package-paid-count]').innerText(),before?'10회':'0회');
  assert.equal(await root.locator('[data-package-bonus-coins]').innerText(),before?'0조':'1,000조');assert.equal(await root.locator('[data-package-bonus-cubes]').innerText(),before?'0개':'5개');
  assert.match(await root.innerText(),before?/11월 18일 23:59/:/11월 23일 23:59/);if(!before){assert.match(await root.innerText(),/10회 달성 후 자동/);assert.doesNotMatch(await root.innerText(),/운영팀에 별도로 문의/);}
  await root.locator('.spkg-rewards img').evaluateAll(imgs=>Promise.all(imgs.map(x=>x.decode())));const imagesMs=Math.round(performance.now()-started);
  if(!i){await root.locator('.spkg-bonus').screenshot({path:path.join(out,phase+'-'+platform+'-one.png')});if(phase==='public')await root.locator('.spkg-hero').screenshot({path:path.join(out,phase+'-'+platform+'-deadline.png')});}
  await page.evaluate(()=>{window.qaFrames=[];let previous;const tick=t=>{if(previous)qaFrames.push(t-previous);previous=t;window.qaFrame=requestAnimationFrame(tick);};window.qaFrame=requestAnimationFrame(tick);});
  for(const [quantity,coins,cubes,total] of [[5,'20,000조','90개','22,500조 코인'],[10,'28,000조','190개','33,000조 코인'],[100,'280,000조','1900개','330,000조 코인']]){await root.locator('[data-package-quantity="'+quantity+'"]').click();assert.equal(await root.locator('[data-package-bonus-coins]').innerText(),before?'0조':coins);assert.equal(await root.locator('[data-package-bonus-cubes]').innerText(),before?'0개':cubes);if(!before)assert.equal(await root.locator('[data-package-total-coins]').innerText(),total);}
  await host.waitForTimeout(600);const frames=await page.evaluate(()=>{cancelAnimationFrame(qaFrame);const s=qaFrames.sort((a,b)=>a-b);return {samples:s.length,p95Ms:s[Math.floor(s.length*.95)],maxMs:s.at(-1),over50:s.filter(x=>x>50).length};});
  assert.equal(await root.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);if(!i)await root.locator('.spkg-bonus').screenshot({path:path.join(out,phase+'-'+platform+'-bulk100.png')});
  await root.evaluate(el=>{window.qaDetachedRoot=el;window.qaDetachedChanges=0;window.qaObserver=new MutationObserver(()=>window.qaDetachedChanges++);window.qaObserver.observe(el,{subtree:true,childList:true,attributes:true,characterData:true});});
  await lobby.locator('.ss-dialog [data-ss-close]').first().click();await root.waitFor({state:'detached'});const reqs=requests.length;await host.waitForTimeout(1100);
  const afterExit=await page.evaluate(()=>{qaObserver.disconnect();return {connected:qaDetachedRoot.isConnected,mutations:qaDetachedChanges};});afterExit.packageRequests=requests.slice(reqs).filter(p=>p==='server-support/package').length;assert.deepEqual(afterExit,{connected:false,mutations:0,packageRequests:0});
  report.entries.push({interactiveMs,imagesMs,frames,afterExit,backgroundStatusRequests:requests.slice(reqs).filter(p=>p==='server-support/status').length});await lobby.locator('#menu-dialog').evaluate(el=>el.close());
 }
 if(h5){await host.waitForTimeout(1100);assert.equal(requests.length,0);assert.equal(git('diff','--name-only',read('baseline').head,'--','onestore','shared/onestore-web-assets-v1.mjs'),'');report.packageHidden=true;report.packageApiCalls=0;report.storeVariant='Existing production H5 variant is unchanged; package remains excluded.';}
 assert(!blockedPosts.some(p=>p.endpoint.startsWith('server-support/')));assert.deepEqual(errors,[]);report.blockedPosts=blockedPosts;save('ui-'+phase+'-'+platform,report);console.log(JSON.stringify(report));
}catch(e){await host.screenshot({path:path.join(out,'failure-'+phase+'-'+platform+'.png')});console.error(e.message);save('failure-'+phase+'-'+platform,{error:e.message,errors,requests,body:(await page.locator('body').innerText()).slice(-1600)});throw e;}finally{await browser.close();await f.close();}
