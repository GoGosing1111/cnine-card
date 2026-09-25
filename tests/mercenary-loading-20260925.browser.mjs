// Local Chromium + isolated PostgreSQL. No authenticated production traffic or gameplay writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,'../qa-mercenary-loading');fs.mkdirSync(out,{recursive:true});
const catalog=await (await fetch('https://cnine-card.pages.dev/api/mercenary-codex')).json();
const sample=catalog.cards.filter(c=>!c.artOnly&&['S','SS','SSS'].includes(c.rank));
const account={accountId:4242,available:true,coin:'0',loadout:{mercenaryCode:sample[0].code,revision:1},cards:sample.map(c=>({...c,level:1,duplicates:8,totalCopies:9,canDeploy:true}))};
const pg=new PGlite();await pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)');
const sql=[];const env={DB:new __postgresCompatTest.PostgresD1Database({async query(input){const text=typeof input==='string'?input:input.text;sql.push(text);const r=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}})};
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const adminHtml=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/mercenary-admin-v1.js"></script></body>');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
 if(pathname==='/admin/index.html'){res.setHeader('content-type','text/html');return res.end(adminHtml);}
 let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
const faultsOnly=process.argv.includes('--faults-only');
async function fixture(width=1440,height=1000,{fast=false}={}){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
 if(fast)await context.addInitScript(()=>{const set=window.setTimeout;window.setTimeout=(fn,ms,...args)=>set(fn,[8000,12000,20000].includes(ms)?4000:ms,...args);});
 const page=await context.newPage(),errors=[],posts=[];let dropNext=false,hangRead=false;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),pathname=url.pathname.slice(5);
   const json=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
   if(pathname==='mercenary-codex')return json(catalog);
   if(pathname==='mercenaries/v3/state')return json(account);
   if(pathname==='admin/mercenaries/opening')return json({mode:'OFF',ready:false,revision:1,rankCounts:{},blockers:[]});
   if(pathname.startsWith('admin/mercenaries')){
     if(hangRead&&req.method()==='GET')return;
     const body=req.postData();if(body)posts.push(JSON.parse(body));
     const result=await handleMercenaryCms({path:pathname,env,request:new Request(req.url(),{method:req.method(),...(body?{body}: {})}),deps:{requirePermission:async()=>({id:1,role:'OWNER'}),json:(body,status=200)=>({body,status})}});
     if(body&&dropNext){dropNext=false;return route.fulfill({status:200,body:''});}
     return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
   }
   assert.equal(req.method(),'GET','No gameplay mutations are permitted');return json({ok:true,enabled:false,visible:false,items:[]});
 });
 return {context,page,errors,posts,drop:()=>{dropNext=true;},hang:value=>{hangRead=value;}};
}
async function enterCms(page){await page.goto(origin+'/admin/index.html#mercenaries');await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});}
try{
 for(const [width,height] of faultsOnly?[]:[[1440,1000],[390,844]]){
   const f=await fixture(width,height),{page}=f;const art=[];
   page.on('request',r=>{if(/mercenaries\/.*\.(png|webp)/.test(r.url()))art.push(r.url());});
   await page.goto(origin+'/mercenary-codex/?fusion=preview');await page.locator('.fusion-loading').waitFor({state:'hidden'});
   await page.locator('[data-action="auto"]').click();
   try{await page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);}catch(e){console.error(JSON.stringify({errors:f.errors,error:await page.locator('.fusion-error').textContent(),selected:await page.locator('[data-selected-count]').textContent(),canvases:await page.locator('canvas').count()}));throw e;}
   assert.equal(await page.locator('.fusion-slot.is-filled').count(),8);
   await page.screenshot({path:path.join(out,`fusion-ready-${width}.png`)});
   await page.locator('[data-action="play"]').click();await page.locator('.fusion-result.is-visible').waitFor();
   await page.screenshot({path:path.join(out,`fusion-result-${width}.png`)});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('[data-action="close"]').click();assert.equal(await page.locator('.fusion-dialog canvas').count(),0);
   await page.locator('#openFusion').click();await page.locator('.fusion-loading').waitFor({state:'hidden'});await page.locator('[data-action="close"]').click();
   assert.ok(art.some(url=>url.includes('-art-640.webp')));
   assert.equal(art.filter(url=>sample.filter(c=>c.rank==='SSS').some(c=>url===origin+'/'+c.sourceArt)).length,0,'result reveal must not download a full-resolution SSS source');
   await enterCms(page);await page.locator('[data-field$=".name"]').first().waitFor();
   const before=sql.length;await page.locator('[data-reload]').click();await page.waitForFunction(()=>!document.querySelector('[data-reload]').disabled);
   const queries=sql.slice(before);assert.equal(queries.length,2);assert.ok(queries.every(q=>/^SELECT/.test(q)));
   await page.locator('[data-field$=".name"]').first().fill('로딩 검수 '+width);f.drop();await page.locator('[data-save]').click();
   await page.locator('.mc-notice.is-error').waitFor();assert.match(await page.locator('[data-save]').innerText(),/재확인/);
   await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.mc-notice').textContent.startsWith('저장 완료'));
   assert.equal(f.posts.at(-1).requestId,f.posts.at(-2).requestId);
   await page.screenshot({path:path.join(out,`cms-${width}.png`)});
   await page.locator('[data-tab="draw"]').click();await page.locator('[data-draw-notes]').waitFor();
   const drawBefore=sql.length;await page.locator('[data-draw-reload]').click();await page.waitForFunction(()=>!document.querySelector('[data-draw-reload]').disabled);
   assert.equal(sql.length-drawBefore,3);
   await page.locator('[data-draw-notes]').fill('조회 저장 검수 '+width);f.drop();await page.locator('[data-draw-save]').click();
   await page.waitForFunction(()=>document.querySelector('[data-draw-save]').textContent.includes('재확인'));
   await page.locator('[data-draw-save]').click();await page.waitForFunction(()=>document.querySelector('[data-draw-message]').textContent.includes('저장 완료'));
   assert.equal(f.posts.at(-1).requestId,f.posts.at(-2).requestId);
   await page.screenshot({path:path.join(out,`cms-draw-${width}.png`)});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(f.errors,[]);
   report.push({width,height,selection:8,playback:true,reopen:true,cmsQueries:queries.length,drawQueries:3,sameRequestRecovery:true,pageErrors:f.errors});console.log('PC/mobile flow passed: '+width);await f.context.close();
 }
 for(const resource of ['ui-fx-vendor-v2045.bundle.js','sanctum-v1.png']){
   const f=await fixture(390,844,{fast:true});let hanging=true;
   await f.page.route('**/'+resource+'*',route=>{if(!hanging)return route.continue();});
   await f.page.goto(origin+'/mercenary-codex/?fusion=preview',{waitUntil:'domcontentloaded'});await f.page.locator('.fusion-dialog').waitFor();
   await f.page.locator('[data-action="close"]').click();await f.page.locator('#openFusion').click();await f.page.locator('.fusion-dialog').waitFor();
   await f.page.locator('[data-action="retry"]').waitFor();assert.equal(await f.page.locator('.fusion-loading').isVisible(),false);
   hanging=false;await f.page.locator('[data-action="retry"]').click();await f.page.locator('.fusion-loading').waitFor({state:'hidden'});
   await f.page.locator('[data-action="auto"]').click();
   try{await f.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);}catch(e){console.error(JSON.stringify({resource,errors:f.errors,error:await f.page.locator('.fusion-error').textContent(),canvases:await f.page.locator('canvas').count()}));throw e;}
   assert.equal(await f.page.locator('[data-action="retry"]').isVisible(),false);assert.equal(await f.page.locator('.fusion-dialog canvas').count(),1);assert.deepEqual(f.errors,[]);
   report.push({fault:resource,closedAndReopened:true,timeoutRecovered:true});console.log('Fault recovery passed: '+resource);await f.context.close();
 }
 {
   const f=await fixture(390,844,{fast:true});let hanging=true;
   await f.page.route('**/fusion/app.mjs*',route=>{if(!hanging)return route.continue();});
   await f.page.goto(origin+'/mercenary-codex/?fusion=preview',{waitUntil:'domcontentloaded'});
   await f.page.locator('#toast').filter({hasText:'지연'}).waitFor();hanging=false;
   await f.page.locator('#openFusion').click();await f.page.locator('.fusion-dialog').waitFor();await f.page.locator('.fusion-loading').waitFor({state:'hidden'});
   assert.equal(await f.page.locator('.fusion-dialog canvas').count(),1);assert.deepEqual(f.errors,[]);
   report.push({fault:'fusion module import hangs',timeoutRecovered:true});await f.context.close();
 }
 const f=await fixture(390,844,{fast:true});f.hang(true);await enterCms(f.page);
 await f.page.locator('.mc-notice.is-error').waitFor();assert.equal(await f.page.locator('[data-reload]').isEnabled(),true);
 f.hang(false);await f.page.locator('[data-reload]').click();await f.page.locator('[data-field$=".name"]').first().waitFor();assert.deepEqual(f.errors,[]);
 report.push({fault:'CMS GET hangs',timeoutRecovered:true});await f.context.close();
}finally{await browser.close();server.close();await pg.close();}
fs.writeFileSync(path.join(out,faultsOnly?'fault-report.json':'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
