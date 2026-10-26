import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {packageFixture} from '../../../tests/helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE_SALES_ENDS_AT as end} from '../../../shared/support-package-v1.mjs';
const root=process.cwd(),out=path.resolve(process.env.PACKAGE_HIDE_QA_OUT||'docs/qa/support-package-hide-20261026');fs.mkdirSync(out,{recursive:true});
let f,posts=0;const staticCache=new Map(),reports=[];
const overrides=process.env.PACKAGE_HIDE_PUBLIC_DIR?path.resolve(process.env.PACKAGE_HIDE_PUBLIC_DIR):null;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(['/qa','/qa-package'].includes(url.pathname)){
  const standalone=url.pathname==='/qa-package';
  return res.writeHead(200,{'content-type':mime['.html']}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/support-package-v1.css"><body style="margin:12px;background:#080e19;color:#e4e8f0"><div id="host"></div><script type="module">
   import {mountServerSupportNavigation} from '/js/server-support-v1.mjs';import {mountSupportPackage} from '/js/support-package-v1.mjs';
   localStorage.setItem('cnine_card_api_token','qa-2');localStorage.setItem('cnine_battle_sound','OFF');
   window.api=async(endpoint,options={})=>{const r=await fetch('/api/'+endpoint,{method:options.method||'GET',headers:{'content-type':'application/json',authorization:'Bearer qa-2'},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status,code:data.code,retryable:data.retryable});return data;};
   const host=document.getElementById('host');
   if(${standalone})window.view=mountSupportPackage(host,{request:window.api,userId:2});
   else{const root=host.attachShadow({mode:'open'});root.innerHTML='<dialog id="menu-dialog" data-menu-category="all" style="background:#111b2c;color:#fff;min-width:280px"><h2>전체 메뉴</h2></dialog>';window.view=mountServerSupportNavigation({root,getUser:()=>({id:2}),request:window.api});root.getElementById('menu-dialog').showModal();}
  </script></body></html>`);
 }
 if(url.pathname.startsWith('/api/')){
  const endpoint=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(endpoint==='server-support/package/apply')posts++;
  const result=await f.call(endpoint,{user:2,method:req.method,body:chunks.length?JSON.parse(Buffer.concat(chunks)):undefined});
  return res.writeHead(result.status,{'content-type':'application/json'}).end(JSON.stringify(result.body));
 }
 const relative=decodeURIComponent(url.pathname).replace(/^\//,''),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(!staticCache.has(relative)){
  const override=overrides&&path.join(overrides,relative);
  staticCache.set(relative,override&&fs.existsSync(override)?fs.readFileSync(override):fs.existsSync(file)?fs.readFileSync(file):execFileSync('git',['show','HEAD:'+relative],{cwd:root,windowsHide:true,maxBuffer:8e6,stdio:['ignore','pipe','pipe']}));
 }
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(staticCache.get(relative));
}catch(error){res.writeHead(500,{'content-type':'text/plain'}).end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const width of (process.env.PACKAGE_HIDE_PUBLIC_DIR?[390]:[1440,390])){
 f=await packageFixture({postgres:true});f.clock.now=end-60000;await f.activate();
 const requestId=crypto.randomUUID(),order=(await f.apply(2,requestId)).body.order;
 const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),errors=[],failed=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const pages=[];
 for(const kind of ['info','package']){
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push(r.url());});
  await page.clock.install({time:new Date(end-60000)});await page.clock.pauseAt(new Date(end-60000));
  await page.goto(base+'/qa');await page.getByRole('button',{name:'서버 안내',exact:true}).click();await page.locator('[data-ss-package]').waitFor();
  if(kind==='package'){await page.locator('[data-ss-package]').click();await page.locator('[data-package-apply]').waitFor();assert.match(await page.locator('.spkg-hero').innerText(),/49,800/);}
  await page.locator('.ss-dialog').screenshot({path:path.join(out,kind+'-before-'+width+'.png')});
 }
 const beforePosts=posts;f.clock.now=end;
 for(let i=0;i<pages.length;i++){
  const page=pages[i];await page.clock.runFor(60001);
  assert.equal(await page.locator('[data-ss-package]').count(),0);assert.equal(await page.locator('[data-package-apply]').count(),0);
  assert.equal(await page.locator('[data-ss-support]').count(),1);assert.equal(await page.locator('[data-ss-season-pass]').count(),1);
  assert.equal(await page.locator('.ss-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.locator('.ss-dialog').screenshot({path:path.join(out,(i?'package':'info')+'-after-'+width+'.png')});
 }
 assert.equal(posts,beforePosts,'Crossing midnight must not submit any requests');
 await pages[0].reload();await pages[0].getByRole('button',{name:'서버 안내',exact:true}).click();await pages[0].locator('[data-ss-support]').waitFor();assert.equal(await pages[0].locator('[data-ss-package]').count(),0);
 const direct=await context.newPage();direct.on('pageerror',e=>errors.push(e.message));await direct.goto(base+'/qa-package');await direct.getByRole('heading',{name:'패키지 판매가 종료되었습니다.'}).waitFor();assert.equal(await direct.locator('[data-package-apply]').count(),0);assert.equal(await direct.locator('.spkg-hero').count(),0);
 await direct.evaluate(rid=>localStorage.setItem('cnine_support_package_pending_v1:2',JSON.stringify({requestId:rid})),requestId);await direct.reload();await direct.getByRole('button',{name:'이전 신청 결과 확인'}).click();await direct.getByText('저장된 신청 결과를 확인했습니다.',{exact:true}).waitFor();
 const denied=await direct.evaluate(async()=>{try{await window.api('server-support/package/apply',{method:'POST',body:{requestId:crypto.randomUUID()}});return null;}catch(e){return {status:e.status,code:e.code};}});assert.deepEqual(denied,{status:410,code:'SUPPORT_PACKAGE_CLOSED'});
 assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),1);
 assert.equal((await f.process(order)).status,200);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200000000001234);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 reports.push({width,hiddenAtMidnight:true,openPackageReturnsToInfo:true,reloadedHidden:true,supportAndPassRemain:true,directClosed:true,priorReceiptRecovered:true,newApplicationRejected:410,pendingFulfilled:true,noAutomaticApplication:true,errors,failed});
 await context.close();await f.close();f=null;
}fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(f)await f.close();}
