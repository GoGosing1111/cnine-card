import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {weeklyFixture} from './helpers/ranked-duo-weekly.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=process.env.DUO_QA_OUT||join(tmpdir(),'duo-additional-recruitment-20260928');
test('PC/mobile CMS configures hours; player lobby keeps battle and enrollment available',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());mkdirSync(out,{recursive:true});
 const shell='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#08111b;color:#e6f0fa;font-family:Arial,"Malgun Gothic",sans-serif}*{box-sizing:border-box}#root{margin:auto;max-width:1100px}</style></head><body><main id="root"></main></body></html>';
 const server=createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(shell);return;}
  const file=resolve(root,'.'+pathname);if(!file.startsWith(root)){res.writeHead(403).end();return;}
  res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [1440,390]){
  const f=await weeklyFixture(t);await f.active();const initial=await f.season(),errors=[],writes=[];
  const page=await browser.newPage({viewport:{width,height:950},serviceWorkers:'block',reducedMotion:'reduce',isMobile:width===390,hasTouch:width===390});
  t.after(()=>page.close());page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  let user=1;
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.slice(5),method=req.method(),body=req.postData()?req.postDataJSON():{};
   if(method!=='GET')writes.push({path,body});
   const result=await f.call(path,{user,method,body});await route.fulfill({status:result.status,json:result.data});
  });
  await page.goto(origin);
  await page.evaluate(async()=>{
   const link=document.createElement('link');link.rel='stylesheet';link.href='/admin/ranked-duo-v1.css';document.head.append(link);
   const root=document.getElementById('root');root.className='duo-admin';
   await (await import('/admin/ranked-duo-v1.mjs')).mountDuoCms(root);
  });
  const input=page.locator('[name="recruitHours"]');
  assert.equal(await input.inputValue(),'12');
  await page.locator('[data-action="recruit"]').click();await page.waitForFunction(()=>document.querySelector('[data-action="recruit"]').textContent==='모집 시간 변경');
  assert.equal((await f.season()).config.additionalRecruitment.hours,12);
  await input.fill('3');await page.locator('[data-action="recruit"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('마감')&&!document.querySelector('[data-action="recruit"]').disabled);
  assert.equal((await f.season()).config.additionalRecruitment.hours,3);
  assert.equal((await f.season()).config.endsAt,initial.config.endsAt);
  assert.ok(writes.slice(0,2).every(w=>w.body.seasonId===initial.id&&Number.isInteger(w.body.revision)));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'CMS fits viewport');
  await page.screenshot({path:join(out,width+'-cms.png')});
  const mount=async id=>{
   user=id;await page.goto(origin);
   await page.evaluate(async userId=>{
    const api=async(path,options={})=>{const r=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})}),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),data);return data;};
    await (await import('/js/ranked-duo-v1.mjs')).mountRankedDuo({root:document.getElementById('root'),api,userId,navigate:()=>{},ensureBattle:async()=>{}});
   },id);
   await page.locator('.duo-additional-recruitment').waitFor();
  };
  await mount(2);assert.equal(await page.locator('[data-duo="match"]').isEnabled(),true);
  assert.equal(await page.locator('[data-duo="join"]').count(),0);
  assert.match(await page.locator('.duo-season-date').innerText(),/대전 기간/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'player lobby fits viewport');
  await page.screenshot({path:join(out,width+'-existing-team.png'),fullPage:true});
  await mount(6);assert.equal(await page.locator('[data-duo="join"]').innerText(),'추가모집 참가 신청');
  await page.screenshot({path:join(out,width+'-new-entrant.png'),fullPage:true});
  await page.locator('[data-duo="join"]').click();await page.locator('[data-duo="cancel"]').waitFor();
  assert.equal((await f.call('ranked-duo/status',{user:6})).data.waiting,true);
  await page.locator('[data-duo="cancel"]').click();await page.locator('[data-duo="join"]').waitFor();
  assert.equal((await f.call('ranked-duo/status',{user:6})).data.joined,false);
  assert.deepEqual(errors,[]);await page.close();
 }
 t.diagnostic('Screenshots: '+out);
});
