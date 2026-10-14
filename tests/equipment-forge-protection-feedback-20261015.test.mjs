import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {forgeFixture} from './helpers/forge-db.mjs';
import {handleForgeRuntime} from '../functions/_equipment_forge_routes.js';
import {handleEquipmentForgePublic,FORGE_SETTINGS_KEY} from '../functions/_equipment_forge_public.js';
import {ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM} from '../functions/_forge_protection_catalog.js';
import {ensureForgeScrollCatalog} from '../functions/_forge_scroll_catalog.js';
import {FORGE_ADVANCED_KEY,forgeAdvancedDraft,FORGE_SCROLL_ITEMS} from '../shared/equipment-forge-advanced-v1.mjs';
import {EQUIPMENT_FORGE_RELEASE_KEY} from '../shared/equipment-forge-release-v1.mjs';
import {jointHash} from '../functions/_joint_transactions.js';
import release from '../docs/releases/equipment-forge-approved-20260922.json' with {type:'json'};

test('PC/mobile protection clicks explain blocked stages and preserve protected quotes, shortages and account balances',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),output=process.env.FORGE_PROTECTION_QA_DIR||join(tmpdir(),'cnine-forge-protection-feedback-20261015');
 const f=await forgeFixture(t);await ensureForgeProtectionCatalog(f.env);await ensureForgeScrollCatalog(f.env);
 await f.setting(EQUIPMENT_FORGE_RELEASE_KEY,{document:release,sha256:await jointHash(release)});
 await f.setting(FORGE_SETTINGS_KEY,{schemaVersion:1,revision:2,publicVisible:true,executionMode:'ON',notice:'LOCAL ISOLATED QA'});
 await f.p('UPDATE users SET coin=9000000000000 WHERE id=7').run();
 await f.p("UPDATE cnine_user_inventory SET quantity=5000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,2)',FORGE_PROTECTION_ITEM.code).run();
 for(const item of FORGE_SCROLL_ITEMS)await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,10)',item.code).run();
 await f.p("UPDATE character_equipment_items SET image_url='assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png' WHERE id=1").run();
 const level=n=>f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,?,1) ON CONFLICT(instance_id) DO UPDATE SET level=excluded.level,revision=equipment_forge_states_v1.revision+1',f.instanceId,n).run();
 const apiCalls=[],serverErrors=[];
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const chunk of req)body+=chunk;
   const path=url.pathname.slice(5);apiCalls.push({path,body:body?JSON.parse(body):null});
   // Clicking a selector must never execute or charge anything, even on regressions.
   if(/\/forge\/(enhance|restore)$/.test(path)){res.writeHead(500,{'Content-Type':'application/json'}).end('{"error":"Unexpected execution during selector QA"}');return;}
   const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
   const args={path,request,env:f.env,deps:f.deps};
   const result=await handleForgeRuntime(args)||await handleEquipmentForgePublic(args);
   if(!result){res.writeHead(404).end();return;}const payload=await result.text();
   if(!result.ok)t.diagnostic(path+' '+result.status+' '+payload);
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(payload);return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/equipment-forge/'?'/equipment-forge/index.html':url.pathname)),rel=relative(root,file);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');
  let source=await readFile(file);
  if(url.pathname==='/equipment-forge/')source=source.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,s=>s.includes('ui-fx-vendor')?s:'').replace('</body>','<script type="module" src="/equipment-forge/app.mjs"></script></body>');
  res.end(source);
 }catch(error){serverErrors.push(error.message);res.writeHead(500).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});t.after(()=>browser.close());
 await mkdir(output,{recursive:true});
 for(const width of [1440,390]){
  await level(7);await f.p('DELETE FROM app_meta WHERE key=?',FORGE_ADVANCED_KEY).run();
  const context=await browser.newContext({viewport:{width,height:940},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.goto('http://127.0.0.1:'+server.address().port+'/equipment-forge/');
  const control=page.locator('#protection-toggle'),hint=page.locator('#protection-status');
  const ready=n=>page.waitForFunction(n=>document.getElementById('rate-level').textContent===`+${n} → +${n+1}`,n);
  const changeLevel=async n=>{await level(n);await page.locator('#refresh-equipment').click();};
  await ready(7);assert.equal(await control.isDisabled(),true);assert.match(await hint.innerText(),/현재 \+7 → \+8.*사용 불가.*\+9 도전부터/);
  const before=apiCalls.length;
  // Physical click/tap on the visible artwork, not a forced checkbox mutation.
  await page.locator('.protection-card img').scrollIntoViewIfNeeded();
  const artwork=await page.locator('.protection-card img').boundingBox(),point={x:artwork.x+artwork.width/2,y:artwork.y+artwork.height/2};
  if(width<600)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  assert.equal(await page.locator('#toast').innerText(),await hint.innerText());assert.equal(apiCalls.length,before);
  await page.locator('.control-panel').screenshot({path:join(output,width+'-blocked.png')});

  await changeLevel(8);await ready(8);assert.equal(await control.isDisabled(),false);assert.match(await hint.innerText(),/\+9 도전 1장 필요 \/ 보유 2장/);
  if(width<600)await page.locator('.protection-card').tap();else await page.locator('.protection-card').click();
  await page.waitForFunction(()=>document.querySelector('.consumption-note').textContent.includes('보호권 1장'));
  assert.equal(await control.isChecked(),true);assert.match(await hint.innerText(),/사용 선택됨/);
  assert.equal(apiCalls.filter(c=>c.path.endsWith('/quote')).at(-1).body.useProtection,true);
  await control.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('.consumption-note').textContent==='보호권 미사용');assert.equal(await control.isChecked(),false);

  await changeLevel(9);await ready(9);assert.match(await hint.innerText(),/3장 필요 \/ 보유 2장 \/ 1장 부족/);
  await page.locator('.protection-card').click();await page.waitForFunction(()=>document.getElementById('forge-connection').textContent.includes('1장 부족'));
  assert.equal(await control.isChecked(),true);assert.equal(await page.locator('#enhance-button').isDisabled(),true);
  await page.locator('#forge-retry').click();await ready(9);assert.equal(await control.isChecked(),true);
  await page.locator('.control-panel').screenshot({path:join(output,width+'-shortage.png')});

  await changeLevel(10);await page.waitForFunction(()=>document.getElementById('enhance-button').textContent.includes('강화 준비 중'));
  assert.equal(await control.isDisabled(),true);assert.equal(await control.isChecked(),false);assert.match(await hint.innerText(),/\+11.*설정.*준비/);
  const advanced=forgeAdvancedDraft();for(const [i,s]of advanced.steps.entries())Object.assign(s,{successPpm:500000,maintainPpm:250000,destroyPpm:250000,coinCost:100,itemQuantity:2,scrollQuantity:1,protectionQuantity:2,powerBonusPercent:160+i*40});
  await f.setting(FORGE_ADVANCED_KEY,advanced);await page.locator('#refresh-equipment').click();await ready(10);
  assert.equal(await control.isDisabled(),false);await page.locator('.protection-card').click();await page.waitForFunction(()=>document.querySelector('.consumption-note').textContent.includes('보호권 2장'));
  assert.match(await hint.innerText(),/사용 선택됨.*\+11 도전 2장 필요/);assert.equal(await page.locator('#enhance-button').isDisabled(),false);
  await changeLevel(15);await page.waitForFunction(()=>document.getElementById('enhance-button').textContent.includes('최대 강화'));
  assert.equal(await control.isDisabled(),true);assert.match(await hint.innerText(),/최대 강화 단계/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.equal(apiCalls.filter(c=>/\/forge\/(enhance|restore)$/.test(c.path)).length,0);
 assert.equal(await f.coin(),9000000000000);assert.equal(await f.qty('MASTER_STAR'),5000000);assert.equal(await f.qty(FORGE_PROTECTION_ITEM.code),2);
 assert.deepEqual(serverErrors,[]);t.diagnostic('Protection feedback evidence: '+output);
});
