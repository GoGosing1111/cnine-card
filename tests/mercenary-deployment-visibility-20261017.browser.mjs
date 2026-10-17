import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=process.env.MERCENARY_VISIBILITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'mercenary-deployment-visibility-'));
fs.mkdirSync(out,{recursive:true});
const cleanup=[],fixture=await mercenaryFixture({after:callback=>cleanup.push(callback)},{postgres:false}),user={...fixture.user,role:'USER'};
const codes=['V-001','V-990',...Array.from({length:7},(_,i)=>'V-'+(980+i))];
for(const code of codes)await fixture.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',code,'2026-10-17','2026-10-17').run();
const writes=[],checks=[],errors=[];
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const key=new URL(req.url,'http://127.0.0.1').pathname;
 if(key==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(fixture.document),revision:1}));
 if(key==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(fixture.env,user));
 if(key==='/api/mercenaries/v3/loadout'){
  let text='';for await(const part of req)text+=part;const body=JSON.parse(text);writes.push(body);
  return json(res,await saveMercenaryLoadout(fixture.env,user,body));
 }
 if(key.startsWith('/api/'))return json(res,{visible:false,enabled:false,items:[],user:{id:7,nickname:'검수 계정'}});
 let file=path.resolve(root,'.'+decodeURIComponent(key));if(!file.startsWith(root+path.sep))throw Error('path outside fixture');
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message,code:e.code},e.status||500);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of process.env.MERCENARY_VISIBILITY_WIDTHS?.split(',').map(Number)||[1440,390,320]){
  await fixture.p('DELETE FROM user_mercenary_loadout_v1').run();
  await fixture.p("DELETE FROM app_meta WHERE key LIKE 'mercenary_pvp_loadout_v1:%'").run();
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},hasTouch:width<700,reducedMotion:'reduce',serviceWorkers:'block'});
  page.on('pageerror',error=>errors.push(width+': '+error.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-visibility-fixture'));
  await page.goto(base+'/mercenary-codex/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-code="V-983"]').waitFor();
  await page.locator('[data-code="V-983"]').click();
  await page.locator('[data-equip="V-983"]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const panel=page.locator('#inspection > .deployment-card'),button=panel.locator('[data-equip="V-983"]');
  await panel.scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.combat-panel .deployment-card').count(),0);
  assert.equal(await button.textContent(),'PVE에 오리꿍 편성');
  assert.equal(await button.isEnabled(),true);
  const geometry=await button.evaluate(el=>{const r=el.getBoundingClientRect(),panel=el.closest('.deployment-card').getBoundingClientRect(),art=document.querySelector('.portrait-stage').getBoundingClientRect(),style=getComputedStyle(el);return {button:{top:r.top,bottom:r.bottom,height:r.height,width:r.width},panelBottom:panel.bottom,artTop:art.top,textColor:style.color,textFill:style.webkitTextFillColor,opacity:style.opacity,image:style.backgroundImage,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.ok(geometry.button.height>=64&&geometry.button.width>=220,JSON.stringify(geometry));
  assert.ok(geometry.panelBottom<=geometry.artTop+1,'deployment must precede the art');
  assert.ok(geometry.button.top>=0&&geometry.button.bottom<=(width===1440?1000:844),'button visible after selecting card');
  assert.equal(geometry.hit,true);assert.equal(geometry.overflow,false);
  assert.equal(geometry.textColor,'rgb(36, 23, 10)');assert.equal(geometry.opacity,'1');
  assert.match(geometry.image,/deployment-button\.webp/);
  await page.screenshot({path:path.join(out,`ready-${width}.png`)});
  if(width<700)await button.tap();else{await button.focus();await page.keyboard.press('Enter');}
  await page.waitForFunction(()=>document.querySelector('[data-equip="V-983"]')?.textContent==='✓ PVE 편성 완료');
  assert.equal(await page.locator('[data-equip="V-983"]').evaluate(el=>getComputedStyle(el).opacity),'1');
  await panel.locator('[data-loadout-mode="PVP"]').click();
  assert.equal(await page.locator('[data-equip="V-983"]').textContent(),'PVP에 오리꿍 편성');
  await page.locator('[data-equip="V-983"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip="V-983"]')?.textContent==='✓ PVP 편성 완료');
  const state=await mercenaryAccountState(fixture.env,user);
  assert.equal(state.loadouts.PVE.mercenaryCode,'V-983');assert.equal(state.loadouts.PVP.mercenaryCode,'V-983');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,`equipped-${width}.png`)});
  await panel.locator('[data-unequip]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip="V-983"]')?.textContent==='PVP에 오리꿍 편성');
  assert.equal((await mercenaryAccountState(fixture.env,user)).loadouts.PVE.mercenaryCode,'V-983');
  for(const code of codes){
   await page.locator(`[data-code="${code}"]`).click();
   assert.equal(await page.locator('#inspection > .deployment-card').count(),1);
   assert.equal(await page.locator(`[data-equip="${code}"]`).isEnabled(),true);
  }
  if(width===390){
   await page.evaluate(()=>localStorage.setItem('cnine.mercenary.pending:7',JSON.stringify({action:'loadout',body:{requestId:'fixture-pending-visibility',mercenaryCode:'V-983',mode:'PVE',revision:0}})));
   await page.locator('[data-code="V-983"]').click();
   assert.equal(await page.locator('[data-equip="V-983"]').isDisabled(),true);
   assert.equal(await page.locator('[data-equip="V-983"]').evaluate(el=>getComputedStyle(el).opacity),'1');
   await panel.scrollIntoViewIfNeeded();
   assert.equal(await panel.locator('[data-recover-loadout]').isVisible(),true);
   await page.screenshot({path:path.join(out,'pending-390.png')});
  }
  checks.push({width,geometry,selection:'all 7 Halloween, standard and older limited',interactions:'PVE/PVP save, isolated clear, keyboard/touch, readable active/pending'});
  await page.close();
 }
 assert.deepEqual(errors,[]);
 const report={checks,errors,writes:writes.map(({mode,mercenaryCode,revision})=>({mode,mercenaryCode,revision})),liveAccountWrites:0};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:checks.length,errors,out}));
}catch(error){
 fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,errors},null,2));
 for(const [index,page] of browser.contexts().flatMap(context=>context.pages()).entries()){
  await page.screenshot({path:path.join(out,'failure-'+index+'.png'),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(out,'failure-'+index+'.html'),await page.content());
 }
 throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const cb of cleanup)await cb();}
