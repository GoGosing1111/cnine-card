import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.cwd(),out=process.env.LIMITED_MIXED_QA_OUT||path.join(root,'preview/mercenary-limited-pack-20261006-v1/qa-mixed');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((request,response)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://local').pathname));if(!file.startsWith(root+path.sep))return response.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return response.writeHead(404).end();response.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(response);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],failed=[],observed=[];
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:980},serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push(r.status()+' '+r.url());});
  await page.addInitScript(()=>{let value;Object.defineProperty(window,'HyperPackFX',{configurable:true,get:()=>value,set:api=>{value={...api,create:(host,onState,options)=>{const fx=api.create(host,event=>{window.mixedQaEvent=event;onState?.(event);},options);window.mixedQaFx=fx;return fx;}};}});});
  await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/');await page.waitForSelector('[data-lp-canvas][data-state=ready]');
  check(await page.locator('.lp-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),width+' contract has no horizontal overflow');
  check((await page.locator('[data-lp-odds]').textContent()).includes('SSS 일반 용병'),width+' ordinary SSS odds visible');
  check((await page.locator('[data-lp-odds]').textContent()).includes('SSS 리미티드 0.0001%'),width+' separate rare SSS odds retain precision');
  for(const edition of ['STANDARD','LIMITED_SS','LIMITED_SSS']){
   await page.locator('[data-lp-buy="1"]').click();await page.locator('[data-lp-confirm-start]').click();
   await page.waitForFunction(()=>window.mixedQaEvent?.state==='revealed');
   await page.waitForFunction(()=>window.mixedQaFx.timeline?.time()>1.8);
   const visual=await page.evaluate(()=>{const fx=window.mixedQaFx,row=window.mixedQaEvent.result,nodes=[];const visit=n=>{if(n.text)nodes.push(n.text);for(const c of n.children||[])visit(c);};visit(fx.root);return {result:row,texts:nodes,art:fx.artUrl.get(row.mercenaryCode)};});
   check(visual.result.edition===(edition==='STANDARD'?'STANDARD':'LIMITED'),width+' '+edition+' confirmed edition');
   check(edition==='STANDARD'?visual.art.includes('/codex-v1/')&&!visual.texts.some(s=>s.includes('리미티드')||s.includes('서버 발행 No.')):visual.art.includes('/packs/limited-v1/')&&visual.texts.some(s=>s.includes('리미티드')),width+' '+edition+' correct artwork and labels');
   check((await page.locator('[data-lp-status]').innerText()).includes(edition==='STANDARD'?'일반 용병 계약':'리미티드'),width+' '+edition+' correct contract status');
   observed.push({width,edition,code:visual.result.mercenaryCode,rank:visual.result.rank,art:visual.art,texts:visual.texts});
   await page.screenshot({path:path.join(out,width+'-'+edition+'.png'),fullPage:true});
   await page.waitForFunction(()=>document.querySelector('[data-lp-buy="1"]').disabled===false);
  }
  check(!(await page.locator('[data-lp-history]').innerText()).includes('undefined'),width+' ordinary receipt has no false serial');
  await page.locator('[data-lp-close]').click();
  await page.goto(base+'/preview/mercenary-limited-pack-20261006-v1/cms.html');await page.waitForSelector('[data-limited-normal-rate="SS"]');
  check(await page.locator('[data-limited-normal-rate]').count()===6,width+' CMS exposes six ordinary rank rates');check(await page.locator('[data-limited-rate]').count()===2,width+' CMS exposes two separate limited rates');
  await page.locator('[data-limited-normal-rate="C"]').fill('50.1');await page.locator('[data-limited-normal-rate="SS"]').fill('0.8');await page.locator('[data-limited-rate="SS"]').fill('0.001');await page.locator('[data-limited-rate="SSS"]').fill('0.0001');
  check((await page.locator('[data-limited-total]').innerText()).includes('100%'),width+' all absolute rates sum to 100%');await page.locator('[data-limited-save]').click();await page.waitForFunction(()=>document.querySelector('[data-limited-root]').textContent.includes('저장 완료'));
  for(const [selector,value] of [['[data-limited-normal-rate="SS"]','0.8'],['[data-limited-normal-rate="SSS"]','0.0989'],['[data-limited-rate="SS"]','0.001'],['[data-limited-rate="SSS"]','0.0001']])check(await page.locator(selector).inputValue()===value,width+' independently saved '+selector);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' CMS has no horizontal overflow');await page.screenshot({path:path.join(out,width+'-cms.png'),fullPage:true});await page.close();
 }
 check(errors.length===0,'no browser runtime errors');check(failed.length===0,'no missing artwork/modules');
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checks,observed,errors,failed},null,2));console.log(JSON.stringify({passed:checks.length,observed,errors,failed}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
