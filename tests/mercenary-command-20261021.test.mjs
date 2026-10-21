import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {publicCodexHtml} from '../mercenary-codex/shell.mjs';

test('approved assets are unchanged and the built public shell matches its source',()=>{
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const dir='assets/ui/mercenary-codex/command-20261021/';
 assert.equal(hash(dir+'action-user-approved-original.png'),'a9dfb94b8fc976e6b31b6597b53d9cc4fd062dd671de8a6c4d9f215acbef661e');
 assert.equal(hash(dir+'panel-v3-original.png'),'744cd164a9971b9ea1bc374d8f32bca7054fe5488cc415edf71b40d187c58335');
 assert.equal(fs.readFileSync('mercenary-codex/index.html','utf8').replace(/\r\n/g,'\n'),publicCodexHtml().replace(/\r\n/g,'\n'));
});

test('desktop and mobile direct PVE/PVP deployment, replay, ownership, filters and artwork', {timeout:240000},async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 const root=process.cwd(),out=process.env.QA_OUT||fs.mkdtempSync(path.join(os.tmpdir(),'mercenary-command-'));
 fs.mkdirSync(out,{recursive:true});
 const f=await mercenaryFixture(t,{postgres:true});await ensureMercenaryLevelSchema(f.env);
 await f.p("INSERT INTO users(id,nickname) VALUES(1,'isolated command QA')").run();
 const user={id:1,role:'OWNER'},codes=['V-979','V-989','V-976','V-980','V-984'];
 for(const code of codes)await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(1,?,1,0,?,?)',code,'isolated','isolated').run();
 const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:61,updated_at:'2026-10-21T00:00:00Z'});
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
 const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file))return res.writeHead(404).end();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const origin='http://127.0.0.1:'+server.address().port,reports=[];
 for(const width of [1440,390,320]){
  const state=await mercenaryAccountState(f.env,user);
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mercenaryCode:'V-979',mode:'PVE',revision:state.loadouts.PVE.revision});
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mercenaryCode:null,mode:'PVP',revision:state.loadouts.PVP.revision});
  const initial=await mercenaryAccountState(f.env,user);
  const context=await browser.newContext({viewport:{width,height:width>760?1050:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_bgm_enabled','false');});
  page.on('pageerror',e=>errors.push(e.message));let loseResponse=false,accountFailure=false;
  await page.route('**/api/**',async route=>{
   const req=route.request(),pathname=new URL(req.url()).pathname;
   try{
    if(pathname==='/api/mercenary-codex')return route.fulfill({json:catalog});
    if(pathname==='/api/mercenaries/v3/state')return accountFailure?route.fulfill({status:401,json:{error:'로그인 후 다시 확인하세요.'}}):route.fulfill({json:await mercenaryAccountState(f.env,user)});
    if(pathname==='/api/mercenaries/v3/loadout'&&req.method()==='POST'){
     const body=req.postDataJSON();requests.push(body);const result=await saveMercenaryLoadout(f.env,user,body);
     if(loseResponse){loseResponse=false;return route.fulfill({status:503,json:{error:'검수용 응답 유실'}});}
     return route.fulfill({json:result});
    }
    assert.equal(req.method(),'GET','unrelated writes are forbidden');
    return route.fulfill({json:{visible:false,enabled:false,items:[]}});
   }catch(e){return route.fulfill({status:e.status||500,json:{code:e.code,error:e.message}});}
  });
  const mobile=width<=760,open=async code=>{await page.locator(`.roster-row[data-code="${code}"]`).click();if(mobile)await page.locator('#inspectionSheet[open]').waitFor();};
  const close=async()=>{if(mobile&&await page.locator('#inspectionSheet').evaluate(el=>el.open))await page.locator('#closeInspection').click();};
  await page.goto(origin+'/mercenary-codex/#V-989',{waitUntil:'domcontentloaded'});
  await page.locator('.roster-row').first().waitFor();assert.equal(await page.locator('.roster-row').count(),5);
  if(!mobile){
   const category=page.locator('soop-adventure-lobby .side-link[data-category="cards"]');await category.waitFor();
   assert.equal(await page.locator('soop-adventure-lobby .side-link[data-route="mercenaryDex"]').count(),0);
   assert.equal(await category.getAttribute('aria-current'),'page');await category.click();
   const entry=page.locator('soop-adventure-lobby .menu-result[data-route="mercenaryDex"]');assert.equal(await entry.count(),1);
   await Promise.all([page.waitForURL(origin+'/mercenary-codex/'),entry.click()]);
   await page.locator('.roster-row').first().waitFor();
   await open('V-989');
  }
  await page.evaluate(()=>document.fonts.ready);
  const fonts=await page.evaluate(()=>({family:getComputedStyle(document.body).fontFamily,loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)}));
  assert.match(fonts.family,/Pretendard/);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(out,'roster-'+width+'.png'),fullPage:false});
  await open('V-989');assert.equal(await page.locator('[data-equip]').count(),2);
  await page.waitForFunction(()=>{const img=document.querySelector('#portraitDisplay .source-art');return img?.complete&&img.naturalWidth>0;});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.match(await page.locator('.equip-button').first().evaluate(el=>getComputedStyle(el).borderImageSource),/action-user-approved.webp/);
  await page.screenshot({path:path.join(out,'selection-'+width+'.png')});
  if(mobile){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#inspectionSheet').contains(document.activeElement)),true);}
  await page.locator('[data-equip][data-deploy-mode="PVP"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip][data-deploy-mode="PVP"]')?.textContent.includes('편성 완료'));
  assert.equal(requests.at(-1).mode,'PVP');assert.equal(requests.at(-1).revision,initial.loadouts.PVP.revision);
  let saved=await mercenaryAccountState(f.env,user);assert.equal(saved.loadouts.PVE.mercenaryCode,'V-979');
  await page.locator('[data-equip][data-deploy-mode="PVE"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip][data-deploy-mode="PVE"]')?.textContent.includes('편성 완료'));
  assert.equal(requests.at(-1).revision,initial.loadouts.PVE.revision);saved=await mercenaryAccountState(f.env,user);
  assert.equal(saved.loadouts.PVE.mercenaryCode,'V-989');assert.equal(saved.loadouts.PVP.mercenaryCode,'V-989');
  assert.match(await page.locator('.roster-row[data-code="V-989"] .row-active').textContent(),/PVE · PVP/);
  await page.locator('[data-unequip][data-deploy-mode="PVP"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-equip][data-deploy-mode="PVP"]')?.disabled);
  saved=await mercenaryAccountState(f.env,user);assert.equal(saved.loadouts.PVE.mercenaryCode,'V-989');assert.equal(saved.loadouts.PVP.mercenaryCode,null);
  await close();await open('V-976');loseResponse=true;
  await page.locator('[data-equip][data-deploy-mode="PVP"]').click();await page.locator('[data-recover-loadout]:enabled').waitFor();
  const lost=requests.at(-1),committed=await mercenaryAccountState(f.env,user);
  assert.equal(committed.loadouts.PVP.mercenaryCode,'V-976');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('.roster-row').first().waitFor();await open('V-976');
  await page.locator('[data-recover-loadout]').click();await page.waitForFunction(()=>!document.querySelector('[data-recover-loadout]'));
  assert.deepEqual(requests.at(-1),lost);saved=await mercenaryAccountState(f.env,user);assert.deepEqual(saved.loadouts,committed.loadouts);
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mercenaryCode:'V-979',mode:'PVE',revision:saved.loadouts.PVE.revision});
  await page.locator('[data-equip][data-deploy-mode="PVE"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-equip][data-deploy-mode="PVE"]')?.disabled&&document.querySelector('[data-current-mode="PVE"] strong')?.textContent==='족로');
  assert.equal(await page.locator('[data-recover-loadout]').count(),0,'terminal revision conflict refreshes authoritative state');
  await page.locator('[data-equip][data-deploy-mode="PVE"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip][data-deploy-mode="PVE"]')?.textContent.includes('편성 완료'));
  assert.equal((await mercenaryAccountState(f.env,user)).loadouts.PVE.mercenaryCode,'V-976');
  await page.locator('#sdTab').click();await page.waitForFunction(()=>{const img=document.querySelector('#portraitDisplay img');return img?.complete&&img.naturalWidth>0;});
  await page.locator('#artTab').click();await page.locator('[data-zoom]').click();assert.equal(await page.locator('#artDialog').evaluate(el=>el.open),true);await page.locator('#closeArt').click();
  await close();await page.locator('#limitedView').click();await page.locator('#search').fill('족로');assert.equal(await page.locator('.roster-row').count(),1);
  await page.locator('#search').fill('');await page.locator('#allView').click();await open('V-001');assert.equal(await page.locator('[data-equip]').count(),0);assert.match(await page.locator('.deployment-card').textContent(),/미보유/);
  await close();await page.locator('#ownedView').click();await open('V-980');
  assert.match(await page.locator('.equip-button').first().evaluate(el=>getComputedStyle(el).borderImageSource),/action-user-approved.webp/);
  assert.equal(await page.locator('.equip-button').first().evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  await close();accountFailure=true;await page.locator('#refreshCatalog').click();await page.locator('[data-retry-account]').first().waitFor();
  assert.equal(await page.locator('[data-equip]').count(),0);accountFailure=false;await page.locator('[data-retry-account]').first().click();await page.locator('.roster-row').first().waitFor();
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  reports.push({width,fonts,requests:requests.length,independentModes:true,sameMercenaryBothModes:true,unequip:true,lostResponseReplay:true,ownershipGuard:true,accountRecovery:true,artAndSd:true,overflow:false,errors});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({origin,account:'isolated PostgreSQL-compatible PGlite; no production writes',reports},null,2));
 console.log('Command UI QA: '+out);
});
