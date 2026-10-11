import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {forgeFixture} from './helpers/forge-db.mjs';
import {handleForgeRuntime} from '../functions/_equipment_forge_routes.js';
import {handleEquipmentForgePublic} from '../functions/_equipment_forge_public.js';
import {FORGE_ADVANCED_KEY,FORGE_SCROLL_ITEMS} from '../shared/equipment-forge-advanced-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=path.join(root,'preview/equipment-enhancement-scrolls-v1/qa');
fs.mkdirSync(out,{recursive:true});
const f=await forgeFixture(null),errors=[],reports=[];
await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:2,publicVisible:true,executionMode:'ON',notice:'ISOLATED LOCAL QA'});
await f.p("UPDATE character_equipment_items SET image_url='assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png' WHERE id=1").run();
await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,10,1)',f.instanceId).run();
await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,1)',FORGE_SCROLL_ITEMS[0].code).run();
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
let origin;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>24000)throw Error('body size');}
   const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),args={path:url.pathname.slice(5),request,env:f.env,deps:{...f.deps,requirePermission:f.deps.authenticate}};
   const response=await handleForgeRuntime(args)||await handleEquipmentForgePublic(args);
   if(!response){res.writeHead(404);res.end();return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
  if(['/admin/','/equipment-forge/'].includes(url.pathname)){
   let html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,script=>script.includes('ui-fx-vendor')?script:'');
   const script=url.pathname==='/admin/'?'/admin/equipment-forge-admin-v1.js':'/equipment-forge/app.mjs';
   html=html.replace('</body>','<script type="module" src="'+script+'"></script></body>');res.end(html);
  }else fs.createReadStream(file).pipe(res);
 }catch(error){errors.push(error.stack);res.writeHead(500);res.end('QA server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 for(const width of [1440,390]){
  await f.p('DELETE FROM app_meta WHERE key=?',FORGE_ADVANCED_KEY).run();
  const context=await browser.newContext({viewport:{width,height:940},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.goto(origin+'/admin/#equipment-forge');
  await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
  await page.locator('[data-advanced-field]').last().waitFor();assert.equal(await page.locator('[data-advanced-field]').count(),40);
  assert.equal(await page.locator('[data-advanced-readiness][data-ready=false]').count(),5);
  await page.waitForFunction(()=>[...document.querySelectorAll('.forge-scrolls img')].every(img=>img.complete&&img.naturalWidth>0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert(await page.evaluate(()=>document.querySelector('.forge-advanced-save').getBoundingClientRect().top>document.querySelector('.forge-advanced-steps').getBoundingClientRect().bottom),'CMS save controls must follow all five step cards');
  await page.locator('.forge-advanced').screenshot({path:path.join(out,'cms-'+width+'.png')});
  const field=key=>page.locator('[data-advanced-index="0"][data-advanced-field="'+key+'"]');
  await field('coinCost').fill('100');await page.locator('.forge-advanced button[type=submit]').click();await page.locator('[data-advanced-status]').filter({hasText:'저장 완료'}).waitFor();
  assert.equal(await page.locator('[data-advanced-readiness][data-ready=false]').count(),5);
  for(const [key,value]of Object.entries({successPpm:50,maintainPpm:25,destroyPpm:25,coinCost:100,itemQuantity:2,scrollQuantity:2,protectionQuantity:0,powerBonusPercent:160}))await field(key).fill(String(value));
  await page.locator('.forge-advanced button[type=submit]').click();await page.locator('[data-advanced-status]').filter({hasText:'1/5단계'}).waitFor();
  assert.equal(await page.locator('[data-advanced-readiness][data-ready=true]').count(),1);
  await page.reload();await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
  await field('scrollQuantity').waitFor();assert.equal(await field('scrollQuantity').inputValue(),'2');
  await page.evaluate(()=>document.getElementById('roleBadge').textContent='ADMIN');await page.locator('#view-equipment-forge').waitFor({state:'hidden'});assert.equal(await page.locator('[data-advanced-field]').count(),0);
  await f.p('UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=7 AND item_code=?',FORGE_SCROLL_ITEMS[0].code).run();
  await page.goto(origin+'/equipment-forge/');await page.waitForFunction(()=>document.getElementById('rate-level').textContent==='+10 → +11');
  await page.waitForFunction(()=>document.querySelector('.forge-scroll-cost img')?.naturalWidth>0);
  assert.match(await page.locator('.forge-scroll-cost').textContent(),/무기 강화주문서 2장/);
  assert.match(await page.locator('#forge-connection').textContent(),/1장 부족/);
  assert.equal(await page.locator('#enhance-button').isDisabled(),true);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.control-panel').screenshot({path:path.join(out,'forge-shortage-'+width+'.png')});
  await f.p('UPDATE cnine_user_inventory SET quantity=3 WHERE user_id=7 AND item_code=?',FORGE_SCROLL_ITEMS[0].code).run();
  await page.locator('#refresh-equipment').click();await page.waitForFunction(()=>!document.getElementById('enhance-button').disabled);
  await page.locator('#rules-button').click();assert.match(await page.locator('#rules-dialog').textContent(),/최대 \+15/);await page.keyboard.press('Escape');
  reports.push({width,cmsSteps:5,cmsFields:40,blankStepsLocked:true,partialSaveLocked:true,configuredStepReady:true,saveReload:true,roleHidesEditor:true,scrollShortageBlocks:true,availableScrollEnables:true,noOverflow:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}
