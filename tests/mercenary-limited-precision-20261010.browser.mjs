import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {handleLimitedPack} from '../functions/_mercenary_limited_pack.js';
const root=process.cwd(),out=path.join(root,'docs/qa/mercenary-limited-precision-20261010');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await limitedFixture({after:fn=>cleanup.push(fn)});f.policy.cardWeights['V-996']=1;
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const adapter=`const api=async(path,options={})=>{const response=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},body:options.body===undefined?undefined:typeof options.body==='string'?options.body:JSON.stringify(options.body)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'API error'),{status:response.status,code:data.code});return data;};`;
const head='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>리미티드팩 확률 정밀도 격리 검수</title>';
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/cms-qa'){res.setHeader('content-type','text/html');return res.end(head+'<link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><style>body{margin:0;padding:18px;background:#10141d;color:#eee;font-family:Arial,sans-serif}main{max-width:1160px;margin:auto}input,textarea{box-sizing:border-box}</style><main class="mc-admin"><div id="editor"></div></main><script type="module">import {createLimitedMercenaryEditor} from "/admin/mercenary-limited-admin-v1.js?v=20261010-precision";'+adapter+'const host=document.getElementById("editor"),render=()=>{host.innerHTML=editor.html();editor.mount(host.querySelector("[data-limited-root]"));};const editor=createLimitedMercenaryEditor({request:options=>api("admin/mercenaries/limited-pack",options),onRender:render});render();</script>');}
  if(url.pathname==='/pack-qa'){res.setHeader('content-type','text/html');return res.end(head+'<body style="background:#10141d"><script type="module">import {mountLimitedPack} from "/js/mercenary-limited-pack-live.mjs?v=20261010-precision";import {memoryStorage} from "/preview/mercenary-limited-pack-20261006-v1/fixture.mjs";'+adapter+'await mountLimitedPack({api,accountId:1,getAccountId:()=>1,storage:memoryStorage(),lock:async(key,run)=>run()});</script>');}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:{'content-type':'application/json',...(req.headers.origin?{origin:req.headers.origin}:{}),...(req.headers['sec-fetch-site']?{'sec-fetch-site':req.headers['sec-fetch-site']}:{})},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
   const response=await handleLimitedPack({path:url.pathname.slice(5),request,env:f.env,deps:{requirePermission:async()=>f.user,authenticate:async()=>f.user,withUserMutationLock:async(env,id,name,run)=>run(),json:(body,status=200)=>Response.json(body,{status})}});
   res.writeHead(response?.status||404,{'content-type':'application/json'});return res.end(response?await response.text():'{}');
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end();
  res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const [label,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  await f.configure();const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700}),errors=[],failed=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const watch=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push({status:r.status(),url:r.url()});});};
  const cms=await context.newPage();watch(cms);await cms.goto(base+'/cms-qa');await cms.locator('[data-limited-rate="SS"]').waitFor();
  for(const [selector,value]of [['[data-limited-rate="SS"]','0.00000001'],['[data-limited-rate="SSS"]','0.00000002'],['[data-limited-extra-rate="NONE"]','99.99999997']]){
   await cms.locator(selector).fill(value);assert.equal(await cms.locator(selector).getAttribute('step'),'0.00000001');assert.equal(await cms.locator(selector).evaluate(el=>el.validity.valid),true);
  }
  assert.equal(await cms.locator('[data-limited-total]').innerText(),'현재 합계 100%');
  await cms.locator('[data-limited-save]').click();await cms.waitForFunction(()=>document.querySelector('[data-limited-root]')?.textContent.includes('저장 완료'));
  await cms.locator('[data-limited-reload]').click();await cms.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('불러왔습니다'));
  assert.equal(await cms.locator('[data-limited-rate="SS"]').inputValue(),'0.00000001');assert.equal(await cms.locator('[data-limited-rate="SSS"]').inputValue(),'0.00000002');
  await cms.locator('.mlc-limited-odds').scrollIntoViewIfNeeded();await cms.screenshot({path:path.join(out,label+'-cms.png')});
  const pack=await context.newPage();watch(pack);await pack.goto(base+'/pack-qa');await pack.locator('[data-lp-canvas][data-state="ready"]').waitFor();
  assert.equal(await pack.locator('[data-lp-buy="1"]').isEnabled(),true);assert.equal(await pack.locator('[data-lp-buy="10"]').isEnabled(),true);
  await pack.locator('.lp-details summary').click();await pack.locator('[data-lp-odds]').scrollIntoViewIfNeeded();
  const odds=await pack.locator('[data-lp-odds]').innerText();assert.match(odds,/SS 리미티드 0\.00000001%/);assert.match(odds,/SSS 리미티드 0\.00000002%/);assert.match(odds,/꽝 99\.99999997%/);
  const settings=await pack.evaluate(async()=>await fetch('/api/mercenary-limited-pack/config').then(r=>r.json()));assert.deepEqual(settings.policy.rankRatesPpm,{SS:.0001,SSS:.0002});
  await pack.screenshot({path:path.join(out,label+'-public-odds.png')});
  assert.equal(await cms.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await pack.locator('.lp-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({label,width,height,minStep:'0.00000001%',cmsSavedAndReloaded:true,publicOddsMatchStoredValues:true,manualAndTenButtonsEnabled:true,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASSED',scope:'Real CMS/public controllers and actual pack API with isolated PostgreSQL fixture; no production settings changed or purchases',reports},null,2)+'\n');console.log(JSON.stringify({status:'PASSED',reports},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const fn of cleanup)await fn();}
