import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {mercenaryAccountState,savePreparedMercenaryLoadout,releasedMercenaryFormations} from '../functions/_mercenary_account.js';
import {readMercenaryModes} from '../functions/_mercenary_loadout_modes.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
const root=process.cwd(),out=path.resolve(process.env.DUAL_ACCOUNT_QA_OUT),media=process.env.DUAL_QA_MEDIA_ROOT;
fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false}),writes=[],checks=[],errors=[];
for(const code of ['V-001','V-002','V-013','V-021','V-960'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',code,'2026-10-28','2026-10-28').run();

for(const [code,rank] of [['V-013','SS'],['V-021','SSS'],['V-046','SSS']])f.document.mercenaries.find(m=>m.code===code).rank=rank;
await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
const slots=async()=>(await readMercenaryModes(f.env,[7],{dual:true})).get(7).loadouts;
let lose=false;
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),key=url.pathname;
 if(key==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
 if(key==='/api/mercenaries/v3/state'){const state=await mercenaryAccountState(f.env,f.user),loadouts=await slots();return json(res,{...state,loadouts,loadout:loadouts.PVE});}
 if(key==='/api/mercenaries/v3/loadout'){let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);writes.push(body);const value=await savePreparedMercenaryLoadout(f.env,f.user,body);if(lose){lose=false;return json(res,{error:'응답 유실 검수'},503);}return json(res,value);}
 if(key==='/api/sync/ticket')return json(res,{error:'격리 검수: 외부 동기화 없음'},403);
 if(key.startsWith('/api/'))return json(res,{visible:false,enabled:false,items:[],user:{id:7,nickname:'검수'}});
 if(key==='/deck-test'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/mercenary-deck-slot.css"><body style="background:#080c17;color:white"><div><h2>PVE</h2><div id="battleDeck"></div></div><div><h2>PVP</h2><div id="pvpDeckSlots"></div></div><script type="module" src="/js/mercenary-deck-slot.mjs"></script>');}
 let file=path.resolve(root,'.'+decodeURIComponent(key));assert(file.startsWith(root+path.sep));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)&&media)file=path.resolve(media,path.relative(root,file));
 if(!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':mime});fs.createReadStream(file).pipe(res);
 }catch(error){console.log('FIXTURE_API',req.url,error.message);json(res,{error:error.message,code:error.code},error.status||400);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await f.p("DELETE FROM app_meta WHERE key LIKE 'mercenary_dual_loadout_v2:%'").run();
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_player_client_id_v1552','dual-account-ui-client-7');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'검수'}));});
  await page.goto(base+'/mercenary-codex/?view=owned&mode=PVE');try{await page.locator('[data-code="V-013"]').waitFor();}catch(error){console.log(JSON.stringify({label,errors,body:(await page.locator('body').innerText()).slice(0,1500)}));throw error;}
  const equip=async(code,mode,slot)=>{if(await page.locator('#closeInspection').isVisible())await page.locator('#closeInspection').click();await page.locator(`[data-code="${code}"]`).click();await page.locator(`[data-equip="${code}"][data-deploy-mode="${mode}"][data-deploy-slot="${slot}"]`).click();await page.waitForFunction(()=>!document.querySelector('[data-equip]:not(:disabled)')||!document.querySelector('[data-equip]').closest('.deployment-card').textContent.includes('저장 중'));await page.waitForFunction(()=>!localStorage.getItem('cnine.mercenary.pending:7'));};
  await equip('V-013','PVE',0);await equip('V-021','PVE',1);
  assert.deepEqual((await slots()).PVE.mercenaryCodes,['V-013','V-021']);
  await equip('V-001','PVP',0);await equip('V-002','PVP',1);
  assert.deepEqual((await slots()).PVP.mercenaryCodes,['V-001','V-002']);
  await equip('V-960','PVE',1);assert.deepEqual((await slots()).PVE.mercenaryCodes,['V-013','V-021']);assert.match(await page.locator('#toast').textContent(),/SS/);
  await page.reload();await page.locator('[data-current-mode="PVE"] strong').waitFor();assert.match(await page.locator('[data-current-mode="PVE"] strong').textContent(),/·/);
  await page.locator('[data-code="V-021"]').click();await page.locator('.deployment-card').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-selection.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(await page.locator('#closeInspection').isVisible())await page.locator('#closeInspection').click();await page.locator('[data-code="V-002"]').click();lose=true;
  await page.locator('[data-equip="V-002"][data-deploy-mode="PVE"][data-deploy-slot="1"]').click();await page.locator('[data-recover-loadout]:not(:disabled)').waitFor();
  await page.reload();await page.locator('[data-code="V-002"]').click();await page.locator('[data-recover-loadout]').click();await page.waitForFunction(()=>!localStorage.getItem('cnine.mercenary.pending:7'));
  assert.equal(writes.at(-1).requestId,writes.at(-2).requestId);assert.deepEqual((await slots()).PVE.mercenaryCodes,['V-013','V-002']);
  const formation=(await releasedMercenaryFormations(f.env,[7],'PVE',{dual:true})).get(7);assert.equal(formation.mercenaries.length,2);
  await page.goto(base+'/deck-test');await page.waitForFunction(()=>document.querySelector('[data-mercenary-deck-slot="PVE"]')?.textContent.includes('2/2'));assert.equal(await page.locator('[data-mercenary-deck-slot="PVE"] img').count(),2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,label+'-deck.png'),fullPage:true});checks.push({label,pairSave:true,rankLimit:true,reload:true,lostResponseReplay:true,deckPair:true});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,isolatedDb:true,productionWrites:0},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const cb of cleanup)await cb();}
