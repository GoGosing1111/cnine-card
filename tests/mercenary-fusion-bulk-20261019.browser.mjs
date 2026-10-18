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
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,'../qa-mercenary-fusion-bulk-20261019'+(process.env.FUSION_QA_ORIGIN?'-live':''));fs.mkdirSync(out,{recursive:true});
const f=await mercenaryFixture(null,{postgres:true});
for(const c of f.document.mercenaries.filter(c=>Number(c.code.slice(2))<44))c.rank=['V-004','V-009'].includes(c.code)?'SS':['V-021','V-046','V-049'].includes(c.code)?'SSS':'S';
await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
f.draw.cardRules.cardWeights={'V-021':8991,'V-046':100,'V-049':10};await f.setDraw(f.draw);
for(const code of ['V-004','V-009'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,801,800,?,?)',code,'2026-09-25','2026-09-25').run();
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
  const context=await browser.newContext({viewport:{width,height:width===390?844:768},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(user=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));},user);
  const page=await context.newPage(),errors=[],posts=[],reads=[],responses=[];let lost=false,failState=false,failFeature=false;
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/api/**',async route=>{
    const r=route.request(),endpoint=new URL(r.url()).pathname.slice(5),body=r.postData();
    if(endpoint==='sync/ticket')return route.fulfill({status:503,json:{error:'Isolated QA: account socket disabled'}});
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
async function enter(s){await s.page.goto((process.env.FUSION_QA_ORIGIN||origin)+'/mercenary-codex/',{waitUntil:'domcontentloaded'});await s.page.locator('#accountStatusTitle').filter({hasText:/^내 용병 \d+명$/}).waitFor();await s.page.locator('#openFusion').click();await s.page.waitForFunction(()=>document.querySelector('[data-live-status]')?.textContent==='합성 ON');await s.page.locator('.fusion-loading').waitFor({state:'hidden'});}
const count=async()=>Number((await f.p('SELECT COUNT(*) AS n FROM mercenary_card_acquisitions_v1 WHERE user_id=7').first()).n);
try{
  for(const [width,attempts] of [[1440,100],[900,2],[390,10]]){
    const s=await session(width,{reduced:width===900});await enter(s);
    await s.page.locator('[data-material-rank]').selectOption('SS');
    if(attempts===100)await s.page.locator('[data-batch="max"]').click();
    else if(attempts===10)await s.page.locator('[data-batch="10"]').click();
    else{await s.page.locator('[data-attempts]').fill(String(attempts));await s.page.locator('[data-attempts]').press('Tab');}
    await s.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);
    assert.equal(await s.page.locator('[data-attempts]').inputValue(),String(attempts));
    assert.equal(await s.page.locator('[data-selected-count]').innerText(),String(attempts*8));
    await s.page.screenshot({path:path.join(out,'ready-'+width+'.png')});
    const quantities=await s.page.locator('.fusion-quantity').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)}));
    assert.ok(quantities.scroll<=quantities.width+1,JSON.stringify(quantities));assert.ok(quantities.buttons.every(h=>h>=44));
    const before=await count(),start=Date.now();await s.page.locator('[data-action="play"]').click();
    if(width!==900){await s.page.locator('[data-action="skip"]').waitFor({state:'visible'});await s.page.locator('[data-action="skip"]').click();}
    await s.page.locator('.fusion-batch-results').waitFor({state:'visible'});
    await s.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);
    await s.page.waitForFunction(()=>getComputedStyle(document.querySelector('.fusion-result')).opacity==='1');
    assert.equal(s.posts.length,1);assert.equal(s.responses[0].attempts,attempts);assert.equal(await count(),before+attempts);
    assert.equal(await s.page.locator('.fusion-batch-results header b').innerText(),attempts+'회 합성 완료');
    assert.equal(await s.page.locator('.fusion-batch-cards .fusion-material-count').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.textContent.slice(1)),0)),attempts);
    const value=s.responses[0];
    for(const c of value.consumed){const after=await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',c.code).first();assert.equal(Number(after.total_copies),c.totalBefore-c.quantity+value.results.filter(r=>r.mercenaryCode===c.code).length);}
    await s.page.locator('.fusion-batch-results').scrollIntoViewIfNeeded();await s.page.screenshot({path:path.join(out,'result-'+width+'.png')});
    assert.ok(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await s.page.locator('.fusion-batch-results').evaluate(e=>{const b=e.getBoundingClientRect(),footer=document.querySelector('.fusion-controls').getBoundingClientRect();return b.top>=0&&b.bottom<=footer.top+1;}),'results reachable above footer');
    if(width===1440){await s.page.locator('[data-action="replay"]').click();await s.page.locator('[data-action="skip"]').click();assert.equal(s.posts.length,1,'replaying and skipping cannot spend');}
    await s.page.locator('[data-action="play"]').click();assert.equal(await s.page.locator('[data-selected-count]').innerText(),'0');assert.equal(await s.page.locator('.fusion-batch-results').isVisible(),false);
    assert.equal(await s.page.evaluate(()=>localStorage.getItem('cnine.mercenary.fusion.pending:7')),null);
    assert.equal(await f.coin(),0);assert.equal(Number((await f.p('SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=7').first()).revision),17);
    assert.deepEqual(s.errors,[]);report.push({width,attempts,posts:s.posts.length,completedMs:Date.now()-start,pageErrors:s.errors});
    await s.context.close();console.log('Bulk actual handler passed: '+width+' / '+attempts);
  }
  {
    const s=await session(390,{reduced:true});await enter(s);await s.page.locator('[data-batch="10"]').click();await s.page.waitForFunction(()=>!document.querySelector('[data-action="play"]').disabled);
    s.drop();const before=await count();await s.page.locator('[data-action="play"]').click();await s.page.locator('.fusion-error').waitFor({state:'visible'});
    assert.equal(await count(),before+10);await s.page.locator('[data-action="close"]').click();
    await s.page.locator('#openFusion').click();await s.page.locator('.fusion-batch-results').waitFor({state:'visible'});
    assert.equal(s.posts.length,1,'reopen recovery reads the one committed batch');assert.equal(await count(),before+10);
    assert.equal(await s.page.locator('.fusion-batch-results header b').innerText(),'10회 합성 완료');assert.deepEqual(s.errors,[]);
    report.push({scenario:'lost response / reopen',posts:s.posts.length,recovered:10});await s.context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({source:process.env.FUSION_QA_ORIGIN||'local',report},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));await f.close();}
