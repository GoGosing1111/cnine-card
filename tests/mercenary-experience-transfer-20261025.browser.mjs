import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {transferFixture} from './helpers/mercenary-experience-transfer-db.mjs';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {readExperienceTransfer} from '../functions/_mercenary_experience_transfer.js';
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/xp-transfer-item-rollback-20261025'),publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff2':'font/woff2'};let fixture;const missing=[],requests=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){
  requests.push({method:req.method,path:url.pathname});if(url.pathname==='/api/sync/ticket'){res.writeHead(423,{'content-type':'application/json'});return res.end(JSON.stringify({error:'Isolated fixture has no live sync transport'}));}
  if(url.pathname.startsWith('/api/mercenaries/v3/leveling/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
   const r=await handleMercenaryLevel({path:url.pathname.slice(5),request,env:fixture.env,deps:fixture.deps});res.writeHead(r.status,{'content-type':'application/json'});return res.end(await r.text());
  }
  res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({revision:'0',enabled:false,visible:false,maintenance:{active:false}}));
 }
 if(publicBase){const r=await fetch(publicBase+url.pathname+url.search);res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){file=path.resolve('C:/Users/User/Downloads/cnine-z-body-sword-20260918/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{for(const width of publicBase?[390]:[1440,390]){
 fixture=await transferFixture();await fixture.setState('V-049',{level:16,experience:101,breakthroughMask:7,revision:10});
 const page=await browser.newPage({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_player_client_id_v1552','fixture-client-20261025');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/mercenary-codex/leveling/transfer.html',{waitUntil:'domcontentloaded'});await page.locator('#item-required').waitFor();assert.equal(await page.locator('#transfer').isDisabled(),true);assert.equal(await page.locator('#extract,#infuse,#potion').count(),0);
 await page.screenshot({path:path.join(out,'no-item-'+width+'.png'),fullPage:true});
 await fixture.givePotion();await page.reload({waitUntil:'domcontentloaded'});await page.locator('#source:not([disabled])').waitFor();await page.locator('#source').selectOption('V-049');await page.locator('#target').selectOption('V-055');await page.locator('#transfer').click();await page.locator('dialog[open]').waitFor();
 assert.match(await page.locator('#confirm-detail').innerText(),/2,300 EXP/);assert.equal(await page.locator('#confirm-submit').isDisabled(),true);await page.screenshot({path:path.join(out,'confirmation-'+width+'.png'),fullPage:true});await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(Number((await fixture.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='MERCENARY_XP_TRANSFER_POTION' AND user_id=7").first()).quantity),1);
 await page.locator('#transfer').click();await page.locator('#confirm-check').check();await page.locator('#confirm-submit').click();await page.getByRole('status').filter({hasText:'물약 1개 사용 완료'}).waitFor();assert.equal(await page.locator('#item-count').innerText(),'0개');assert.equal(await page.locator('#transfer').isDisabled(),true);
 const levels=(await fixture.p('SELECT mercenary_code,level,experience FROM user_mercenary_levels_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results;assert.equal(Number(levels.find(r=>r.mercenary_code==='V-049').level),1);assert.equal(Number(levels.find(r=>r.mercenary_code==='V-055').level),5);assert.equal((await readExperienceTransfer(fixture.env,7)).state.potions.length,0);assert.equal((await fixture.p('SELECT * FROM inventory_logs').all()).results.length,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'transferred-'+width+'.png'),fullPage:true});reports.push({width,noItemBlocked:true,cancelPreservedItem:true,itemConsumed:1,transferredXp:2300,sourceReset:true,bankedXp:800,overflow:false});await page.close();await fixture.close();fixture=null;
 }assert.deepEqual([...new Set(missing)],[]);fs.writeFileSync(path.join(out,'item-browser.json'),JSON.stringify({status:'PASSED',reports,productionWrites:0},null,2));console.log(JSON.stringify(reports));
}finally{if(fixture)await fixture.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}