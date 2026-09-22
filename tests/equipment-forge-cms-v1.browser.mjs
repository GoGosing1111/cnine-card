import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeRuntimeDraft,FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {readForgeRuntime,saveForgeRuntime} from '../functions/_equipment_forge_transactions.js';
import {handleForgeRuntime} from '../functions/_equipment_forge_routes.js';
import {handleEquipmentForgePublic} from '../functions/_equipment_forge_public.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.env.QA_OUTPUT||path.join(root,'../qa-forge-cms'));
fs.mkdirSync(out,{recursive:true});
const fixture=await forgeFixture(null),errors=[],reports=[];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
let writes=0;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>24000)throw Error('body limit');}
   const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),args={path:url.pathname.slice(5),request,env:fixture.env,deps:{...fixture.deps,requirePermission:fixture.deps.authenticate}};
   if(req.method==='PATCH')writes++;
   const response=await handleForgeRuntime(args)||await handleEquipmentForgePublic(args);
   if(!response){res.writeHead(404);res.end();return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
  if(url.pathname==='/admin/'){
   const html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/equipment-forge-admin-v1.js"></script></body>');res.end(html);
  }else fs.createReadStream(file).pipe(res);
 }catch(error){errors.push(error.stack);res.writeHead(500);res.end('QA server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [1440,1024,390,360]){
  await fixture.setting(FORGE_RUNTIME_KEY,forgeRuntimeDraft());
  const context=await browser.newContext({viewport:{width,height:940},isMobile:width<600,hasTouch:width<600}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_admin_token','local-account-7'));
  await page.goto(origin+'/admin/#equipment-forge');
  await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
  await page.locator('.forge-policy-step').last().waitFor();
  assert.equal(await page.locator('.forge-policy-step').count(),10);
  const field=p=>page.locator(`[data-policy-path="${p}"]`),tab=name=>page.locator(`[data-policy-tab="${name}"]`).click();
  const save=()=>page.locator('.forge-policy-form button[type=submit]').click(),status=page.locator('[data-policy-status]');
  const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
  await overflow();await page.screenshot({path:path.join(out,`steps-${width}.png`)});
  await field('steps.0.successPpm').fill('70');await field('steps.0.maintainPpm').fill('20');await field('steps.0.destroyPpm').fill('20');
  const count=writes;await save();await status.filter({hasText:'합계'}).waitFor();assert.equal(writes,count);
  await field('steps.0.destroyPpm').fill('10');await field('steps.0.coinCost').fill('10000000000');await field('steps.0.itemQuantity').fill('3');await field('steps.0.protectionQuantity').fill('1');
  await tab('protection');await field('protection.itemCode').selectOption('FORGE_TEST_PROTECTION');await field('protection.consume').selectOption('ON_DESTROY');
  await field('protection.sources.0.enabled').check();await field('protection.sources.0.chancePpm').fill('0.0001');await field('protection.sources.0.quantity').fill('1');
  await overflow();await page.screenshot({path:path.join(out,`protection-${width}.png`)});
  await tab('restoration');await field('restoration.enabled').check();await field('restoration.coinCost').fill('0');await field('restoration.expiresHours').fill('0');
  await field('restoration.itemCode').selectOption('FORGE_TEST_PROTECTION');await field('restoration.itemQuantity').fill('2');await field('restoration.levelMode').selectOption('PREVIOUS');
  await overflow();await page.screenshot({path:path.join(out,`restoration-${width}.png`)});
  await save();await status.filter({hasText:'저장 완료'}).waitFor();
  let saved=await readForgeRuntime(fixture.env,{draft:true});
  assert.equal(saved.revision,1);assert.equal(saved.steps[0].coinCost,10000000000);assert.equal(saved.steps[0].itemQuantity,3);assert.equal(saved.steps[1].coinCost,null);
  assert.equal(saved.protection.sources[0].chancePpm,1);assert.equal(saved.restoration.expiresHours,0);assert.equal(saved.restoration.itemQuantity,2);assert.equal(saved.mode,'OFF');
  await tab('readiness');await field('quoteSeconds').fill('182');
  await saveForgeRuntime(fixture.env,fixture.user,{...saved,quoteSeconds:181});
  await save();await status.filter({hasText:'입력은 보존'}).waitFor();assert.equal(await field('quoteSeconds').inputValue(),'182');
  await page.locator('.forge-public-settings summary').click();await page.locator('textarea[name=notice]').fill('장비 강화 상세 CMS 검수');
  await page.locator('.forge-public-settings button[type=submit]').click();await page.locator('.forge-public-settings [role=status]').filter({hasText:'저장 완료'}).waitFor();
  assert.equal(await field('quoteSeconds').inputValue(),'182','public save preserves runtime edits');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-policy-reload]').click();assert.equal(await field('quoteSeconds').inputValue(),'182');
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-policy-reload]').click();await status.filter({hasText:'불러왔습니다'}).waitFor();assert.equal(await field('quoteSeconds').inputValue(),'181');
  await overflow();await page.screenshot({path:path.join(out,`readiness-${width}.png`)});
  assert.equal(await fixture.coin(),10000000);assert.equal(await fixture.qty('MASTER_STAR'),100);
  await page.evaluate(()=>document.getElementById('roleBadge').textContent='ADMIN');await page.locator('#view-equipment-forge').waitFor({state:'hidden'});assert.equal(await page.locator('[data-policy-path]').count(),0);
  reports.push({width,tabs:4,steps:10,noOverflow:true,atomicSave:true,invalidSumBlocked:true,exactPpm:true,conflictPreservesInput:true,publicSavePreservesPolicy:true,logoutClearsDraft:true,balancesUntouched:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();server.close();await fixture.close();}
