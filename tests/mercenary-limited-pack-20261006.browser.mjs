import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'preview/mercenary-limited-pack-20261006-v1/qa');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],failed=[];
const check=(v,s)=>{assert.ok(v,s);checks.push(s);};
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(name+': '+e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failed.push(r.status()+' '+r.url());});
  await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/');
  await page.waitForSelector('[data-lp-canvas][data-state=ready]',{timeout:30000});
  check(await page.locator('.lp-dialog canvas').count()===1,name+' uses one renderer');
  check(await page.locator('.lp-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),name+' dialog has no horizontal overflow');
  await page.screenshot({path:path.join(out,name+'-ready.png'),fullPage:true});
  await page.locator('[data-lp-buy="1"]').click();await page.locator('[data-lp-confirm-start]').click();
  await page.waitForSelector('[data-lp-canvas][data-state=revealed]');
  await page.screenshot({path:path.join(out,name+'-reveal.png'),fullPage:true});
  await page.waitForFunction(()=>document.querySelector('[data-lp-buy="1"]').disabled===false);
  const quota=await page.evaluate(()=>window.limitedPreview.stats.draws);check(quota===1,name+' manual draws once');
  await page.locator('[data-lp-total]').fill('3');await page.locator('[data-lp-batch]').selectOption('1');
  await page.locator('[data-lp-auto]').click();await page.locator('[data-lp-confirm-start]').click();
  await page.waitForFunction(()=>window.limitedPreview.stats.draws===4&&document.querySelector('[data-lp-auto]').disabled===false,{},{timeout:30000});
  const stats=await page.evaluate(()=>window.limitedPreview.stats);check(stats.maxActive===1,name+' automatic opens are serial');check(stats.draws===4,name+' automatic 3 graphical results complete');
  await page.locator('[data-lp-close]').click();check(await page.locator('.lp-dialog').count()===0,name+' destroys dialog');
  await page.locator('#open').click();await page.waitForSelector('[data-lp-canvas][data-state=ready]');check(await page.locator('.lp-dialog canvas').count()===1,name+' reopen has one canvas');
  await page.locator('[data-lp-recover]').click();await page.waitForSelector('[data-lp-canvas][data-state=revealed]');await page.locator('[data-lp-close]').click();
  check((await page.evaluate(()=>window.limitedPreview.stats.opens))===4,name+' receipt replay creates no new purchase');
  await page.close();
 }
 {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push('reduced: '+e.message));await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/');
  await page.waitForSelector('[data-lp-canvas][data-state=ready]');await page.locator('[data-lp-buy="1"]').click();await page.locator('[data-lp-confirm-start]').click();
  await page.waitForSelector('[data-lp-canvas][data-state=revealed]');await page.screenshot({path:path.join(out,'mobile-reduced-motion.png')});
  await page.waitForFunction(()=>document.querySelector('[data-lp-buy="1"]').disabled===false);
  check((await page.evaluate(()=>window.limitedPreview.stats.opens))===1,'reduced motion still displays the exact confirmed card');await page.close();
 }
 {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push('cms: '+e.message));await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/cms.html');
  await page.waitForSelector('[data-limited-price=single]');await page.locator('[data-limited-price=single]').fill('700000000');
  await page.locator('[data-limited-cap="V-996"]').fill('30');await page.locator('[data-limited-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-limited-root]').textContent.includes('저장 완료'));
  check(await page.locator('[data-limited-price=single]').inputValue()==='700000000','CMS separate price saves');check(await page.locator('[data-limited-cap="V-996"]').inputValue()==='30','CMS per-mercenary cap saves');
  await page.screenshot({path:path.join(out,'cms-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'CMS mobile has no overflow');await page.screenshot({path:path.join(out,'cms-mobile.png'),fullPage:true});await page.close();
 }
{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),one=await context.newPage(),two=await context.newPage();
  for(const page of [one,two]){page.on('pageerror',e=>errors.push('cross-tab: '+e.message));await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/');await page.waitForSelector('[data-lp-canvas][data-state=ready]');}
  await one.locator('[data-lp-total]').fill('10');await one.locator('[data-lp-batch]').selectOption('1');await one.locator('[data-lp-auto]').click();await one.locator('[data-lp-confirm-start]').click();await one.waitForSelector('[data-lp-canvas][data-state=revealed]');
  await two.locator('[data-lp-buy="1"]').click();await two.locator('[data-lp-confirm-start]').click();
  await two.waitForFunction(()=>document.querySelector('[data-lp-status]').textContent.includes('다른 창'));
  check(await two.evaluate(()=>window.limitedPreview.stats.opens===0),'second tab cannot start another purchase during automatic opening');
  await one.locator('[data-lp-stop-stage]').click();await one.waitForFunction(()=>document.querySelector('[data-lp-auto]').disabled===false);
  check(await one.evaluate(()=>window.limitedPreview.stats.opens===1),'stop button beside reveal stops the next request');
  await context.close();
 }
 {
  const page=await browser.newPage({viewport:{width:1000,height:800}});page.on('pageerror',e=>errors.push('stress: '+e.message));
  await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/');await page.waitForSelector('[data-lp-canvas][data-state=ready]');await page.locator('[data-lp-close]').click();
  const result=await page.evaluate(async()=>{
   const host=document.createElement('div');host.style.cssText='width:750px;height:650px';document.body.append(host);
   const fx=HyperPackFX.create(host,()=>{},{appearance:'limited'});await fx.init();fx.speed=120;
   const card=window.limitedPreview.state.cards[0],row={...card,kind:'MERCENARY',mercenaryCode:card.code,preview:true,granted:false};
   const peak={pendingDisposals:0,liveChildren:0},before=performance.now();
   for(let i=0;i<100;i++){await fx.play([row]);peak.pendingDisposals=Math.max(peak.pendingDisposals,fx.cleanupTimers.size);peak.liveChildren=Math.max(peak.liveChildren,fx.root.children.length);}
   await new Promise(r=>setTimeout(r,150));const pendingAfter=fx.cleanupTimers.size,artCache=fx.artUrl.size;fx.destroy();const canvases=host.querySelectorAll('canvas').length;host.remove();
   return {reveals:100,elapsedMs:Math.round(performance.now()-before),peak,pendingAfter,artCache,canvases};
  });
  check(result.pendingAfter===0&&result.canvases===0&&result.artCache===1,'100 real renderer reveals dispose nodes/timers and reuse art');fs.writeFileSync(path.join(out,'renderer-stress.json'),JSON.stringify(result,null,2));await page.close();
 }
 check(!errors.length,'no JavaScript errors: '+errors.join(' | '));check(!failed.length,'all artwork and scripts loaded: '+failed.join(' | '));
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checks,errors,failed},null,2));console.log(JSON.stringify({passed:checks.length,out,errors,failed}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
