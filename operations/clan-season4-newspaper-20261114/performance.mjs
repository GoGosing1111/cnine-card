import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.resolve('output/newspapers/clan-season-4-20261114'),dir=import.meta.dirname,qa=path.join(dir,'qa');
const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
const originalCss=fs.readFileSync(path.join(out,'news.css'),'utf8').replace('ReverseCallNewsDisplay.woff2','BlackHanSans-Regular.ttf').replace('ReverseCallNewsMono.woff2','IBMPlexMono-Medium.ttf').replaceAll("format('woff2')","format('truetype')").replaceAll("url('assets/",`url('${pathToFileURL(path.join(out,'assets')).href}/`);
fs.writeFileSync(path.join(qa,'baseline.css'),originalCss);
const baseline=html.replace(/(src|href)="((?:assets\/|news\.)[^\"]+)"/g,(_,a,url)=>`${a}="${pathToFileURL(path.join(out,url)).href}"`).replace(/loading="lazy"/g,'loading="eager"').replace(pathToFileURL(path.join(out,'assets/fm-double-crown.webp')).href,pathToFileURL(path.join(dir,'fm-double-crown-source.png')).href).replace(pathToFileURL(path.join(out,'news.css')).href,pathToFileURL(path.join(qa,'baseline.css')).href);
fs.writeFileSync(path.join(qa,'baseline.html'),baseline);
const paths={baseline:path.join(qa,'baseline.html'),optimized:path.join(out,'index.html')};
const med=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const round=n=>Math.round(n*10)/10;
const runs=[];
async function ready(p){await p.evaluate(async()=>{let timeout;const work=(async()=>{await document.fonts.ready;const visible=[...document.querySelectorAll('.paper:not([hidden]) img')].filter(im=>{const r=im.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0});await Promise.all(visible.map(im=>im.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return Boolean(document.querySelector('#next').onclick)})();try{return await Promise.race([work,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('reader-ready timeout: '+location.href)),5000))])}finally{clearTimeout(timeout)}})}
for(const [device,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  for(let i=0;i<3;i++)for(const variant of (i%2?['optimized','baseline']:['baseline','optimized'])){
    console.log('measuring',device,variant,i+1);
    const begin=performance.now();const browser=await chromium.launch({headless:true,channel:'chrome'}),launchMs=performance.now()-begin;
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'});
    const p=await context.newPage(),urls=new Set();p.on('request',r=>urls.add(r.url().split('#')[0].split('?')[0]));
    const start=performance.now();await p.goto(pathToFileURL(paths[variant]).href,{waitUntil:'load'});await ready(p);const coldMs=performance.now()-start;
    const assets=[...urls].filter(u=>u.startsWith('file:')).map(u=>{const file=fileURLToPath(u);return {file:path.basename(file),bytes:fs.statSync(file).size}});
    await p.goto('about:blank');const warmStart=performance.now();await p.goto(pathToFileURL(paths[variant]).href,{waitUntil:'load'});await ready(p);
    runs.push({device,variant,sample:i+1,browserLaunchMs:round(launchMs),firstNavigationReadyMs:round(coldMs),firstLaunchPlusNavigationMs:round(launchMs+coldMs),reentryReadyMs:round(performance.now()-warmStart),initialAssetCount:assets.length,initialFileBytes:assets.reduce((n,a)=>n+a.bytes,0),assets});
    console.log('ready',runs.at(-1).firstNavigationReadyMs,runs.at(-1).reentryReadyMs);
    await browser.close();
  }
}
const interactions=[];
for(const [device,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  console.log('interaction',device);
  const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'}),p=await context.newPage();
  await p.addInitScript(()=>{window.__activity={raf:0,interval:0,timeout:0};for(const [key,name]of [['raf','requestAnimationFrame'],['interval','setInterval'],['timeout','setTimeout']]){const original=window[name].bind(window);window[name]=(...args)=>{window.__activity[key]++;return original(...args)}}});
  await p.goto(pathToFileURL(paths.optimized).href,{waitUntil:'load'});
  const activityBefore=await p.evaluate(()=>({...window.__activity}));await ready(p);
  await p.evaluate(()=>{window.__frames=[];window.__long=[];window.__observer=new PerformanceObserver(list=>window.__long.push(...list.getEntries().map(e=>e.duration)));window.__observer.observe({type:'longtask',buffered:false});let last=0;window.__stopFrameMonitor=false;const tick=t=>{if(last)__frames.push(t-last);last=t;if(!window.__stopFrameMonitor)requestAnimationFrame(tick)};requestAnimationFrame(tick)});
  const changes=[];
  for(let i=2;i<=6;i++){
    console.log('page',i);
    await p.evaluate(()=>window.__clickStart=performance.now());
    await p.selectOption('#page-select',String(i));await ready(p);
    changes.push(round(await p.evaluate(()=>performance.now()-window.__clickStart)));
    await p.evaluate(async()=>{for(let y=0;y<1500;y+=150){scrollTo(0,y);await new Promise(r=>requestAnimationFrame(r))}});
  }
  const metrics=await p.evaluate(()=>{window.__stopFrameMonitor=true;window.__observer.disconnect();const a=__frames.sort((a,b)=>a-b);return {frames:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:Math.max(...a),over33:a.filter(x=>x>33.4).length,over50:a.filter(x=>x>50).length,longTasks:__long}});
  await p.goto('about:blank');const cdp=await context.newCDPSession(p);await cdp.send('Performance.enable');const before=(await cdp.send('Performance.getMetrics')).metrics;await new Promise(r=>setTimeout(r,500));const after=(await cdp.send('Performance.getMetrics')).metrics;const metric=(a,n)=>a.find(x=>x.name===n)?.value||0;
  interactions.push({device,pageChangesMs:changes,frames:metrics,applicationScheduledCallbacksOnEntry:activityBefore,afterExit500ms:{scriptDurationMs:round((metric(after,'ScriptDuration')-metric(before,'ScriptDuration'))*1000),taskDurationMs:round((metric(after,'TaskDuration')-metric(before,'TaskDuration'))*1000)}});
  await browser.close();
}
const summary=[];for(const device of ['desktop','mobile'])for(const variant of ['baseline','optimized']){const a=runs.filter(r=>r.device===device&&r.variant===variant);summary.push({device,variant,firstNavigationMedianMs:round(med(a.map(x=>x.firstNavigationReadyMs))),reentryMedianMs:round(med(a.map(x=>x.reentryReadyMs))),firstLaunchPlusNavigationMedianMs:round(med(a.map(x=>x.firstLaunchPlusNavigationMs))),initialFileBytes:a[0].initialFileBytes,initialAssetCount:a[0].initialAssetCount})}
const report={at:new Date().toISOString(),conditions:{os:process.platform,browser:'Installed Chrome headless',entry:'Local index.html opened through file://, the delivered offline entry point',desktop:'1440×900 physical Windows host / headless browser',mobile:'390×844 touch viewport emulation; no physical phone measurement',network:'No server or network dependency; local files',cpu:'No throttling',samples:3,readyDefinition:'Navigation invocation through document load, local fonts, visible image decode and two paint frames; controls installed',firstLaunchDefinition:'Fresh Chrome launch plus first navigation; OS file cache not forcibly cleared',baseline:'Same article/layout, source PNG, all illustrations eagerly loaded',optimized:'WebP cover, hidden-page illustrations loaded on demand',frameScenario:'Five user select changes and stepped scrolling; validation probes included',interpretation:'Timing samples are local emulation results, not production network or phone measurements.'},summary,interactions,runs};
fs.writeFileSync(path.join(qa,'performance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary,interactions},null,2));
