import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {ensureMineSchema,ensureMineCatalog,handleMasterStarMine} from '../functions/_master_star_mine.js';
import {ensureJointTransactionSchema} from '../functions/_joint_transactions.js';
import {MINE_KEY,MINE_DRILLS,MINE_DURATION_MS,emptyMinePolicy} from '../shared/master-star-mine-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.env.MINE_QA_OUTPUT||root+'/../../qa-master-star-mine-20261003');
await mkdir(out,{recursive:true});const f=await jointFixture();await ensureJointTransactionSchema(f.env);await ensureMineSchema(f.env);await ensureMineCatalog(f.env);
await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('MASTER_STAR','마스터의 별','SPECIAL','/star.svg')").run();
await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,'MASTER_STAR',123450)").run();
let policy=emptyMinePolicy();await f.setting(MINE_KEY,{revision:0,policy});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);
 if(path.startsWith('/api/')){
  if(path==='/api/shell/summary'||path==='/api/events/golden-axe/feature'){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await handleMasterStarMine({path:path.slice(5),env:f.env,deps:f.deps,request:new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})})});
  res.writeHead(response?.status||404,{'content-type':'application/json','cache-control':'no-store'});res.end(response?await response.text():'{}');return;
 }
 if(path==='/mine-cms-qa'){res.writeHead(200,{'content-type':'text/html'});res.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/master-star-mine-admin.css"><style>body{background:#080c17;color:white;font-family:Arial,sans-serif;margin:20px}main{max-width:1200px;margin:auto}</style><main id="cms-test" class="mine-cms"></main><script type="module">import {mountMineCms} from "/admin/master-star-mine-admin.mjs";await mountMineCms(document.getElementById("cms-test"));</script></html>');return;}
 const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(resolve(root)+sep)||/(^|[/\\])\./.test(path)){res.writeHead(403);res.end();return;}
 const content=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(content);
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500,{'content-type':'text/plain'});res.end(error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1080}],['mobile',{width:390,height:844}]]){
  await f.p('DELETE FROM master_star_mine_runs_v1').run();policy=emptyMinePolicy();await f.setting(MINE_KEY,{revision:0,policy});
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'광산 검수 계정',masterStars:123450}));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/master-star-mine/',{waitUntil:'networkidle'});await page.locator('#mineMode').filter({hasText:'개장 준비 중'}).waitFor();
  assert.equal(await page.locator('#mineAction').isDisabled(),true);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+name+'-pending.png',fullPage:true});
  policy={...policy,mode:'TEST',testUserIds:[7],acquisition:'CMS',acquisitionNotice:'보유한 드릴로 마스터의 별을 채굴하세요.'};await f.setting(MINE_KEY,{revision:1,policy});
  for(const drill of MINE_DRILLS)await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,1) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=1',drill.code).run();
  await page.locator('#mineRefresh').click();await page.locator('#mineMode').filter({hasText:'채굴 가능'}).waitFor();
  await page.locator('[data-drill="MINE_GOLDEN_DRILL"]').click();assert.equal(await page.locator('#mineReward').textContent(),'30,000');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+name+'-ready.png',fullPage:true});
  await page.locator('#mineAction').click();await page.locator('#stageStatus').filter({hasText:'채굴 중'}).waitFor();await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#stageDrillName').textContent(),'황금드릴');assert.equal(await page.locator('[data-drill="MINE_ELECTRIC_DRILL"]').isDisabled(),true);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+name+'-mining.png',fullPage:true});
  const at=Date.now()-1000;await f.p('UPDATE master_star_mine_runs_v1 SET started_at_ms=?,ready_at_ms=? WHERE user_id=7 AND claimed_at_ms IS NULL',at-MINE_DURATION_MS,at).run();
  await page.locator('#mineRefresh').click();await page.locator('#mineAction').filter({hasText:'보상 수령하기'}).waitFor();await page.locator('#mineAction').click();await page.locator('.mine-history-row').waitFor();assert.match(await page.locator('#mineHistory').textContent(),/30,000/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  const broken=await page.locator('main img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
  await page.goto(base+'/mine-cms-qa',{waitUntil:'networkidle'});await page.locator('[data-revision]').filter({hasText:'r1'}).waitFor();await page.locator('input[name=MINE_ELECTRIC_DRILL]').fill('6000');await page.locator('.mine-cms-policy button[type=submit]').click();await page.locator('[data-revision]').filter({hasText:'r2'}).waitFor();assert.match(await page.locator('[role=status]').textContent(),/저장 완료/);
  await page.locator('.mine-cms-lookup input').fill('7');await page.locator('.mine-cms-lookup button').click();await page.locator('.mine-cms-user').waitFor();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+name+'-cms.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);results.push({name,overflow:false,brokenImages:0,pageErrors:errors,verified:['OFF state','drill selection','start','reload persistence','4h completion','claim','CMS reward save','CMS account lookup']});await context.close();
 }
 await writeFile(out+'/qa.json',JSON.stringify({date:'2026-10-03',source:'actual production page + actual handlers + isolated SQLite, no live rewards',results},null,2));console.log(JSON.stringify({out,results},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));await f.close();}
