import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {omegaFixture} from './helpers/awakened-omega-craft-fixture.mjs';
import {handleWorkshop,__workshopReadTest} from '../functions/_workshop.js';
import {executeAwakenedOmegaCraft,awakenedOmegaPityKey} from '../functions/_workshop_awakened_omega.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.OMEGA_QA_DIR,publicBase=process.env.QA_PUBLIC_BASE||'',run=promisify(execFile);
assert(out);await fs.mkdir(out,{recursive:true});let f;
const checks=[],errors=[],writes=[],check=(ok,label)=>{assert(ok,label);checks.push(label);};
const style='<style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}@media(max-width:600px){#view{padding:10px}}</style>';
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${['workshop-v1676','workshop-v1881','workshop-workbench-v1','command-ui-v1','mercenary-craft-reveal-v1'].map(s=>`<link rel="stylesheet" href="/css/${s}.css">`).join('')}${style}<main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-fixture');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script>${['workshop-recipes-v1','mercenary-craft-reveal-v1','workshop-v1881'].map(s=>`<script src="/js/${s}.js"></script>`).join('')}<script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
const cms=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"><style>body{display:block;padding:20px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">격리 CMS 검수</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7');</script><script src="/admin/workshop-admin-v1668.js"></script></html>`;
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/qa/workshop'||url.pathname==='/qa/cms'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(url.pathname.endsWith('cms')?cms:html);}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),action=url.pathname.slice(5);let response;
  if(action==='workshop/awakened-omega-craft'){
   const body=await request.json();writes.push(body);
   const result=await f.deps.withUserMutationLock(f.env,7,action,()=>executeAwakenedOmegaCraft(f.env,f.user,body,{randomInt:()=>9999}));
   response=Response.json({...result,state:await __workshopReadTest.userWorkshopState(f.env,f.user)});
  }else response=await handleWorkshop({path:action,request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
  res.writeHead(response?.status||404,{'content-type':'application/json'});return res.end(response?await response.text():'{}');
 }
 if(publicBase){const r=await fetch(publicBase+url.pathname+'?omegaCraft=20261029-v1',{signal:AbortSignal.timeout(30000)});res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
 const relative=decodeURIComponent(url.pathname).replace(/^\//,''),file=path.resolve(root,relative);assert(file.startsWith(path.resolve(root)+path.sep));let data;
 try{data=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;data=(await run('git',['show','HEAD:'+relative],{cwd:root,encoding:'buffer',maxBuffer:25e6,windowsHide:true})).stdout;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message.slice(0,300)}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const width of (publicBase?[390]:[1440,390])){
 if(f)await f.close();f=await omegaFixture();const before=await f.coin(),startWrites=writes.length;
 const page=await browser.newPage({viewport:{width,height:width<600?844:1000},serviceWorkers:'block',reducedMotion:'reduce'}),dialogs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const enter=async()=>{await page.goto(base+'/qa/workshop');await page.locator('[data-ws-section="MERCENARY_CRAFT"]').click();await page.locator('[data-material-recipe="'+f.omegaId+'"]').click();await page.locator('.ws-omega-forge').waitFor();};
 await enter();const text=await page.locator('.ws-omega-forge').innerText();
 check(text.includes('220만')&&text.includes('100조')&&text.includes('11회째')&&text.includes('10%'),width+' exact power/cost/rate/ceiling');
 check(!text.includes('마스터의 별'),width+' no star charge');
 await page.waitForFunction(()=>[...document.querySelectorAll('.ws-omega-forge img')].every(i=>i.complete&&i.naturalWidth>0));
 check(await page.locator('#workshopRootV1881').evaluate(e=>e.scrollWidth-e.clientWidth)<=1,width+' no horizontal overflow');
 await page.screenshot({path:path.join(out,width+'-recipe.png'),fullPage:true});
 const attempt=async(n,success)=>{
  await page.locator('#wsMaterialCraft').click();await page.locator('.mc-skip').waitFor();await page.locator('.mc-skip').click();await page.locator('.mc-reveal[data-phase="result"]').waitFor();
  const result=await page.locator('.mc-result').innerText();check(result.includes(success?'완성된 용병':'소모되었습니다'),width+' result '+n);check(result.includes(success?'누적 초기화':`${n} / 10회`),width+' result pity '+n);if(n===10)check(result.includes('다음 제작 100% 성공'),width+' next guaranteed');
  await page.screenshot({path:path.join(out,width+'-result-'+n+'.png')});await page.locator('.mc-done').click();
 };
 await attempt(1,false);await enter();check((await page.locator('.ws28-forge-pity').innerText()).includes('1 / 10회'),width+' reconnect preserves count');
 if(!publicBase){
  await f.setting(awakenedOmegaPityKey(7),{failures:9,revision:9});await enter();await attempt(10,false);await enter();check((await page.locator('#wsMaterialCraft').innerText()).includes('100%'),width+' guarantee button');await attempt(11,true);
  check((await page.locator('.ws28-forge-pity').innerText()).includes('0 / 10회'),width+' success resets count');
  check(await f.coin()===before-300000000000000&&await f.copies()===850&&await f.copies('V-972')===1,width+' exact transactions');
  check(writes.length-startWrites===3&&new Set(writes.slice(startWrites).map(r=>r.requestId)).size===3,width+' one request per click');
  await page.goto(base+'/qa/cms');await page.locator('#nav [data-view="workshop"]').click();await page.locator('[data-workshop-recipe-id="'+f.omegaId+'"]').click();
  check(await page.locator('#kaironCoin').inputValue()==='100000000000000',width+' CMS 100T');check(await page.locator('#kaironStars').inputValue()==='0'&&await page.locator('#kaironRate').inputValue()==='10',width+' CMS exact stars/rate');
  check(await page.locator('#kaironCoin').evaluate(e=>e.readOnly),width+' CMS fixed policy');check(await page.locator('[data-workshop-material-code]').inputValue()==='MERCENARY:V-021',width+' CMS actual mercenary material');
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/workshop')&&r.request().method()==='POST'),page.locator('#kaironSave').click()]);check(response.ok(),width+' CMS saves preserved recipe');
  await page.screenshot({path:path.join(out,width+'-cms.png'),fullPage:true});
 }
 check(dialogs.some(d=>d.includes('오메가-X 50장')&&d.includes('100조')),width+' explicit cost confirmation');await page.close();
}check(errors.length===0,'no browser exceptions');await fs.writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,publicBase,productionWrites:0},null,2));console.log(JSON.stringify({passed:checks.length,errors}));}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));if(f)await f.close();}
