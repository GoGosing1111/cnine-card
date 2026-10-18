import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
import {martialFixture,martialOwner} from './helpers/martial-law-fixture.mjs';
import {readMartialLaw} from '../functions/_martial_law.js';
import {publicMartialLaw} from '../shared/martial-law-v1.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.MARTIAL_QA_DIR;if(!out)throw Error('Set MARTIAL_QA_DIR');mkdirSync(out,{recursive:true});
const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_PATH||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const f=await martialFixture(),requests=[],results=[];
const adminStyles=[...readFileSync(path.join(root,'admin/index.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>'<style>'+m[1]+'</style>').join('');
const pageHtml=admin=>'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+(admin?adminStyles:'')+'<style>body{margin:0;background:#101419;color:#f4ede5;font-family:"Malgun Gothic",sans-serif}main{max-width:1100px;margin:24px auto;padding:0 18px}.top-hud{display:block}.page{max-width:1100px;margin:auto}button,select{font-family:inherit}*{box-sizing:border-box}</style><link rel="stylesheet" href="/css/martial-law-v1.css"><script defer src="/js/martial-law-v1.js"></script>'+(admin?'<script defer src="/admin/martial-law-admin.js"></script>':'')+'<main>'+(admin?'<div class="burningCmsGrid"></div>':'<div class="page"><div class="top-hud"><h1>리버스콜</h1></div></div>')+'</main><script>window.refreshBurningEventState=async()=>{const d=await(await fetch("/api/burning-event/status")).json();CNineMartialLaw.apply(d.settings,{now:Date.parse(d.serverNow)});CNineMartialLaw.mount({visible:true})};</script></html>';
const mime={'.html':'text/html; charset=utf-8','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://qa').pathname;
 if(pathname==='/api/admin/martial-law'){
  requests.push({method:req.method});let body='';for await(const chunk of req)body+=chunk;
  const identity=req.headers.authorization==='Bearer qa-owner'?martialOwner:req.headers.authorization?{...martialOwner,nickname:'다른 OWNER'}:null;
  const result=await f.request(identity,req.method,body?JSON.parse(body):undefined);res.writeHead(result.status,{'content-type':'application/json'});res.end(JSON.stringify(result.body));return;
 }
 if(pathname==='/api/burning-event/status'){res.setHeader('content-type','application/json');res.end(JSON.stringify({settings:publicMartialLaw(await readMartialLaw(f.env,{fresh:true,now:f.now}),f.now),serverNow:new Date(f.now).toISOString()}));return}
 if(pathname==='/admin/qa'||pathname==='/qa'){res.setHeader('content-type','text/html; charset=utf-8');res.end(pageHtml(pathname.includes('admin')));return}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('outside');
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));
}catch(error){res.statusCode=404;res.end(String(error))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await playwright.chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const viewport of [{width:1440,height:1050},{width:390,height:844}]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))failed.push([r.status(),r.url()])});
  page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{localStorage.setItem('cnine_admin_token','qa-owner');window.__SOOP_CMS_IDENTITY__={id:1,role:'OWNER',nickname:'핑크빛유두'}});
  await page.goto(origin+'/admin/qa');await page.locator('#martialDeclare:not([disabled])').waitFor();
  assert.match(await page.locator('#martialCmsState').innerText(),/OFF/);
  await page.screenshot({path:path.join(out,'admin-off-'+viewport.width+'.png'),fullPage:true});
  const count=requests.filter(r=>r.method==='PATCH').length;
  await page.locator('#martialDuration').selectOption('120');await page.locator('#martialPreview').click();
  await page.locator('#martialLawNotice').waitFor();assert.match(await page.locator('[data-martial-remaining]').innerText(),/120분/);
  await page.screenshot({path:path.join(out,'preview-'+viewport.width+'.png'),fullPage:true});
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-martial-close')),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#martialLawNotice').count(),0);
  assert.equal(requests.filter(r=>r.method==='PATCH').length,count);
  await page.locator('#martialDuration').selectOption('30');await page.locator('#martialDeclare').click();await page.waitForFunction(()=>!document.querySelector('#martialRevoke').disabled);
  assert.match(await page.locator('#martialCmsState').innerText(),/선포 중/);
  assert.equal((await f.request()).body.settings.durationMinutes,30);
  await page.screenshot({path:path.join(out,'admin-active-'+viewport.width+'.png'),fullPage:true});
  await page.reload();await page.locator('#martialRevoke:not([disabled])').waitFor();
  const game=await page.context().newPage();await game.goto(origin+'/qa');await game.evaluate(()=>refreshBurningEventState());
  await game.locator('#martialLawNotice').waitFor();
  await game.screenshot({path:path.join(out,'announcement-'+viewport.width+'.png'),fullPage:true});
  await game.keyboard.press('Escape');await game.locator('#martialLawHud').click();await game.locator('#martialLawNotice').waitFor();await game.locator('[data-martial-close]').click();
  await game.screenshot({path:path.join(out,'hud-'+viewport.width+'.png'),fullPage:true});
  await game.evaluate(()=>{document.querySelector('.top-hud').innerHTML='<h1>리버스콜</h1>';CNineMartialLaw.mount({visible:true})});assert.equal(await game.locator('#martialLawHud').count(),1);
  await game.evaluate(()=>CNineMartialLaw.mount({visible:false}));assert.equal(await game.locator('#martialLawHud').count(),0);
  await page.locator('#martialRevoke').click();await page.locator('#martialDeclare:not([disabled])').waitFor();
  await game.evaluate(()=>refreshBurningEventState());assert.equal(await game.locator('#martialLawHud').count(),0);
  const old=(await f.request()).body.settings;
  await game.evaluate(old=>{CNineMartialLaw.apply({...old,revision:old.revision+1,generation:old.generation+1,enabled:true,endsAt:new Date(Date.now()+400).toISOString()},{now:Date.now()});CNineMartialLaw.mount({visible:true})},old);
  await game.waitForFunction(()=>!document.querySelector('#martialLawHud'));
  await page.evaluate(()=>{localStorage.setItem('cnine_admin_token','qa-other');dispatchEvent(new CustomEvent('soop:cms-identity',{detail:{role:'OWNER',nickname:'다른 OWNER'}}))});
  assert.equal(await page.locator('#martialDeclare').isDisabled(),true);
  await page.screenshot({path:path.join(out,'admin-locked-'+viewport.width+'.png'),fullPage:true});
  for(const p of [page,game])assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  results.push({viewport,previewNoMutation:true,declareAndRevoke:true,expiry:true,repeatMount:true,keyboard:true,overflow:false,errors,failed});
  await page.context().close();
 }
 const fixture=JSON.parse(readFileSync(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json')));
 const cards=fixture.battleV2.teams.A.cards.map(c=>({id:c.cardId,title:c.title,rarity:c.grade,image:c.image,image_url:c.image,power:90000,baseBattlePower:90000,powerType:c.type}));
 const user={id:4242,serverUserId:4242,nickname:'계엄령 검수',role:'USER',coin:100000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-martial-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1')},user);
  const status=(await f.request()).body.settings;let law={...status,enabled:true,revision:status.revision+10,generation:status.generation+10,activatedAt:new Date().toISOString(),endsAt:new Date(Date.now()+1800000).toISOString()};
  await page.route('**/api/**',route=>{
   const key=new URL(route.request().url()).pathname.slice(5);
   const data={'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{burningEvent:{enabled:false,mode:'NONE',martialLaw:law},serverNow:new Date().toISOString()},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   return route.fulfill({status:200,json:data});
  });
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('buy'));
  await page.locator('#martialLawNotice').waitFor();await page.keyboard.press('Escape');await page.locator('#martialLawHud').waitFor();
  await page.screenshot({path:path.join(out,'app-hud-'+viewport.width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>renderShell('buy'));await page.locator('#martialLawHud').waitFor();
  law={...law,revision:law.revision+1,enabled:false};await page.evaluate(()=>refreshBurningEventState({forceFresh:true}));assert.equal(await page.locator('#martialLawHud').count(),0);
  assert.deepEqual(errors,[]);results.push({actualApp:true,viewport,defaultBurningOffMartialHud:true,reRender:true,revoked:true,errors});
  await context.close();
 }
}catch(error){
 for(const context of browser.contexts())for(const page of context.pages()){console.log((await page.locator('body').innerText()).slice(0,350));console.log(await page.evaluate(()=>{let n=document.querySelector('#martialLawHud'),a=[];while(n){a.push({tag:n.tagName,id:n.id,cls:n.className,display:getComputedStyle(n).display,rect:n.getBoundingClientRect().toJSON()});n=n.parentElement}return a}));await page.screenshot({path:path.join(out,'failure-'+Date.now()+'.png'),fullPage:true})}throw error;
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();
 writeFileSync(path.join(out,'results.json'),JSON.stringify({results,requests},null,2));console.log(JSON.stringify({out,results}));
}

