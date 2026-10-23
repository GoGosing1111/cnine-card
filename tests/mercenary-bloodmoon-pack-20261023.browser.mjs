import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,bloodmoonPackDraft,bloodmoonPackCatalogRow} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft} from '../shared/mercenary-halloween-pack-v1.mjs';
import {handleBloodmoonPack,readBloodmoonPackState} from '../functions/_mercenary_bloodmoon_pack.js';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';

const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/blood-pack-preparation-20261023');fs.mkdirSync(out,{recursive:true});
const cleanup=[],reports=[];let samples=[],posts=0,allowFixtureOpening=false;
const f=await bloodmoonFixture({after:fn=>cleanup.push(fn)},{randomInt:max=>{const n=samples.shift()??0;assert(n<max);return n;}});
await f.setting(HALLOWEEN_PACK_KEY,{revision:23,settings:halloweenPackDraft()});
const halloweenBefore=(await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
const apiScript=`async function api(path,options={}){const r=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),d,{status:r.status});return d;}`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/room')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090711"><script type="module">import {mountBloodmoonPack} from '/js/mercenary-bloodmoon-pack-live.mjs';${apiScript}window.ready=mountBloodmoonPack({accountId:1,getAccountId:()=>1,api});</script></body></html>`);
  if(url.pathname==='/cms')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#10141d;color:#eee"><span id="roleBadge">OWNER</span><nav id="nav"></nav><h1 id="pageTitle"></h1><main id="cms" style="max-width:1180px;margin:auto"></main><script type="module" src="/admin/mercenary-admin-v1.js"></script></body></html>');
  if(url.pathname==='/api/admin/mercenaries')return json({revision:1,updatedAt:new Date().toISOString(),document:seed.document,catalog:seed.catalog,audit:[]});
  if(['/api/admin/mercenaries/bloodmoon-pack','/api/admin/mercenaries/halloween-pack'].includes(url.pathname)){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:{origin:url.origin,'content-type':'application/json'},...(req.method==='PATCH'?{body:Buffer.concat(chunks)}:{})});
   const handler=url.pathname.endsWith('/bloodmoon-pack')?handleBloodmoonPack:handleHalloweenPack;const r=await handler({path:url.pathname.slice(5),request,env:f.env,deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});return json(r.body,r.status);
  }
  if(url.pathname==='/api/'+BLOODMOON_PACK.featurePath)return json(await readBloodmoonPackState(f.env,{releaseEnabled:allowFixtureOpening}));
  if(url.pathname==='/api/'+BLOODMOON_PACK.openPath){assert(allowFixtureOpening,'Only the isolated fixture may open');posts++;const chunks=[];for await(const c of req)chunks.push(c);return json(await f.service.open(f.env,f.user,JSON.parse(Buffer.concat(chunks))));}
  if(url.pathname==='/api/'+BLOODMOON_PACK.receiptPath)return json(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));
  if(url.pathname.startsWith('/api/'))return json({maintenance:{active:false},enabled:false,connected:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60});
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message,code:e.code}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const width of (process.env.QA_WIDTHS||'1440,390,320').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1050},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/bloodmoon|blood-pack/.test(r.url()))failed.push({url:r.url(),status:r.status()});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_admin_token','fixture');});
  allowFixtureOpening=false;Object.assign(f.settings,bloodmoonPackDraft());await f.configure(1);
  await page.goto(base+'/?screen=buy');await page.waitForFunction(()=>typeof renderShell==='function');await page.waitForSelector('#key');
  const row=bloodmoonPackCatalogRow(f.settings,(await f.pg.query('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1')).rows);
  await page.evaluate(row=>{document.querySelector('[data-miracle-close]')?.click();API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'블러드팩 검수',role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));applyServerPacks([row]);selectedPackId=row.id;renderShell('buy');},row);
  await page.locator('.bloodmoon-shop-art img').evaluate(i=>i.decode());assert.equal(await page.locator('.bloodmoon-shop-collection img').count(),9);assert.equal(await page.locator('[data-bloodmoon-pack-enter]').count(),0);assert.match(await page.locator('.bloodmoon-shop-hero').innerText(),/개봉 OFF/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  for(const name of ['블러드문 남수댕','레오넬','제너럴 족','프라임 레퀴엠'])assert((await page.locator('.bloodmoon-shop-hero').innerText()).includes(name));
  await page.locator('.bloodmoon-shop-main').screenshot({path:path.join(out,'shop-'+width+'.png')});
  await page.locator('.bloodmoon-shop-hero .bwp-legend-collection').scrollIntoViewIfNeeded();await page.locator('.bloodmoon-shop-hero .bwp-legend-collection img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));await page.locator('.bloodmoon-shop-hero .bwp-legend-collection').screenshot({path:path.join(out,'sss-roster-'+width+'.png')});
  await page.goto(base+'/cms#mercenaries/bloodmoon');await page.locator('[data-bloodmoon-price="single"]').waitFor();assert.equal(await page.locator('[data-bloodmoon-rate]').count(),9);assert.equal(await page.locator('[data-bloodmoon-normal]').count(),6);assert.equal(await page.locator('[data-bloodmoon-mode] option[value=ON]').evaluate(option=>option.disabled),true);
  await page.locator('[data-bloodmoon-price="single"]').fill('34567');await page.locator('[data-bloodmoon-normal="SSS"]').fill('1');await page.locator('[data-bloodmoon-rate="V-974"]').fill('2');assert.equal(await page.locator('[data-bloodmoon-effective="V-974"]').innerText(),'0.02%');await page.locator('[data-bloodmoon-save]').click();await page.waitForFunction(()=>document.querySelector('[data-bloodmoon-notice]')?.textContent.includes('저장 완료'));
  await page.reload();await page.locator('[data-bloodmoon-price="single"]').waitFor();assert.equal(await page.locator('[data-bloodmoon-price="single"]').inputValue(),'34567');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('[data-bloodmoon-root] img').evaluateAll(images=>Promise.all(images.map(i=>{i.loading='eager';return i.decode();})));await page.screenshot({path:path.join(out,'cms-'+width+'.png'),fullPage:true});
  await page.locator('[data-tab=halloween]').click();await page.locator('[data-halloween-price="single"]').waitFor();assert.equal(await page.locator('[data-halloween-price="single"]').inputValue(),'');await page.locator('[data-tab=bloodmoon]').click();assert.equal(await page.locator('[data-bloodmoon-price="single"]').inputValue(),'34567');assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value,halloweenBefore);
  await page.goto(base+'/room');await page.locator('.bwp-dialog').waitFor();await page.locator('.bwp-welcome-art img').evaluate(i=>i.decode());assert.equal(await page.locator('[data-bwp-buy="10"]').isDisabled(),true);await page.locator('.bwp-dialog').screenshot({path:path.join(out,'room-off-'+width+'.png')});
  if(width!==320&&!process.env.QA_VISUAL_ONLY){
   allowFixtureOpening=true;f.settings.mode='ON';f.settings.prices={single:100,ten:900};f.settings.normalRankRatesPpm={C:0,B:0,A:0,S:0,SS:500000,SSS:500000};f.settings.missRatePpm=0;f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-960'||code==='V-974'?500000:0]));f.settings.normalSssRatePpm=0;await f.configure(3);
   await page.reload();await page.locator('[data-bwp-buy="10"]:not([disabled])').waitFor();const before=posts;
   await page.locator('[data-bwp-buy="10"]').click();await page.keyboard.press('Escape');assert.equal(posts,before);
   samples=[5000000000,0,5000000000,9999999999,...Array(8).fill([0,0]).flat()];await page.locator('[data-bwp-buy="10"]').click();await page.locator('[data-bwp-confirm-start]').click();await page.locator('.bwp-result').nth(9).waitFor();assert.equal(posts,before+1);
   await page.waitForFunction(()=>document.querySelector('.bwp-video')?.dataset.cinematic==='SS'&&document.querySelector('video')?.currentTime>0);await page.locator('[data-bwp-pause]').click();assert.equal(await page.locator('video').evaluate(v=>v.paused),true);await page.locator('[data-bwp-skip]').click();await page.waitForFunction(()=>document.querySelector('.bwp-video')?.dataset.cinematic==='SSS'&&document.querySelector('video')?.currentTime>0);await page.locator('[data-bwp-skip]').click();await page.locator('[data-bwp-buy="10"]:not([disabled])').waitFor();assert.equal(posts,before+1);await page.locator('.bwp-dialog').screenshot({path:path.join(out,'results-'+width+'.png')});assert.equal(await page.locator('.bwp-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await page.locator('[data-bwp-recover]').click();await page.locator('[data-bwp-skip]').waitFor();await page.locator('[data-bwp-close]').click();assert.equal(posts,before+1);
   await page.goto(base+'/room');await page.locator('[data-bwp-buy="1"]:not([disabled])').waitFor();samples=[0,0,0,0];await page.locator('[data-bwp-auto-toggle]').click();await page.locator('[data-bwp-auto-count]').selectOption('1');await page.locator('[data-bwp-auto-repeats]').fill('2');await page.locator('[data-bwp-auto-start]').click();await page.locator('[data-bwp-confirm-start]').click();
   await page.waitForFunction(()=>document.querySelector('[data-bwp-status]')?.textContent.includes('설정한 자동뽑기를 완료했습니다.'),{},{timeout:40000});assert.equal(posts,before+3);
  }
  allowFixtureOpening=false;f.settings.mode='OFF';await f.configure(4);
  await page.goto(base+'/preview/blood-pack-interface-20261023/');await page.locator('.bwp-portrait').nth(7).waitFor();await page.locator('[data-view=results]').click();assert.equal(await page.locator('.bwp-result').count(),10);await page.locator('[data-view=confirm]').click();assert.equal(await page.locator('[data-bwp-confirm-start]').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,shopOff:true,roster:9,cmsSaveReload:true,cmsIsolation:true,opening:width!==320&&!process.env.QA_VISUAL_ONLY,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,process.env.QA_VISUAL_ONLY?'visual-check.json':'browser.json'),JSON.stringify({status:'PASSED',at:new Date().toISOString(),fixtureOnly:true,productionTransactions:0,reports},null,2)+'\n');console.log(JSON.stringify(reports));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,reports},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const fn of cleanup)await fn();}
