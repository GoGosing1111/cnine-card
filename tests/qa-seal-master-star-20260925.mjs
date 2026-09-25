// Real seal UI and API handlers over a disposable local database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sealStarFixture} from './helpers/seal-star-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve('../qa-seal-master-star-20260925');await fs.mkdir(out,{recursive:true});
let fixture;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const part of req)body+=part;
  const route=url.pathname.slice(5),result=await fixture.request(route,body?JSON.parse(body):undefined,route.startsWith('admin/')?'OWNER':'USER');
  res.writeHead(result.status,{'content-type':'application/json'});res.end(JSON.stringify(result.body));return;
 }
 if(['/player','/cms'].includes(url.pathname)){
  const admin=url.pathname==='/cms';res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${admin?'/admin/admin-v945.css':'/css/seal-battle.css'}">${admin?'<link rel="stylesheet" href="/admin/seal-battle-admin.css">':''}<style>body{margin:0;background:#0b101c;color:#e9efff;font:14px Arial,sans-serif}main{max-width:1200px;margin:24px auto;padding:0 16px}*,*:before,*:after{box-sizing:border-box}[hidden]{display:none!important}</style><script>var state={role:'OWNER'};function show(){};window.apiRequest=window.api=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json'}}),v=await r.json();if(!r.ok)throw Error(v.error);return v;};</script><main>${admin?'<nav id="nav"></nav><h1 id="pageTitle"></h1><div id="cms"></div>':'<div class="pve-mode-tabs"></div><div id="pveRaidView"></div>'}</main><script src="${admin?'/admin/seal-battle-admin.js':'/js/seal-battle.js'}"></script></html>`);return;
 }
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root)){res.writeHead(403);res.end();return;}
 const content=await fs.readFile(target),ext=path.extname(target),types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
 res.writeHead(200,{'content-type':types[ext]||'application/octet-stream'});res.end(content);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],results=[];
try{
 for(const [label,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  fixture=await sealStarFixture();await fixture.run("UPDATE seal_battle_events SET status='CLEARED'");
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());void d.accept();});
  await page.goto(base+'/cms');await page.locator('[data-view="sealbattle"]').click();await page.waitForFunction(()=>document.querySelector('#sealClearMasterStar')?.value==='200000');
  await page.locator('#sealClearMasterStar').fill('250000');await page.locator('#sealAdminSave').click();await page.waitForFunction(()=>!document.querySelector('#sealAdminSave').disabled);
  await page.locator('#sealAdminRefresh').click();await page.waitForFunction(()=>document.querySelector('#sealClearMasterStar')?.value==='250000');assert.match(await page.locator('#sealAdminEventSummary').innerText(),/200,000개/);
  await page.locator('#sealClearMasterStar').fill('200000');await page.locator('#sealAdminSave').click();await page.waitForFunction(()=>!document.querySelector('#sealAdminSave').disabled);
  await page.locator('#sealClearMasterStar').locator('xpath=ancestor::article').screenshot({path:path.join(out,label+'-cms.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'CMS overflow '+label);
  await page.goto(base+'/player');await page.locator('[data-seal-battle-mode]').click();await page.waitForSelector('.seal-clear-panel');
  assert.match(await page.locator('.seal-clear-reward').innerText(),/마스터의 별\s+200,000개/);
  await page.locator('.seal-clear-panel').screenshot({path:path.join(out,label+'-reward.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Player overflow '+label);
  await page.locator('#sealClearClaim').click();await page.waitForFunction(()=>document.querySelector('#sealClearClaim')?.textContent==='보상 수령 완료');
  assert(dialogs.some(t=>t.includes('마스터의 별 200,000개')));
  assert.equal(Number((await fixture.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).quantity),200000);
  results.push(label+': CMS save/read/current snapshot, player grant/confirmation/layout PASS');await context.close();await fixture.close();fixture=null;
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(fixture)await fixture.close();}
