// Read-only local fixture; serves the real codex unchanged. No account/CMS writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.env.EUNSEOL_QA_ROOT||fileURLToPath(new URL('..',import.meta.url));
const out=process.env.EUNSEOL_QA_OUTPUT||path.join(root,'docs/qa/eunseol-live-20261023');
const {mercenaryCodexDocument}=await import(pathToFileURL(path.join(root,'functions/_mercenary_codex.js')));
const {MERCENARY_CMS_SEED}=await import(pathToFileURL(path.join(root,'functions/_mercenary_cms_seed.js')));
fs.mkdirSync(out,{recursive:true});
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
const card=catalog.cards.find(c=>c.code==='V-973');assert(card);assert.equal(card.name,'은설');assert.equal(card.edition,'LIMITED');assert.equal(card.acquisitionEnabled,false);
const empty={mercenaryCode:null,revision:0};
const account={accountId:7,cards:[],available:true,coin:'0',loadout:empty,loadouts:{PVE:empty,PVP:empty},leveling:{enabled:true},deployment:{enabled:true}};
const requests=[],checks=[],errors=[],missing=[];
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/')){
  requests.push({method:req.method,path:url.pathname,blockedWrite:req.method!=='GET'});
  if(req.method!=='GET')return json(res,{error:'Read-only QA'},405);
  if(url.pathname==='/api/mercenary-codex')return json(res,catalog);
  if(url.pathname==='/api/mercenaries/v3/state')return json(res,account);
  return json(res,{items:[],visible:false,enabled:false});
 }
 const relative=decodeURIComponent(url.pathname).replace(/^\/+/,''),base=path.resolve(root),filePath=path.resolve(base,relative);
 if(!filePath.startsWith(base+path.sep)&&filePath!==base){res.writeHead(403);return res.end('Forbidden');}
 let file=filePath;if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){missing.push(url.pathname);res.writeHead(404);return res.end('Not found');}
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){errors.push(e.stack);json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});
  page.on('pageerror',e=>errors.push(label+': '+e.stack));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-read-only-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'로컬 검수'}));});
  await page.goto(base+'/mercenary-codex/?view=limited&q='+encodeURIComponent('은설'),{waitUntil:'networkidle'});
  const entry=page.locator('[data-code="V-973"]');await entry.waitFor({state:'visible'});
  assert.equal(await page.locator('#limitedView').getAttribute('aria-selected'),'true');
  assert.match(await entry.innerText(),/은설/);assert.match(await entry.innerText(),/SSS/);
  await entry.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:path.join(out,label+'-codex-limited.png'),fullPage:true});
  await entry.click();await page.locator('.stage-heading h2').waitFor({state:'visible'});
  assert.equal(await page.locator('.stage-heading h2').innerText(),'은설');
  await page.locator('#portraitDisplay img').first().evaluate(img=>img.decode());
  await page.screenshot({path:path.join(out,label+'-codex-art.png'),fullPage:true});
  await page.locator('.combat-details > summary').click();
  const panel=page.locator('.combat-panel');await panel.waitFor({state:'visible'});
  const text=await panel.innerText();
  assert.match(text,/은설/);assert.match(text,/LIMITED EDITION/);assert.match(text,/SSS/);assert.match(text,/1,940,890/);assert.match(text,/획득 잠금|현재 획득 불가/);assert.match(text,/설백월참·백호천류·만월검역/);
  assert.equal(await page.locator('.skill-list > *').count(),1);
  assert.equal(await page.locator('[data-equip="V-973"]').count(),0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  await page.locator('.combat-panel .power-summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,label+'-codex-combat.png'),fullPage:true});
  await page.locator('#sdTab').click();await page.locator('#portraitDisplay img').first().evaluate(img=>img.decode());
  const sd=await page.locator('#portraitDisplay img').first().getAttribute('src');assert.match(sd,/eunseol-20261023\/idle\.png/);
  await page.screenshot({path:path.join(out,label+'-codex-sd.png'),fullPage:true});
  checks.push({label,viewport,limitedTab:true,name:'은설',rank:'SSS',edition:'LIMITED',basePower:1940890,acquisitionLocked:true,unowned:true,equipButton:false,skillCount:1,variants:['설백월참','백호천류','만월검역'],overflow,sourceArt:card.sourceArt,battleSprite:sd});
  await page.close();console.log(label+' codex PASS');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert(requests.filter(r=>r.method!=='GET').every(r=>r.blockedWrite));
 const result={status:'PASS',fixture:'Read-only local API projection from actual server code; unchanged production codex UI',checks,errors,missing,requests};
 fs.writeFileSync(path.join(out,'codex-browser-report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
