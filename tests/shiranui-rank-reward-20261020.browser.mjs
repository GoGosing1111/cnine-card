import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {ensureAccountRank,SHIRANUI_MIN_RANK_TICKS} from '../functions/_account_rank.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.SHIRANUI_QA_DIR||'C:/Users/User/.codex/tmp/shiranui-rank-20261020/browser';
fs.mkdirSync(out,{recursive:true});const cleanup=[],f=await mercenaryFixture({after:fn=>cleanup.push(fn)},{postgres:true});
await ensureAccountRank(f.env);await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(7,?,1,0,?,?)','V-987','QA','QA').run();
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1});
const json=(res,v,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(v));};
let scenario='unowned';
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/mercenary-codex')return json(res,catalog);
 if(url.pathname==='/api/mercenaries/v3/state'){const state=await mercenaryAccountState(f.env,f.user);if(scenario==='unowned')state.cards=[];return json(res,state);}
 if(url.pathname==='/api/mercenaries/v3/loadout'){const chunks=[];for await(const c of req)chunks.push(c);return json(res,await saveMercenaryLoadout(f.env,f.user,JSON.parse(Buffer.concat(chunks))));}
 if(url.pathname.startsWith('/api/'))return json(res,{items:[],enabled:false,visible:false});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){json(res,{error:e.message},e.status||500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','isolated-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'검수 계정 7'}));});
  for(scenario of ['unowned','below','eligible']){
   await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(7,?) ON CONFLICT(user_id) DO UPDATE SET total_ticks=excluded.total_ticks',SHIRANUI_MIN_RANK_TICKS-(scenario==='eligible'?0:1)).run();
   await page.goto(base+'/mercenary-codex/?view=limited&q=V-987#V-987');await page.locator('[data-code="V-987"]').click();await page.locator('.deployment-card').waitFor();
   const text=await page.locator('.combat-panel').innerText();assert.match(text,/중장\(Lv.235\)/);assert.match(text,/메시지/);assert(!text.includes('지정 계정 전용'));
   if(scenario==='below')assert(await page.locator('[data-equip="V-987"]').isDisabled());
   if(scenario==='eligible')for(const mode of ['PVE','PVP']){await page.locator(`[data-loadout-mode="${mode}"]`).click();if(await page.locator('[data-unequip]').count()){await page.locator('[data-unequip]').click();await page.waitForFunction(()=>!document.querySelector('[data-equip="V-987"]')?.disabled);}await page.locator('[data-equip="V-987"]').click();await page.locator('[data-unequip]').waitFor();}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,`${width}-${scenario}.png`),fullPage:true});checks.push({width,scenario,rankRequirement:true,overflow:false});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const close of cleanup)await close();}
