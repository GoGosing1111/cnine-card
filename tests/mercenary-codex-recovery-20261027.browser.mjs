import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {mercenaryAccountState,saveMercenaryLoadout,releasedMercenarySnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.QA_OUT;
fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false}),user={...f.user,role:'USER'};
for(const code of ['V-001','V-002'])await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:crypto.randomUUID()}));
const writes=[],checks=[],errors=[],publicBase=process.env.QA_PUBLIC_BASE||'';
const publicCatalog=publicBase?await fetch(publicBase+'/api/mercenary-codex').then(r=>r.json()):null;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const key=new URL(req.url,'http://127.0.0.1').pathname;
 if(key.startsWith('/api/sync/'))return json(res,{error:'Isolated QA has no live account socket'},401);
 if(key==='/api/mercenary-codex')return json(res,publicCatalog||mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
 if(key==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(f.env,user));
 if(key==='/api/mercenaries/v3/loadout'){let data='';for await(const part of req)data+=part;const body=JSON.parse(data);writes.push(body);const result=await saveMercenaryLoadout(f.env,user,body);return json(res,result);}
 if(key.startsWith('/api/'))return json(res,{visible:false,enabled:false,items:[],user:{id:7,nickname:'검수 계정'}});
 if(publicBase){const r=await fetch(publicBase+req.url);res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
 let file=path.resolve(root,'.'+decodeURIComponent(key));if(!file.startsWith(root))throw Error('path');if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message,code:e.code},e.status||500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [label,viewport] of (publicBase?[['mobile',{width:390,height:844}]]:[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])){
  await f.p('DELETE FROM user_mercenary_loadout_v1').run();await f.p("DELETE FROM app_meta WHERE key LIKE 'mercenary_pvp_loadout_v1:%'").run();
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.message));page.on('response',async r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&!new URL(r.url()).pathname.startsWith('/api/sync/')&&r.status()>=400)console.error('QA API '+r.status()+' '+new URL(r.url()).pathname+' '+(await r.text()).slice(0,500));});
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.addInitScript(()=>{localStorage.setItem('cnine_player_client_id_v1552','isolated-loadout-20261027');localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'편성 검수'}));});
  await page.goto(base+'/mercenary-codex/?view=owned&mode=PVE',{waitUntil:'domcontentloaded'});
  await page.locator('[data-code="V-001"]').waitFor({timeout:10000}).catch(async e=>{console.error(JSON.stringify({body:(await page.locator('body').innerText()).slice(0,1800),errors}));throw e;});
  const choose=async code=>{if(await page.locator('#inspectionSheet').evaluate(e=>e.open))await page.locator('#closeInspection').click();await page.locator(`[data-code="${code}"]`).click();};
  for(const [mode,code] of [['PVE','V-001'],['PVP','V-002']]){
   await choose(code);const button=page.locator(`[data-equip="${code}"][data-deploy-mode="${mode}"]`);assert(await button.isEnabled());
   await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/mercenaries/v3/state'),button.click()]);
   assert.equal((await releasedMercenarySnapshot(f.env,user,mode)).code,code);
   checks.push({label,mode,code,saved:true});
  }
  await page.reload();await page.locator('[data-code="V-001"]').waitFor({timeout:10000}).catch(async e=>{console.error(JSON.stringify({body:(await page.locator('body').innerText()).slice(0,1800),errors}));throw e;});
  assert.equal((await releasedMercenarySnapshot(f.env,user,'PVE')).code,'V-001');assert.equal((await releasedMercenarySnapshot(f.env,user,'PVP')).code,'V-002');
  await choose('V-002');await page.screenshot({path:path.join(out,label+'-loadout.png'),fullPage:label==='desktop'});
  assert(!await page.locator('#cardGrid').innerText().then(t=>t.includes('불러오지 못했습니다')));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  checks.push({label,reloadPreservesBothModes:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(writes.length,publicBase?2:4);
 const report={checks,writes:writes.map(w=>({mode:w.mode,code:w.mercenaryCode})),errors,publicAssets:publicBase||null,productionAccountWrites:0};
 fs.writeFileSync(path.join(out,'loadout-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();}
