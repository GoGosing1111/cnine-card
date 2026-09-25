// Local Chrome + real account/fusion handlers against isolated PostgreSQL.
// No credentials, mutations or test inventory are sent to production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {handleMercenaryCodex} from '../functions/_mercenary_codex.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,'../qa-mercenary-fusion-live');fs.mkdirSync(out,{recursive:true});
const f=await mercenaryFixture(null,{postgres:true});
for(const c of f.document.mercenaries.filter(c=>Number(c.code.slice(2))<44))c.rank=['V-004','V-009'].includes(c.code)?'SS':['V-021','V-046','V-049'].includes(c.code)?'SSS':'S';
await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
f.draw.cardRules.cardWeights={'V-021':8991,'V-046':100,'V-049':10};await f.setDraw(f.draw);
for(const code of ['V-004','V-009'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,101,100,?,?)',code,'2026-09-25','2026-09-25').run();
await f.p("INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(7,'V-004',17,'2026-09-25')").run();await f.p('UPDATE users SET coin=0 WHERE id=7').run();
const deps={...f.deps,authenticate:async request=>{const u=await f.deps.authenticate(request);return u?{...u,role:'USER'}:null;}};
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root)return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
const user={id:7,serverUserId:7,nickname:'합성 검수 계정',role:'USER',coin:0,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
async function session(width=390,{reduced=false}={}){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(user=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));},user);
  const page=await context.newPage(),errors=[],posts=[],reads=[],responses=[];let lost=false,failState=false,failFeature=false;
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/api/**',async route=>{
    const r=route.request(),endpoint=new URL(r.url()).pathname.slice(5),body=r.postData();
    if(r.method()==='GET')reads.push(endpoint);else{assert.equal(endpoint,'mercenaries/v3/fusion','only requested synthesis may mutate');posts.push(JSON.parse(body));}
    if(endpoint==='mercenaries/v3/state'&&failState)return route.fulfill({status:503,json:{error:'보유 조회 일시 지연'}});
    if(endpoint==='mercenaries/v3/fusion/feature'&&failFeature)return route.fulfill({status:200,json:{}});
    const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(body?{body}:{})});
    let response=await handleMercenaryCodex({path:endpoint,request,env:f.env,deps})||await handleMercenaryAccount({path:endpoint,request,env:f.env,deps});
    if(response){const value=await response.json();if(body)responses.push(value);if(body&&lost){lost=false;return route.fulfill({status:200,body:''});}return route.fulfill({status:response.status,json:value});}
    const data={'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]}}[endpoint]||{ok:true,visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    return route.fulfill({json:data});
  });
  return {page,context,errors,posts,reads,responses,drop:()=>lost=true,stateFault:value=>failState=value,featureFault:value=>failFeature=value};
}
async function enter(s){await s.page.goto(origin+'/mercenary-codex/',{waitUntil:'domcontentloaded'});await s.page.locator('#accountStatusTitle').filter({hasText:/^내 용병 \d+명$/}).waitFor();await s.page.locator('#openFusion').click();await s.page.waitForFunction(()=>document.querySelector('[data-live-status]')?.textContent==='합성 ON');await s.page.locator('.fusion-loading').waitFor({state:'hidden'});}
async function select(s){await s.page.locator('[data-material-rank]').selectOption('SS');await s.page.locator('[data-action="auto"]').click();await s.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);assert.equal(await s.page.locator('.fusion-slot.is-filled').count(),8);}
async function result(s){await s.page.locator('.fusion-result.is-visible').waitFor();await s.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);assert.match(await s.page.locator('.fusion-result small').innerText(),/지급 완료/);}
const count=async()=>Number((await f.p('SELECT COUNT(*) AS n FROM mercenary_card_acquisitions_v1 WHERE user_id=7').first()).n);
try{
  for(const width of [1440,390]){
    const s=await session(width),t=Date.now();await enter(s);const readyMs=Date.now()-t;
    const requests=s.reads.length;await select(s);assert.equal(s.reads.length,requests,'material selection causes no API traffic');
    await s.page.screenshot({path:path.join(out,'ready-'+width+'.png')});const before=await count(),start=Date.now();
    await s.page.locator('[data-action="play"]').click();await result(s);assert.equal(s.posts.length,1);assert.equal(await count(),before+1);
    const value=s.responses[0];assert.equal(value.status,'COMPLETED');assert.equal(value.consumed.reduce((n,c)=>n+c.quantity,0),8);
    for(const c of value.consumed){const after=await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',c.code).first();assert.equal(Number(after.total_copies),c.totalBefore-c.quantity+(value.result.mercenaryCode===c.code?1:0));}
    assert.equal(await f.coin(),0);assert.equal(Number((await f.p('SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=7').first()).revision),17);
    await s.page.screenshot({path:path.join(out,'result-'+width+'.png')});assert.ok(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await s.page.locator('[data-action="replay"]').click();await s.page.locator('.fusion-result.is-visible').waitFor();assert.equal(s.posts.length,1,'animation replay cannot POST');
    await s.page.locator('[data-action="close"]').click();assert.equal(await s.page.evaluate(()=>localStorage.getItem('cnine.mercenary.fusion.pending:7')),null);
    assert.equal(await s.page.locator('.archive-heading-actions a').count(),0,'equipment shortcut removed');assert.equal(await s.page.locator('.fusion-entry-tag').count(),0);
    const menu=s.page.locator('soop-adventure-lobby');await menu.waitFor();
    assert.equal(await menu.locator('.sidebar [data-category="equipment"] b').innerText(),'장비 - 제작');
    if(width>980)await menu.locator('.sidebar [data-category="equipment"]').click();else{await menu.locator('.mobile-dock [data-category="all"]').click();await menu.locator('.category-jump[data-category="equipment"]').click();}
    assert.equal(await menu.locator('#directory-title').innerText(),'장비 - 제작');await s.page.screenshot({path:path.join(out,'equipment-menu-'+width+'.png')});await s.page.keyboard.press('Escape');
    const resources=await s.page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/mercenaries.*-art-(320|640)\.webp/.test(r.name)).map(r=>({name:new URL(r.name).pathname,size:r.transferSize})));
    report.push({width,readyMs,completedMs:Date.now()-start,posts:s.posts.length,result:value.result.mercenaryCode,resources,pageErrors:s.errors});assert.deepEqual(s.errors,[]);await s.context.close();console.log('Actual player flow passed: '+width);
  }
  {
    const s=await session(390,{reduced:true});await enter(s);await select(s);s.drop();const before=await count();
    await s.page.locator('[data-action="play"]').click();await s.page.locator('[data-action="recover"]').waitFor();await s.page.waitForFunction(()=>!document.querySelector('[data-action="recover"]').disabled);
    assert.equal(await count(),before+1);const id=s.posts[0].requestId;await s.page.screenshot({path:path.join(out,'recovery-390.png')});
    await s.page.locator('[data-action="close"]').click();await s.page.locator('#openFusion').click();await result(s);
    assert.equal(s.posts.length,1);assert.equal(s.responses[0].requestId,id);assert.equal(await count(),before+1);
    assert.ok(s.reads.includes('mercenaries/v3/fusion/receipt'));assert.deepEqual(s.errors,[]);report.push({fault:'lost completed response',reopenGetOnly:true,posts:1});await s.context.close();
  }
  {
    const s=await session(390,{reduced:true});await enter(s);await select(s);const before=await count();f.fail('INSERT INTO mercenary_card_acquisitions_v1');
    await s.page.locator('[data-action="play"]').click();await s.page.waitForFunction(()=>!document.querySelector('[data-action="recover"]').hidden&&!document.querySelector('[data-action="recover"]').disabled);assert.equal(await count(),before);
    f.fail('');await s.page.locator('[data-action="recover"]').click();await result(s);assert.equal(s.posts.length,2);assert.equal(s.posts[0].requestId,s.posts[1].requestId);assert.equal(await count(),before+1);
    report.push({fault:'grant failure rollback',sameIdRetry:true,posts:2});assert.deepEqual(s.errors,[]);await s.context.close();
  }
  {
    const s=await session(390,{reduced:true});await enter(s);await select(s);s.stateFault(true);
    await s.page.locator('[data-action="play"]').click();await s.page.locator('.fusion-result.is-visible').waitFor();await s.page.locator('[data-action="refresh-owned"]').waitFor();assert.equal(await s.page.locator('[data-action="play"]').isDisabled(),true);
    s.stateFault(false);await s.page.locator('[data-action="refresh-owned"]').click();await result(s);assert.equal(s.posts.length,1);
    await s.page.locator('[data-action="play"]').click();await s.page.locator('[data-action="demo"]').click();await s.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);await s.page.locator('[data-action="play"]').click();await s.page.locator('.fusion-result.is-visible').waitFor();assert.equal(s.posts.length,1);assert.match(await s.page.locator('.fusion-result small').innerText(),/실제 지급 없음/);
    report.push({fault:'owned refresh failed after completion',recoverWithoutSpend:true,explicitDemoNoPost:true});assert.deepEqual(s.errors,[]);await s.context.close();
  }
  {
    const s=await session(390,{reduced:true});s.featureFault(true);await s.page.goto(origin+'/mercenary-codex/');await s.page.locator('#accountStatusTitle').filter({hasText:/^내 용병 \d+명$/}).waitFor();await s.page.locator('#openFusion').click();await s.page.locator('.fusion-loading').waitFor({state:'hidden'});
    await s.page.locator('[data-action="refresh-owned"]').waitFor();assert.equal(await s.page.locator('[data-action="play"]').isDisabled(),true);s.featureFault(false);await s.page.locator('[data-action="refresh-owned"]').click();await s.page.waitForFunction(()=>document.querySelector('[data-live-status]').textContent==='합성 ON');await select(s);assert.equal(s.posts.length,0);
    await s.page.evaluate(()=>{localStorage.setItem('cnine_card_api_token','local-account-8');window.dispatchEvent(new Event('focus'));});await s.page.locator('.fusion-dialog').waitFor({state:'detached'});assert.equal(s.posts.length,0);
    report.push({fault:'invalid feature response',retryEnabled:true,accountSwitchCloses:true});assert.deepEqual(s.errors,[]);await s.context.close();
  }
  // Main lobby uses the same generated navigation; check only the renamed category.
  for(const width of [1440,390]){
    const s=await session(width);await s.page.goto(origin+'/',{waitUntil:'domcontentloaded'});const menu=s.page.locator('soop-adventure-lobby');await menu.locator('.stage-character').waitFor();
    assert.equal(await menu.locator('.sidebar [data-category="equipment"] b').innerText(),'장비 - 제작');
    if(width>980)await menu.locator('.sidebar [data-category="equipment"]').click();else{await menu.locator('.mobile-dock [data-category="all"]').click();await menu.locator('.category-jump[data-category="equipment"]').click();}
    assert.equal(await menu.locator('#directory-title').innerText(),'장비 - 제작');await s.page.screenshot({path:path.join(out,'main-menu-'+width+'.png')});assert.equal(s.posts.length,0);report.push({mainMenu:width,renamed:true,pageErrors:s.errors});await s.context.close();
  }
}catch(e){await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(async(p,i)=>{await p.screenshot({path:path.join(out,'failure-'+i+'.png')});console.error((await p.locator('.fusion-error').allTextContents()).join(' | '));}));throw e;}
finally{await browser.close();server.close();await f.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.map(({resources,...r})=>r),null,2));
