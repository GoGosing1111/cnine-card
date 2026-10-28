import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=process.cwd(),out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
const cleanups=[],f=await mercenaryFixture({after:fn=>cleanups.push(fn)},{postgres:true});
await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
await f.p("INSERT INTO users(id,nickname,role) VALUES(3,'ε연두з','USER')").run();
await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(3,'V-979',1,0,'existing-grant','existing-grant')").run();
const account=await mercenaryAccountState(f.env,{id:3,role:'USER'});assert.equal(account.cards.length,1);assert.equal(account.cards[0].code,'V-979');
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:61,updated_at:'2026-10-29T00:00:00Z'});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let relative=decodeURIComponent(url.pathname).replace(/^\//,'');if(relative.endsWith('/'))relative+='index.html';
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 let bytes;try{bytes=fs.existsSync(file)?fs.readFileSync(file):execFileSync('git',['show','HEAD:'+relative],{cwd:root,maxBuffer:32e6,windowsHide:true,stdio:['ignore','pipe','pipe']});}catch{return res.writeHead(404).end();}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
});
if(!process.env.QA_ORIGIN)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of process.env.QA_ORIGIN?[390]:[1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   const req=route.request(),pathname=new URL(req.url()).pathname;
   if(req.method()!=='GET'){writes.push(pathname);return route.fulfill({status:403,json:{error:'Read-only QA'}});}
   if(pathname==='/api/mercenary-codex')return process.env.QA_ORIGIN?route.continue():route.fulfill({json:catalog});
   if(pathname==='/api/mercenaries/v3/state')return route.fulfill({json:account});
   return route.fulfill({json:{visible:false,enabled:false,items:[]}});
  });
  await page.goto(origin+'/mercenary-codex/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-code="V-979"]').waitFor();
  assert.equal(await page.locator('#ownedCount').textContent(),'1');assert.equal(await page.locator('.roster-row').count(),1);
  await page.locator('[data-code="V-979"]').click();assert.match(await page.locator('#inspection').textContent(),/족로/);assert.match(await page.locator('#inspection').textContent(),/청룡단천/);
  assert.equal(await page.locator('[data-equip="V-979"]').count(),2);
  for(const button of await page.locator('[data-equip="V-979"]').all())assert.equal(await button.isEnabled(),true);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-code="V-979"] img,#portraitDisplay .source-art')].every(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:path.join(out,'owned-'+width+'.png')});
  if(await page.locator('#inspectionSheet').evaluate(dialog=>dialog.open))await page.locator('#closeInspection').click();
  await page.locator('#allView').click();await page.locator('#search').fill('족로');assert.equal(await page.locator('.roster-row').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  reports.push({width,accountId:3,role:'USER',ownedJokroCopies:1,ownedAndAllSearchVisible:true,pvePvpButtonsEnabled:true,artLoaded:true,horizontalOverflow:false,errors,writes});await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({origin,accountSource:'Isolated PostgreSQL fixture for ID 3 through real mercenaryAccountState; live account verified separately READ ONLY',reports},null,2)+'\n');console.log(JSON.stringify({out,reports}));
}finally{await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));for(const fn of cleanups)await fn();}
