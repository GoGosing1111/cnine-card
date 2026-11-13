import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { advancementFixture } from './helpers/mercenary-advancement-fixture.mjs';
import { handleMercenaryAccount } from '../functions/_mercenary_account_routes.js';
import { handleMercenaryCodex } from '../functions/_mercenary_codex.js';
import { checkPlayback, stageMarkup } from './helpers/mercenary-advancement-playback.mjs';
import { serveStore } from '../functions/_onestore_web.js';

const root=path.resolve(import.meta.dirname,'..'),out=process.env.ADVANCEMENT_QA_OUTPUT;
const pw=await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const mime={'.mjs':'application/javascript','.js':'application/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json',
  '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.atlas':'text/plain'};
const assets=new Map();
async function asset(url){
  let pathname=decodeURIComponent(new URL(url).pathname);if(pathname.endsWith('/'))pathname+='index.html';
  const rel=pathname.slice(1),file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)||!mime[path.extname(rel)])return new Response(null,{status:404});
  let data=assets.get(rel);
  if(!data){
    try{data=await fs.readFile(file);}catch{
      try{data=execFileSync('git',['show','HEAD:'+rel],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:48e6,windowsHide:true});}
      catch{return new Response(null,{status:404});}
    }
    if(data.length<6e6)assets.set(rel,data);
  }
  return new Response(data,{headers:{'content-type':mime[path.extname(rel)]}});
}
let fixture;
async function handle(raw,res){
  const url=new URL(raw.url,'http://'+raw.headers.host),chunks=[];
  for await(const chunk of raw)chunks.push(chunk);
  const req=new Request(url,{method:raw.method,headers:raw.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  let response;
  if(url.pathname==='/battle-advancement-qa/')response=new Response(stageMarkup,{headers:{'content-type':'text/html; charset=utf-8'}});
  else if(url.pathname.startsWith('/api/')){
    const args={path:url.pathname.slice(5),request:req,env:fixture.env,deps:fixture.deps};
    response=args.path==='mercenary-codex'?await handleMercenaryCodex(args):await handleMercenaryAccount(args);
    response??=Response.json({});
  }else if(url.pathname.startsWith('/onestore/')){
    response=await serveStore({request:req,env:{ASSETS:{fetch:req=>asset(req.url)}},next:()=>asset(url)});
  }else response=await asset(url);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}
const server=http.createServer((req,res)=>void handle(req,res).catch(e=>{console.error(e.message);res.writeHead(500);res.end();}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const results=[];
async function measureEntry(page){
  return page.evaluate(async()=>{
    const start=performance.now();document.querySelector('#openAdvancement').click();
    return new Promise((resolve,reject)=>{
      let frames=0;
      function sample(){
        const select=document.querySelector('dialog[open] [data-action="role"]');
        if(select&&!select.disabled&&select.closest('dialog').getAttribute('aria-busy')==='false'){
          if(++frames>=2){resolve(Math.round(performance.now()-start));return;}
        }
        if(performance.now()-start>20000){reject(Error(document.querySelector('.adv-empty')?.textContent||'전직창 시간 초과'));return;}
        requestAnimationFrame(sample);
      }
      sample();
    });
  });
}
const runs=process.env.ADVANCEMENT_QA_DEVICES?.split(',')||['pc','ios','android','h5','windows'];
try{
  for(const name of runs){
    fixture=await advancementFixture(null);
    const mobile=['ios','android','h5','narrow','battle-mobile'].includes(name);
    const browser=await (name==='ios'?pw.webkit:pw.chromium).launch(name==='ios'?{headless:true}:{headless:true,executablePath:chrome,args:['--mute-audio','--enable-unsafe-swiftshader']});
    try{
      const ctx=await browser.newContext({viewport:{width:mobile?(name==='narrow'?320:390):1440,height:mobile?844:900},hasTouch:mobile,serviceWorkers:'block'});
      await ctx.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');});
      const page=await ctx.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
      if(name.startsWith('battle-')){
        const row=await checkPlayback({page,origin,root,out,mobile});
        assert.deepEqual(errors,[]);console.log(JSON.stringify(row));results.push(row);await ctx.close();continue;
      }
      const url=origin+(name==='h5'?'/onestore':'')+'/mercenary-codex/';
      await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!document.querySelector('#openAdvancement')?.onclick);
      if(!await page.locator('#openAdvancement').isVisible())await page.locator('#managementPanel summary').click();
      const before=requests.filter(r=>r.url.includes('/advancement/')||r.url.includes('/mercenary-advancement-')).length;
      assert.equal(before,0,'codex defers advancement payload');
      const cold=await measureEntry(page);
      await page.locator('[data-action="mercenary"]').selectOption('V-996');
      assert.equal(await page.locator('[data-action="role"]').count(),16);
      assert.match(await page.locator('.adv-code').innerText(),/Lv\.11/);
      assert.match(await page.locator('.adv-conditions .met').last().innerText(),/11레벨 이상/);
      assert.equal(await page.locator('[data-action="confirm"]').isEnabled(),true);
      const geometry=await page.evaluate(()=>({page:document.documentElement.scrollWidth<=innerWidth,roles:[...document.querySelectorAll('.adv-role')].every(e=>e.querySelector('b').getBoundingClientRect().bottom<=e.querySelector('small').getBoundingClientRect().top+1),squareIcons:[...document.querySelectorAll('.adv-role .adv-icon')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&Math.abs(r.width-r.height)<1;})}));
      assert.ok(geometry.page&&geometry.roles&&geometry.squareIcons,JSON.stringify(geometry));
      if(out&&['ios','pc'].includes(name))await page.screenshot({path:path.join(out,name+'-codex.png')});
      await page.locator('[data-action="close"]').first().click();
      const warm=await measureEntry(page);
      await page.locator('[data-action="mercenary"]').selectOption('V-996');await page.locator('[data-action="role"][data-value="guardian"]').click();
      await page.locator('[data-action="preview"]').click();await page.locator('.adv-effect-preview button').first().waitFor();
      await page.waitForFunction(()=>!document.querySelector('.adv-effect-preview button').disabled);
      const frame=await page.evaluate(()=>new Promise(resolve=>{const dt=[];let start=performance.now(),prev=start;document.querySelector('.adv-effect-preview button').click();
        function next(now){dt.push(now-prev);prev=now;if(now-start<700){requestAnimationFrame(next);return;}dt.sort((a,b)=>a-b);resolve({p95Ms:+dt[Math.floor(dt.length*.95)].toFixed(1),over50:dt.filter(x=>x>50).length,n:dt.length});}requestAnimationFrame(next);}));
      await page.locator('.adv-effect-preview button').last().click();
      await page.locator('[data-action="confirm"]').click();
      let lost=false;const ids=[];
      await page.route('**/api/mercenaries/v3/advancement/change',async route=>{
        ids.push(route.request().postDataJSON().idempotencyKey);
        if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();
      });
      await page.locator('[data-action="commit"]').click();await page.locator('[data-action="recover"]:enabled').waitFor();
      assert.equal(ids.length,1,'the server received the first request before the forced reload');
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!document.querySelector('#openAdvancement')?.onclick);
      if(!await page.locator('#openAdvancement').isVisible())await page.locator('#managementPanel summary').click();
      await page.locator('#openAdvancement').click();await page.locator('[data-action="recover"]').click();
      await page.waitForSelector('.adv-success');assert.match(await page.locator('.adv-success').innerText(),/수호자/);
      assert.equal(ids.length,2);assert.equal(new Set(ids).size,1);const snap=(await fixture.call('state')).data;
      assert.equal(snap.wallet.MASTER_STAR,'110000000');assert.equal(snap.cards.find(c=>c.code==='V-996').advancement.id,'guardian');
      await page.locator('[data-action="continue"]').click();await page.locator('[data-action="role"][data-value="commander"]').click();
      await page.locator('[data-action="confirm"]').click();await page.locator('[data-action="commit"]').click();await page.waitForSelector('.adv-success');
      assert.equal((await fixture.call('state')).data.wallet.MASTER_STAR,'60000000');
      await page.locator('[data-action="close"]').first().click();
      const afterExit=await page.evaluate(()=>({previewCanvas:document.querySelectorAll('.adv-effect-preview canvas').length,openDialogs:document.querySelectorAll('.adv-window[open]').length}));
      assert.equal(afterExit.previewCanvas+afterExit.openDialogs,0);assert.deepEqual(errors,[]);
      results.push({name,coldMs:cold,reentryMs:warm,frame,geometry,assetsBeforeOpening:before,recoveredWithSameKey:true,afterExit,errors});
      console.log(JSON.stringify(results.at(-1)));await ctx.close();
    }finally{await browser.close();await fixture.close();}
  }
  if(out)await fs.writeFile(path.join(out,runs.every(name=>name.startsWith('battle-'))?'battle-browser.json':'browser.json'),JSON.stringify(results,null,2));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
