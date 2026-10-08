import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {mercenaryAccountState,saveMercenaryLoadout,releasedMercenarySnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.MERCENARY_MODE_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'mercenary-loadout-modes-'));
fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false}),user={...f.user,role:'USER'};
for(const code of ['V-001','V-002'])await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:crypto.randomUUID()}));
await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)','V-996','2026-10-09','2026-10-09').run();
const writes=[],checks=[],errors=[];let loseResponse=false;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const key=new URL(req.url,'http://127.0.0.1').pathname;
 if(key==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
 if(key==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(f.env,user));
 if(key==='/api/mercenaries/v3/loadout'){let data='';for await(const part of req)data+=part;const body=JSON.parse(data);writes.push(body);const result=await saveMercenaryLoadout(f.env,user,body);if(loseResponse){loseResponse=false;return json(res,{error:'응답 재확인 테스트'},503);}return json(res,result);}
 if(key.startsWith('/api/'))return json(res,{visible:false,enabled:false,items:[],user:{id:7,nickname:'검수 계정'}});
 if(key==='/deck-test'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/mercenary-deck-slot.css"><body style="background:#080c17;color:white"><h1>전투별 용병 슬롯</h1><div><h2>PVE</h2><div id="battleDeck"></div></div><div><h2>PVP</h2><div id="pvpDeckSlots"></div></div><script type="module" src="/js/mercenary-deck-slot.mjs"></script>');}
 let file=path.resolve(root,'.'+decodeURIComponent(key));if(!file.startsWith(root))throw Error('path');if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message,code:e.code},e.status||500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await f.p('DELETE FROM user_mercenary_loadout_v1').run();await f.p("DELETE FROM app_meta WHERE key LIKE 'mercenary_pvp_loadout_v1:%'").run();
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'검수 계정'}));});
  await page.goto(base+'/mercenary-codex/?view=owned&mode=PVE');await page.locator('[data-equip="V-001"]').waitFor();
  const mode=async value=>{await page.locator(`[data-loadout-mode="${value}"]`).click();assert.equal(await page.locator(`[data-loadout-mode="${value}"]`).getAttribute('aria-pressed'),'true');};
  const equip=async code=>{await page.locator(`[data-code="${code}"]`).click();await page.locator(`[data-equip="${code}"]`).click();await page.waitForFunction(()=>!!document.querySelector('[data-unequip]:not(:disabled)'));};
  await equip('V-001');await mode('PVP');await equip('V-996');
  assert.equal((await releasedMercenarySnapshot(f.env,user,'PVE')).code,'V-001');assert.equal((await releasedMercenarySnapshot(f.env,user,'PVP')).code,'V-996');
  await page.reload();await page.locator('[data-unequip]:not(:disabled)').waitFor();assert.equal(new URL(page.url()).searchParams.get('mode'),'PVP');
  await page.locator('.loadout-modes').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-separate.png'),fullPage:true});await page.screenshot({path:path.join(out,label+'-mode-controls.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await equip('V-001');await mode('PVE');await page.locator('[data-unequip]').click();await page.waitForFunction(()=>document.getElementById('loadoutPVE').textContent==='미편성');assert.equal((await releasedMercenarySnapshot(f.env,user,'PVP')).code,'V-001');
  await equip('V-002');await mode('PVP');await page.locator('[data-code="V-996"]').click();loseResponse=true;await page.locator('[data-equip="V-996"]').click();await page.locator('[data-loadout-mode="PVE"]:not(:disabled)').waitFor();
  await page.goto(base+'/mercenary-codex/?view=owned&mode=PVE#V-002');await page.locator('[data-recover-loadout]').click();await page.waitForFunction(()=>!localStorage.getItem('cnine.mercenary.pending:7'));
  assert.equal(writes.at(-1).mode,'PVP');assert.equal(writes.at(-1).requestId,writes.at(-2).requestId);
  assert.equal((await releasedMercenarySnapshot(f.env,user,'PVE')).code,'V-002');assert.equal((await releasedMercenarySnapshot(f.env,user,'PVP')).code,'V-996');
  await page.goto(base+'/deck-test');await page.waitForFunction(()=>globalThis.MercenaryDeckSlot?.power('PVP')>0);
  const state=await mercenaryAccountState(f.env,user);for(const m of ['PVE','PVP']){const card=state.cards.find(c=>c.code===state.loadouts[m].mercenaryCode),host=page.locator(`[data-mercenary-deck-slot="${m}"]`);assert.ok((await host.textContent()).includes(card.name));assert.equal(await page.evaluate(m=>MercenaryDeckSlot.power(m),m),card.basePower);assert.ok((await host.locator('a').getAttribute('href')).endsWith('mode='+m));}
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-mercenary-deck-slot] img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:path.join(out,label+'-deck-slots.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  checks.push(label+': independent selection, one-copy reuse, clear isolation, reload, cross-mode receipt recovery, mode-specific deck power and link, no overflow');await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({checks,writes: writes.map(w=>({mode:w.mode,code:w.mercenaryCode,revision:w.revision})),errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const cb of cleanup)await cb();}
