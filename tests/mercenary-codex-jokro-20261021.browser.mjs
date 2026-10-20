import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=process.cwd(),out=process.env.QA_OUT;
assert(out,'Set QA_OUT outside the checkout');fs.mkdirSync(out,{recursive:true});
const cleanups=[],f=await mercenaryFixture({after:fn=>cleanups.push(fn)},{postgres:true});
await ensureMercenaryLevelSchema(f.env);
await f.p("INSERT INTO users(id,nickname) VALUES(1,'isolated codex QA')").run();
for(const code of ['V-001','V-979'])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(1,?,1,0,?,?)',code,'isolated','isolated').run();
const account=await mercenaryAccountState(f.env,{id:1,role:'OWNER'});
const localCatalog=mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:61,updated_at:'2026-10-21T00:00:00Z'});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))return res.writeHead(404).end();
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
if(!process.env.QA_ORIGIN)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:'+server.address().port;
const expected=process.env.QA_ORIGIN?validateCatalog(await fetch(origin+'/api/mercenary-codex').then(r=>r.json())):validateCatalog(localCatalog);
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   const req=route.request(),pathname=new URL(req.url()).pathname;
   if(req.method()!=='GET'){writes.push(pathname);return route.fulfill({status:403,json:{error:'Read-only QA'}});}
   if(pathname==='/api/mercenary-codex')return process.env.QA_ORIGIN?route.continue():route.fulfill({json:localCatalog});
   if(pathname==='/api/mercenaries/v3/state')return route.fulfill({json:account});
   return route.fulfill({json:{visible:false,enabled:false,items:[]}});
  });
  await page.goto(origin+'/mercenary-codex/',{waitUntil:'domcontentloaded'});
  await page.locator('.roster-row').first().waitFor();
  assert.equal(await page.locator('#ownedCount').textContent(),'2');
  assert.equal(await page.locator('.roster-row').count(),2);
  assert.equal(await page.locator('#totalCount').textContent(),String(expected.cards.length));
  await page.locator('[data-code="V-979"]').click();
  assert.match(await page.locator('#inspection').textContent(),/청룡단천/);
  assert.match(await page.locator('#inspection').textContent(),/할로윈 리미티드 용병팩 3장/);
  assert.equal(await page.locator('[data-equip="V-979"]').isEnabled(),true);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-code="V-979"] img,#portraitDisplay .source-art')].every(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:path.join(out,'owned-'+width+'.png')});
  await page.locator('#allView').click();
  assert.equal(await page.locator('.roster-row').count(),expected.cards.length);
  await page.locator('#limitedView').click();
  assert.equal(await page.locator('.roster-row').count(),expected.cards.filter(c=>c.edition==='LIMITED'&&!c.excludedFromLimitedCount).length);
  await page.locator('#search').fill('족로');
  assert.equal(await page.locator('.roster-row').count(),1);
  await page.locator('[data-code="V-979"]').click();
  await page.locator('#sdTab').click();
  await page.waitForFunction(()=>{const img=document.querySelector('#portraitDisplay img');return img?.complete&&img.naturalWidth>0;});
  await page.locator('#artTab').click();
  await page.locator('#portraitDisplay').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'limited-'+width+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  reports.push({width,catalogCards:expected.cards.length,ownedCards:2,tabs:['owned','all','limited'],jokroSkill:true,approvedArtAndSdLoaded:true,horizontalOverflow:false,errors,writes});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({origin,catalogSource:process.env.QA_ORIGIN?'production public GET':'local server projection',accountSource:'isolated PGlite owner holding; no production login',reports},null,2));
 console.log(JSON.stringify({out,reports}));
}finally{
 await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));for(const fn of cleanups)await fn();
}
