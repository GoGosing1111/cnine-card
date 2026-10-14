import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'docs/qa/mercenary-halloween-art-20261014');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await limitedFixture({after:fn=>cleanup.push(fn)}),catalog=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-14'});
const account={accountId:1,available:true,cards:[],loadouts:{PVE:{revision:0,mercenaryCode:null},PVP:{revision:0,mercenaryCode:null}},leveling:{enabled:false},deployment:{enabled:true}};
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/cms-qa'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><style>[hidden]{display:none!important}body{margin:0;padding:14px;background:#10141d;color:#eee;font-family:Arial,sans-serif}main{max-width:1180px;margin:auto}input,textarea{box-sizing:border-box}</style><span id="roleBadge">OWNER</span><nav id="nav"></nav><h1 id="pageTitle"></h1><main id="cms"></main><script type="module" src="/admin/mercenary-admin-v1.js?v=20261014-halloween"></script></html>');}
  if(url.pathname==='/api/mercenary-codex')return json(catalog);
  if(url.pathname==='/api/mercenaries/v3/state')return json(account);
  if(url.pathname==='/api/admin/mercenaries')return json({revision:1,document:seed.document,catalog:seed.catalog,audit:[],deployment:{enabled:true},updatedAt:'2026-10-14T00:00:00Z'});
  if(url.pathname.startsWith('/api/')&&url.pathname.includes('halloween-pack')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:{'content-type':'application/json',origin:req.headers.origin||'',authorization:req.headers.authorization||''},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
   const response=await handleHalloweenPack({path:url.pathname.slice(5),request,env:f.env,deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});return json(response.body,response.status);
  }
  if(url.pathname.startsWith('/api/'))return json({});
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const [label,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700}),errors=[],failed=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','isolated-qa');localStorage.setItem('cnine_admin_token','isolated-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,nickname:'검수',serverUserId:1}));});
  const watch=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push({status:r.status(),url:r.url()});});};
  const page=await context.newPage();watch(page);await page.goto(base+'/mercenary-codex/?view=limited&q=할로윈#V-986');await page.locator('.roster-row').first().waitFor();assert.equal(await page.locator('.roster-row').count(),7);
  for(const c of HALLOWEEN_MERCENARIES){
   await page.locator('[data-code="'+c.code+'"]').click();await page.locator('.source-art').evaluate(img=>img.decode());await page.locator('.card-frame').evaluate(img=>img.decode());
   assert.equal(await page.locator('.stage-heading h2').textContent(),c.name);assert.match(await page.locator('.limited-record').innerText(),/SS 할로윈 리미티드 팩/);assert.match(await page.locator('.limited-record').innerText(),/서버 5장/);assert.equal(await page.locator('#sdTab').isDisabled(),true);assert.equal(await page.locator('[data-equip]').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.locator('#inspection').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-namsudaeng.png')});
  await page.locator('[data-zoom]').click();await page.locator('#originalArt').evaluate(img=>img.decode());assert.equal(await page.locator('#originalArt').getAttribute('src'),'/'+HALLOWEEN_MERCENARIES[6].sourceArt);await page.locator('#closeArt').click();
  const cms=await context.newPage();watch(cms);await cms.goto(base+'/cms-qa#mercenaries/halloween');await cms.locator('[data-halloween-rate="V-986"]').waitFor({timeout:12000}).catch(async e=>{console.log(JSON.stringify({errors,failed,body:await cms.locator('body').innerText(),html:await cms.locator('[data-halloween-root]').count()}));throw e;});assert.equal(await cms.locator('[data-halloween-rate]').count(),7);assert.equal(await cms.locator('[data-halloween-price="single"]').inputValue(),'');
  await cms.screenshot({path:path.join(out,label+'-cms-off.png')});assert(await cms.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await cms.locator('[data-halloween-price="single"]').fill('123456789');await cms.locator('[data-halloween-rate="V-986"]').fill('0.0001');await cms.locator('[data-halloween-save]').click();await cms.waitForFunction(()=>document.querySelector('[data-halloween-root]')?.textContent.includes('초안 저장 완료'));
  assert.match(await cms.locator('[data-halloween-root]').innerText(),/개방 OFF/);await cms.reload();await cms.locator('[data-halloween-rate="V-986"]').waitFor();assert.equal(await cms.locator('[data-halloween-price="single"]').inputValue(),'123456789');
  // Restore only the isolated fixture for the other viewport; production stays untouched.
  await f.pg.query('DELETE FROM app_meta WHERE key LIKE $1',['mercenary_halloween_ss_pack_v1%']);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({viewport:{width,height},cards:7,namsudaengOriginal:true,packOnly:true,serverCap:5,battleLocked:true,ownerCmsSaveReload:true,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',scope:'Actual codex, OWNER CMS module, transport and Halloween API on isolated PostgreSQL fixture; no production transactions',reports},null,2)+'\n');console.log(JSON.stringify({status:'PASSED',reports}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const fn of cleanup)await fn();}
