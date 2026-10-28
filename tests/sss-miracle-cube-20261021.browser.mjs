import test from 'node:test';
import {sssCubeStockCode,SSS_CUBE_LIMITED_CODES} from '../shared/sss-miracle-cube-stock-v1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureSssCubeCatalog,sssCubeState,saveSssCubePolicy,openSssCube,sssCubeReceipt} from '../functions/_sss_miracle_cube.js';
import {SSS_CUBE_TOTAL} from '../shared/sss-miracle-cube-v1.mjs';

test('SSS cube CMS, opening, receipt recovery and art layout on desktop/mobile',{timeout:120000},async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const f=await mercenaryFixture(t);await ensureLimitedPackSchema(f.env);await ensureSssCubeCatalog(f.env);
 f.document.mercenaries.find(c=>c.code==='V-021').rank='SSS';await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'SSS_MIRACLE_CUBE',30,30)").run();
 for(const [code,limit,issued] of [['V-996',15,14],['V-999',8,8],['V-989',3,0],['V-979',3,0]])await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,?,?)',sssCubeStockCode(code),limit,issued).run();
 for(const code of ['V-973','V-974','V-975','V-978'])await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,5,0)',sssCubeStockCode(code)).run();
 const root=process.cwd(),out=process.env.QA_OUT||fs.mkdtempSync(path.join(os.tmpdir(),'sss-cube-'));fs.mkdirSync(out,{recursive:true});
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)&&process.env.QA_ASSET_ROOT&&file.startsWith(path.join(root,'assets')+path.sep))file=path.join(process.env.QA_ASSET_ROOT,path.relative(root,file));if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});t.after(()=>browser.close());const origin='http://127.0.0.1:'+server.address().port,reports=[];
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width>800?1000:844},serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'}),page=await context.newPage(),errors=[];let loseResponse=false,opens=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');});
  await page.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url());
   try{
    if(u.pathname==='/api/admin/sss-miracle-cube')return route.fulfill({json:req.method()==='GET'?await sssCubeState(f.env,f.user):await saveSssCubePolicy(f.env,f.user,req.postDataJSON())});
    if(u.pathname==='/api/sss-miracle-cube/state')return route.fulfill({json:await sssCubeState(f.env,f.user)});
    if(u.pathname==='/api/sss-miracle-cube/open'){opens++;const result=await openSssCube(f.env,f.user,req.postDataJSON(),{randomInt:()=>0});if(loseResponse){loseResponse=false;return route.fulfill({status:503,json:{code:'SSS_CUBE_RETRYABLE',error:'검수용 응답 유실'}});}return route.fulfill({json:result});}
    if(u.pathname==='/api/sss-miracle-cube/receipt')return route.fulfill({json:await sssCubeReceipt(f.env,f.user,u.searchParams.get('requestId'))});
    assert.equal(req.method(),'GET','No unrelated writes');return route.fulfill({json:{items:[],visible:false,enabled:false}});
   }catch(e){return route.fulfill({status:e.status||500,json:{code:e.code,error:e.message}});}
  });
  const pre=await sssCubeState(f.env,f.user);await saveSssCubePolicy(f.env,f.user,{requestId:crypto.randomUUID(),revision:pre.revision,policy:{mode:'OFF',cards:{},notes:''}});
  await page.goto(origin+'/admin/sss-miracle-cube.html');await page.locator('#cube-form').waitFor();
  assert.equal(await page.locator('[data-card="V-990"]').count(),0);
  for(const code of SSS_CUBE_LIMITED_CODES)assert.equal(await page.locator(`[data-limit="${code}"]`).count(),1);
  await page.locator('[data-limit="V-973"]').fill('6');
  const normal=page.locator('[data-card="V-021"]');await normal.fill('0.000000001');await page.locator('[data-group="limited"]').click();assert.equal(await page.locator('#save').isDisabled(),true);
  await page.locator('[data-group="normal"]').click();assert.equal(await normal.inputValue(),'0.000000001');await normal.fill('100');await page.locator('#mode').selectOption('ON');
  await page.locator('#notes').fill('isolated browser QA');await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('저장 완료'));
  assert.equal((await sssCubeState(f.env,f.user)).catalog.find(c=>c.code==='V-973').stockLimit,6);
  await page.locator('[data-group="all"]').click();await page.screenshot({path:path.join(out,'cms-'+width+'.png'),fullPage:true});
  const validateLayout=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow');await validateLayout();
  await page.goto(origin+'/sss-miracle-cube/');await page.waitForFunction(()=>!document.querySelector('#open-one').disabled);await page.locator('#cube-art').evaluate(img=>img.decode());
  assert.equal(await page.locator('#cube-art').evaluate(img=>img.naturalWidth>0),true);await validateLayout();await page.screenshot({path:path.join(out,'ready-'+width+'.png'),fullPage:true});
  const balanceBefore=(await sssCubeState(f.env,f.user)).balance;
  await page.locator('#open-one').click();await page.locator('#result-dialog[open]').waitFor();assert.equal(await page.locator('#result-name').innerText(),f.document.mercenaries.find(c=>c.code==='V-021').name);
  assert.equal((await sssCubeState(f.env,f.user)).balance,balanceBefore-1);await page.locator('#result-confirm').click();
  if(width===1440){
   loseResponse=true;await page.waitForFunction(()=>!document.querySelector('#open-one').disabled);await page.locator('#open-one').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('응답 유실'));
   await page.reload();await page.locator('#recover').waitFor();const beforeRecovery=opens;await page.locator('#recover').click();await page.locator('#result-dialog[open]').waitFor();assert.equal(opens,beforeRecovery);assert.equal((await sssCubeState(f.env,f.user)).balance,balanceBefore-2);await page.locator('#result-confirm').click();
   const current=await sssCubeState(f.env,f.user);await saveSssCubePolicy(f.env,f.user,{requestId:crypto.randomUUID(),revision:current.revision,policy:{mode:'ON',cards:{'V-996':SSS_CUBE_TOTAL},notes:''}});
   await page.reload();await page.waitForFunction(()=>!document.querySelector('#open-one').disabled);await page.locator('#open-one').click();await page.locator('#result-dialog[open]').waitFor();assert.match(await page.locator('#result-serial').innerText(),/15 \/ 15/);await page.screenshot({path:path.join(out,'limited-result.png')});await page.locator('#result-confirm').click();await page.waitForFunction(()=>document.querySelector('#open-one').disabled);assert.equal((await sssCubeState(f.env,f.user)).openingEnabled,false);
  }
  await page.goto(origin+'/sss-miracle-cube/?admin=1');await page.locator('#owner-tools').waitFor();await page.locator('#preview-group').selectOption('limited');const beforePreview=(await sssCubeState(f.env,f.user)).balance;await page.locator('#preview').click();await page.locator('#result-dialog[open]').waitFor();assert.equal((await sssCubeState(f.env,f.user)).balance,beforePreview);await validateLayout();
  assert.deepEqual(errors,[]);reports.push({width,cmsSaved:true,noOverflow:true,cubeImageLoaded:true,previewWithoutGrant:true,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,checkedAt:new Date().toISOString(),scope:'isolated DB and account; no production writes'},null,2)+'\n');console.log(JSON.stringify({out,reports}));
});
