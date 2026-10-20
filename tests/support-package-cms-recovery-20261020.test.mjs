import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

test('support CMS recovers reads, preserves open payment forms and clears revoked or changed sessions',async()=>{
 const root=process.cwd(),out=process.env.CMS_RECOVERY_QA_DIR||path.join(os.tmpdir(),'cnine-support-cms-recovery-20261020');
 await fs.mkdir(out,{recursive:true});
 const order={id:'2_qa-package-order-20261020',userId:2,nickname:'패키지 검수 계정',revision:0,createdAt:Date.now(),status:'PENDING'};
 let faults=1,denied=false,reads=0,mutations=0,packageReads=0;
 const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.html':'text/html'};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   const json=(data,status=200)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(data));
   if(url.pathname==='/qa'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/server-support-v1.css"><link rel="stylesheet" href="/css/support-package-v1.css"><body style="background:#080e19;color:#e4e8f0;margin:12px"><nav id="nav"></nav><h1 id="pageTitle"></h1><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','qa-1');window.__SOOP_CMS_IDENTITY__={role:'OWNER',nickname:'핑크빛유두'};</script><script type="module" src="/admin/server-support-admin-v1.mjs"></script></body></html>`);
    return;
   }
   if(url.pathname.startsWith('/api/')){
    if(req.method!=='GET'){mutations++;return json({error:'Read-only CMS regression'},405);}
    const endpoint=url.pathname.slice(5);
    if(endpoint==='admin/server-support'){
     reads++;
     if(req.headers.authorization!=='Bearer qa-1'||denied)return json({error:'후원 관리는 핑크빛유두 전용입니다.'},403);
     if(faults-->0)return json({error:'일시적인 서버 조회 오류',retryable:true},503);
     return json({adminId:1,subscribers:[],history:[],serverNow:Date.now()});
    }
    if(endpoint==='admin/server-support/package'){packageReads++;return json({pending:[order],recent:[]});}
    if(endpoint==='admin/server-support/package/alerts')return json({pending:[]});
    if(endpoint==='admin/server-support/application')return json({config:{enabled:true,revision:0}});
    return json({});
   }
   if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   const bytes=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
 try{
  for(const width of [1440,390]){
   faults=1;denied=false;reads=0;mutations=0;packageReads=0;
   const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   page.on('pageerror',error=>errors.push(error.message));
   const sync=()=>page.evaluate(()=>dispatchEvent(new CustomEvent('soop:cms-identity',{detail:window.__SOOP_CMS_IDENTITY__})));
   const waitRead=async(previous)=>{for(let i=0;i<100&&reads<=previous;i++)await new Promise(r=>setTimeout(r,30));assert(reads>previous);};
   await page.goto(base+'/qa?supportPackage=1');
   const nav=page.locator('[data-view="server-support"]'),panel=page.locator('#view-server-support');
   await nav.waitFor({state:'visible',timeout:10000});
   assert.equal(reads,2,'initial 503 must retry without another login or reload');
   await page.locator('[data-package-order]').click();
   const note=page.locator('[data-package-admin-form] input[name="note"]');
   await note.fill('검수 중인 입금 메모');await page.locator('input[name="paid"]').check();
   await page.evaluate(()=>window.__keptPaymentForm=document.querySelector('[data-package-admin-form]'));
   const openedReads=packageReads;
   faults=1;
   const before=reads;await sync();await waitRead(before);
   assert.equal(await nav.isVisible(),true);assert.equal(await panel.isVisible(),true);
   assert.equal(await note.inputValue(),'검수 중인 입금 메모');
   await waitRead(before+1);
   assert.equal(await page.evaluate(()=>window.__keptPaymentForm===document.querySelector('[data-package-admin-form]')),true);
   assert.equal(await page.locator('input[name="paid"]').isChecked(),true);
   assert.equal(packageReads,openedReads,'identity refresh must not remount package forms');
   assert.equal(mutations,0,'read retries must never submit payment or grants');
   await panel.screenshot({path:path.join(out,'recovered-'+width+'.png')});
   assert.equal(await panel.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   // Switching to another OWNER immediately removes the previous account's form.
   await page.evaluate(()=>{localStorage.setItem('cnine_admin_token','qa-other');window.__SOOP_CMS_IDENTITY__={role:'OWNER',nickname:'다른 운영자'};dispatchEvent(new CustomEvent('soop:cms-identity',{detail:window.__SOOP_CMS_IDENTITY__}));});
   await nav.waitFor({state:'hidden'});
   assert.equal(await page.locator('[data-package-admin-form]').count(),0);
   await page.evaluate(()=>{localStorage.setItem('cnine_admin_token','qa-1');window.__SOOP_CMS_IDENTITY__={role:'OWNER',nickname:'핑크빛유두'};dispatchEvent(new CustomEvent('soop:cms-identity',{detail:window.__SOOP_CMS_IDENTITY__}));});
   await nav.waitFor({state:'visible'});await page.locator('[data-package-order]').waitFor();
   denied=true;const beforeDenied=reads;await sync();await waitRead(beforeDenied);await nav.waitFor({state:'hidden'});
   assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('[data-package-admin-form]').count(),0);
   const deniedReads=reads;await page.evaluate(()=>dispatchEvent(new Event('online')));
   await new Promise(r=>setTimeout(r,1100));assert.equal(reads,deniedReads,'403 must not enter the transient retry path');
   assert.deepEqual(errors,[]);assert.equal(mutations,0);
   reports.push({width,initialReadRetry:true,openFormPreserved:true,packageReadNotRepeated:true,sessionSwitchClears:true,forbiddenNotRetried:true,mutations,errors});
   await context.close();
  }
  await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(reports,null,2)+'\n');
  console.log(JSON.stringify({out,reports}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
