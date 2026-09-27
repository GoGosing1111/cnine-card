import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');

const root=new URL('../',import.meta.url);
const read=file=>process.env.PWA_BASELINE_REV
  ?execFileSync('git',['show',process.env.PWA_BASELINE_REV+':'+file],{cwd:root,encoding:'utf8',maxBuffer:5e6})
  :fs.readFileSync(new URL(file,root),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
after(()=>browser.close());
async function pageFor(t,html='<main id="app"></main>'){
  const page=await browser.newPage({viewport:{width:1200,height:800},serviceWorkers:'block'});
  t.after(()=>page.close());
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://runtime.test')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
    if(!url.pathname.startsWith('/assets/'))return route.abort();
    const file=new URL('.'+url.pathname,root);
    return fs.existsSync(file)?route.fulfill({path:file.pathname.replace(/^\/(\w:)/,'$1')}):route.abort();
  });
  await page.goto('http://runtime.test/');
  await page.evaluate(()=>{
    window.qaFocused=true;window.qaHidden=false;
    Object.defineProperty(document,'hasFocus',{value:()=>window.qaFocused});
    Object.defineProperty(document,'hidden',{get:()=>window.qaHidden});
  });
  return page;
}
const flush=page=>page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
async function runtimeFor(t){
  const page=await pageFor(t);
  await page.evaluate(()=>{
    window.qaTargets=new Set();window.qaObserveCalls=0;window.qaScans=0;
    const Native=IntersectionObserver,query=Element.prototype.querySelectorAll;
    window.IntersectionObserver=class extends Native{
      observe(node){qaTargets.add(node);qaObserveCalls++;super.observe(node);}
      unobserve(node){qaTargets.delete(node);super.unobserve(node);}
    };
    Element.prototype.querySelectorAll=function(selector){if(selector.includes('.dex-section'))qaScans++;return query.call(this,selector);};
  });
  await page.addScriptTag({content:read('js/runtime-performance-v1727.js')});
  return page;
}

test('route churn releases removed observations and reinserted cards are observed again',async t=>{
  const page=await runtimeFor(t);
  const result=await page.evaluate(async()=>{
    const root=document.getElementById('app'),flush=()=>new Promise(r=>setTimeout(r,0));
    for(let route=0;route<20;route++){
      root.innerHTML='<div class="dex-section">'+Array.from({length:200},()=>'<div class="card-frame"><span>카드</span></div>').join('')+'</div>';
      await flush();root.replaceChildren();await flush();
    }
    const retained=qaTargets.size,card=document.createElement('div');card.className='card-frame';root.append(card);await flush();
    const first=qaTargets.has(card);card.className='changed';card.remove();await flush();const removed=!qaTargets.has(card);
    card.className='card-frame';root.append(card);await flush();
    return {removedRouteTargets:20*201,retained,first,removed,reinserted:qaTargets.has(card)};
  });
  t.diagnostic(JSON.stringify(result));assert.equal(result.retained,0);assert.ok(result.first&&result.removed&&result.reinserted);
});

test('nested additions are scanned once and connected moves keep their observation',async t=>{
  const page=await runtimeFor(t);
  const result=await page.evaluate(async()=>{
    const root=document.getElementById('app');qaScans=0;
    const outer=document.createElement('section');root.append(outer);
    for(let i=0;i<50;i++){const card=document.createElement('div');card.className='card-frame';outer.append(card);card.append(document.createElement('span'));}
    await new Promise(r=>setTimeout(r,0));const scans=qaScans,registered=qaObserveCalls;
    const moved=outer.firstElementChild;root.append(moved);await new Promise(r=>setTimeout(r,0));
    return {scans,registered,afterMove:qaObserveCalls,movedStillObserved:qaTargets.has(moved)};
  });
  t.diagnostic(JSON.stringify(result));assert.equal(result.scans,1);assert.equal(result.registered,50);assert.equal(result.afterMove,50);assert.ok(result.movedStillObserved);
});

test('idle BGM UI is stable and its single repair timer stops and resumes with focus',async t=>{
  const page=await pageFor(t,'<main id="app"><div class="pc-lobby-scene"><div data-lobby-bgm-host style="width:200px;height:40px"></div></div></main>');
  await page.evaluate(()=>{
    localStorage.setItem('soop-lobby-bgm-muted-v1','1');window.qaIntervals=new Map();let id=0;
    window.setInterval=(fn,ms)=>{qaIntervals.set(++id,{fn,ms});return id;};window.clearInterval=id=>qaIntervals.delete(id);
  });
  await page.addScriptTag({content:read('js/lobby-bgm-v1803.js')});
  const result=await page.evaluate(async()=>{
    lobbyBgm.applySettings({enabled:true,tracks:[{title:'검수',url:'/silent.wav'}]});lobbyBgm.syncRoute();
    const button=document.getElementById('lobbyBgmToggleV1803'),icon=button.firstChild;let mutations=0;
    const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(button,{childList:true,subtree:true});
    for(let tick=0;tick<30;tick++)lobbyBgm.syncRoute();await new Promise(r=>setTimeout(r,0));observer.disconnect();
    const visibleTimers=qaIntervals.size,sameIcon=icon===button.firstChild;
    qaFocused=false;dispatchEvent(new Event('blur'));const inactiveTimers=qaIntervals.size;
    qaFocused=true;dispatchEvent(new Event('focus'));const resumedTimers=qaIntervals.size;
    qaHidden=true;document.dispatchEvent(new Event('visibilitychange'));const hiddenTimers=qaIntervals.size;
    qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('focus'));const finalTimers=qaIntervals.size;
    button.remove();for(const {fn} of [...qaIntervals.values()])fn();
    return {mutations,sameIcon,visibleTimers,inactiveTimers,resumedTimers,hiddenTimers,finalTimers,repaired:Boolean(document.getElementById('lobbyBgmToggleV1803'))};
  });
  t.diagnostic(JSON.stringify(result));assert.equal(result.mutations,0);assert.ok(result.sameIcon&&result.repaired);
  assert.deepEqual([result.visibleTimers,result.inactiveTimers,result.resumedTimers,result.hiddenTimers,result.finalTimers],[1,0,1,0,1]);
});

test('combat particle class changes do not rescan the page; modal scroll locks still follow open, auto, captain and close',async t=>{
  const page=await pageFor(t,'<main id="app"><div id="modal" class="modal"><span id="particle"></span></div></main>');
  await page.evaluate(()=>{
    window.app=document.getElementById('app');window.qaModalScans=0;const query=app.querySelector.bind(app);
    app.querySelector=selector=>{if(selector==='#modal.show')qaModalScans++;return query(selector);};
  });
  const app=read('js/app.js');await page.addScriptTag({content:app.slice(app.indexOf('function syncBattleScreenLock(){'),app.indexOf('const legacyBrandObserver='))});
  const scans=await page.evaluate(async()=>{
    qaModalScans=0;for(let frame=0;frame<60;frame++){document.getElementById('particle').className='frame-'+frame;await new Promise(r=>setTimeout(r,0));}return qaModalScans;
  });
  t.diagnostic(JSON.stringify({particleFrames:60,modalScans:scans}));assert.equal(scans,0);
  for(const [classes,hard,auto,captain] of [['modal show battle-modal',true,false,false],['modal show battle-modal auto-battle-modal',false,true,false],['modal show captain-v3-battle-modal',false,false,true],['modal',false,false,false]]){
    await page.evaluate(classes=>document.getElementById('modal').className=classes,classes);await flush(page);
    assert.deepEqual(await page.evaluate(()=>['battle-screen-open','auto-battle-screen-open','captain-battle-scroll-open'].map(c=>document.body.classList.contains(c))),[hard,auto,captain]);
  }
  await page.evaluate(()=>{document.getElementById('modal').className='modal show battle-modal';});await flush(page);
  await page.evaluate(()=>app.replaceChildren());await flush(page);assert.equal(await page.evaluate(()=>document.body.classList.contains('battle-screen-open')),false);
});

for(const effect of ['playerCard','challenger'])test(effect+' shipped WebGL decoration pauses on blur, resumes on focus and stops when closed',async t=>{
  const page=await pageFor(t,'<main id="app"><div id="card"><div id="fx" data-challenger-fx style="width:300px;height:260px"></div><p>기록과 조작 유지</p></div></main>');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addScriptTag({content:read('js/ui-fx-vendor-v2045.bundle.js')});
  await page.evaluate(()=>{
    window.qaApps=[];const App=CNineUiFxVendor.pixi.Application,init=App.prototype.init;
    App.prototype.init=async function(...args){await init.apply(this,args);qaApps.push(this);};
  });
  await page.addScriptTag({content:read(effect==='playerCard'?'js/player-card-fx-v2052.bundle.js':'js/ranked-challenger-fx-v2032.bundle.js')});
  if(effect==='playerCard')await page.evaluate(async()=>{window.qaController=await PlayerCardFX.mount(document.getElementById('fx'),document.getElementById('card'),new AbortController().signal);});
  await page.waitForFunction(()=>qaApps.length===1&&qaApps[0].ticker.started);
  const started=await page.evaluate(()=>qaApps[0].ticker.started);
  await page.evaluate(()=>{qaFocused=false;dispatchEvent(new Event('blur'));});await flush(page);
  const paused=await page.evaluate(()=>!qaApps[0].ticker.started);
  await page.evaluate(()=>{qaFocused=true;dispatchEvent(new Event('focus'));});await flush(page);
  const resumed=await page.evaluate(()=>qaApps[0].ticker.started);
  if(effect==='playerCard')await page.evaluate(()=>qaController.destroy());else await page.evaluate(()=>document.getElementById('fx').remove());
  await flush(page);const canvases=await page.locator('canvas').count();
  t.diagnostic(JSON.stringify({effect,started,paused,resumed,remainingCanvases:canvases,errors}));
  assert.ok(started&&paused&&resumed);assert.equal(canvases,0);assert.deepEqual(errors,[]);assert.equal(await page.locator('#card p').textContent(),'기록과 조작 유지');
});
