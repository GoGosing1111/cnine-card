import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const errors=[],checks=[],samples=[];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://local').pathname).slice(1);
  try{
    let body,type=mime[path.extname(file)]||'application/octet-stream';
    if(file==='preview/jokgak-city-v1/'){
      type='text/html';body=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080c17;color:white;font-family:Arial}#controls{display:none}</style><body><div id="controls"><select id="previewRole"></select><button id="previewNotice"></button><button id="previewAlms"></button><button id="previewDeath"></button></div><main id="previewCity"></main><script src="/js/runtime-performance-v1727.js"></script><script src="/js/jokgak-city-v1.js"></script><script type="module" src="./preview.mjs"></script></body></html>`;
    }else{
      const full=path.resolve(root,file);assert.ok(full.startsWith(root)&&!file.includes('..'));body=fs.readFileSync(full);
      if(file==='preview/jokgak-city-v1/preview.mjs')body=body.toString().replace("await import('./battle-loader.js');",'').replace("document.getElementById('previewCity').innerHTML=",`
        const request=window.CityPreview.request,stable=new Map(),riotUntil=Date.now()+300000;
        window.__statusCalls=0;window.__cityPatch={};window.__statusDelay=0;
        window.CityPreview.request=async function(p,b){
          const result=await request.call(this,p,b);if(!p.startsWith('status'))return result;
          window.__statusCalls++;if(window.__statusDelay)await new Promise(r=>setTimeout(r,window.__statusDelay));
          if(!stable.has(p))stable.set(p,structuredClone(result));
          const value=structuredClone(stable.get(p));value.serverNow=Date.now();
          value.conflicts={epoch:value.shift.id,mode:value.mode,riots:CITY_PLACES.filter(p=>['MARKET','DOCK'].includes(p.id)).map(p=>({location:p.id,intensity:2,battles:8,windowMs:300000,expiresAt:riotUntil})),bounties:[],notices:[]};
          Object.assign(value,window.__cityPatch);return value;
        };
        document.getElementById('previewCity').innerHTML=`);
    }
    res.writeHead(200,{'content-type':type});res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'no-preference'});
    page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.goto('http://127.0.0.1:'+server.address().port+'/preview/jokgak-city-v1/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelectorAll('.jc-person').length===10&&document.querySelectorAll('.jc-riot-zones polygon').length===2);
    await page.locator('.jc-map').scrollIntoViewIfNeeded();
    const refresh=async()=>{const old=await page.evaluate(()=>window.__statusCalls);await page.locator('[data-city-refresh]').click();await page.waitForFunction(n=>window.__statusCalls>n,old);await page.waitForTimeout(200);};
    await page.evaluate(()=>{window.__map=document.querySelector('.jc-map');window.__person=document.querySelector('.jc-person');window.__person.focus();window.__rootRemovals=0;new MutationObserver(rows=>{for(const r of rows)if(r.target.id==='jokgakCity')window.__rootRemovals+=r.removedNodes.length;}).observe(document.querySelector('#jokgakCity'),{childList:true});});
    await refresh();
    assert.ok(await page.evaluate(()=>window.__map===document.querySelector('.jc-map')&&window.__person===document.querySelector('.jc-person')&&window.__rootRemovals===0));
    await page.evaluate(()=>{window.__person.focus();document.querySelector('[data-city-refresh]').dispatchEvent(new MouseEvent('click',{bubbles:true}));});await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>document.activeElement===window.__person));
    await page.locator('.jc-person').first().click();assert.match(await page.locator('.jc-target').textContent(),/밤의산책자/);
    await page.locator('.jc-pin[data-city-place="DOCK"]').click();await page.locator('.jc-pin.selected[data-city-place="DOCK"]').waitFor();
    await page.locator('.jc-pin[data-city-place="MARKET"]').click();await page.locator('.jc-pin.selected[data-city-place="MARKET"]').waitFor();
    await page.locator('[data-city-hide-popups]').check();await page.waitForFunction(()=>!document.querySelector('[data-city-hide-popups]').disabled);
    assert.ok(await page.locator('[data-city-hide-popups]').isChecked());
    await page.evaluate(async()=>{
      const {patchCityView}=await import('/js/jokgak-city-render-v1.mjs');const host=document.createElement('div');document.body.append(host);
      patchCityView(host,'<button data-city-person="1">A</button><button data-city-person="2">B</button><input type="checkbox" checked>');
      const first=host.firstChild,second=first.nextSibling;host.querySelector('input').checked=false;
      patchCityView(host,'<button data-city-person="2" disabled>B updated</button><button data-city-person="1">A</button><input type="checkbox" checked>');
      if(host.firstChild!==second||host.children[1]!==first||!second.disabled||second.textContent!=='B updated'||!host.querySelector('input').checked)throw Error('city reconciliation lost identity or controlled values');
      patchCityView(host,'<button data-city-person="1">A</button>');if(host.children.length!==1||host.firstChild!==first)throw Error('city removal retained stale residents');host.remove();
    });
    checks.push(width+': stable map/resident DOM, focus, place and target selection, checked preferences, keyed row update/removal');
    if(width===1440){
      const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
      const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
      const sample=async name=>{
        const events=[],receive=data=>events.push(...data.value);cdp.on('Tracing.dataCollected',receive);await cdp.send('Tracing.start',{categories:'devtools.timeline',transferMode:'ReportEvents'});
        const a=await metrics();await page.waitForTimeout(5000);const b=await metrics();const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await done;cdp.off('Tracing.dataCollected',receive);
        const paints=events.filter(e=>e.name==='Paint'&&e.ph==='X');samples.push({name,durationMs:5000,taskMs:(b.TaskDuration-a.TaskDuration)*1000,paints:paints.length,paintMs:paints.reduce((n,e)=>n+(e.dur||0),0)/1000});
      };
      await page.locator('.jc-map').scrollIntoViewIfNeeded();
      const oldEffect=await page.addStyleTag({content:'.jc-riot-zones polygon{animation:old-riot-border 3.8s ease-in-out infinite!important}@keyframes old-riot-border{0%,100%{stroke-opacity:.5;fill-opacity:.7}50%{stroke-opacity:1;fill-opacity:1}}'});
      await sample('previous_border_effect');await oldEffect.evaluate(n=>n.remove());await sample('optimized_city');
      assert.ok(samples[1].taskMs<samples[0].taskMs*.3,'the static boundary must remove the measured paint bottleneck');
    }
    await page.evaluate(()=>{window.__hiddenWrites=0;window.__hiddenCalls=window.__statusCalls;Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.__hiddenObserver=new MutationObserver(r=>window.__hiddenWrites+=r.length);window.__hiddenObserver.observe(document.querySelector('#jokgakCity'),{subtree:true,childList:true,attributes:true,characterData:true});});
    await page.waitForTimeout(width===1440?11000:1200);
    assert.deepEqual(await page.evaluate(()=>({calls:window.__statusCalls-window.__hiddenCalls,writes:window.__hiddenWrites})),{calls:0,writes:0});
    await page.evaluate(()=>{window.__hiddenObserver.disconnect();delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.__statusCalls>window.__hiddenCalls);
    await page.evaluate(()=>{window.__statusDelay=700;document.querySelector('[data-city-refresh]').click();});await page.waitForTimeout(150);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.__hiddenWrites=0;window.__hiddenObserver.observe(document.querySelector('#jokgakCity'),{subtree:true,childList:true,attributes:true,characterData:true});});
    await page.waitForTimeout(950);assert.equal(await page.evaluate(()=>window.__hiddenWrites),0,'a late response must not render a hidden tab');
    await page.evaluate(()=>{window.__hiddenObserver.disconnect();window.__statusDelay=0;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(250);
    checks.push(width+': hidden status polls and DOM writes stop; return refreshes; late hidden response is deferred');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await page.locator('.jc-riot-zones polygon').first().evaluate(n=>getComputedStyle(n).animationName),'none');
    assert.ok(await page.locator('.jc-riot-flare i').first().evaluate(n=>getComputedStyle(n).animationName==='jc-riot-wave'));
    await page.locator('.jc-map-panel').screenshot({path:path.join(out,width+'-city.png')});
    await page.evaluate(()=>{window.__beforeStop=window.__statusCalls;window.JokgakCity.stop();document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>window.__beforeStop===window.__statusCalls));
    await page.close();
  }
  assert.deepEqual(errors,[]);const report={checks,samples,errors,scope:'isolated city preview, injected page visibility; no production accounts or API writes'};fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));}
