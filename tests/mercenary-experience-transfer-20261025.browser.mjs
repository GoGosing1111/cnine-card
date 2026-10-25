import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {transferFixture} from './helpers/mercenary-experience-transfer-db.mjs';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {readExperienceTransfer} from '../functions/_mercenary_experience_transfer.js';
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/mercenary-experience-transfer-20261025'),publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff2':'font/woff2'};let fixture;const missing=[],requests=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){
  requests.push({method:req.method,path:url.pathname});
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
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const width of publicBase?[390]:[1440,390]){
  fixture=await transferFixture();fixture.policy.milestones.forEach(m=>m.successChancePpm=1000000);await fixture.setting('mercenary_level_policy_v1',fixture.policy);await fixture.setState('V-049',{level:16,experience:101,breakthroughMask:7,revision:10});
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));
  await page.goto(origin+'/mercenary-codex/leveling/transfer.html?code=V-049',{waitUntil:'domcontentloaded'});try{await page.locator('#extract:enabled').waitFor();}catch(e){await page.screenshot({path:path.join(out,'load-error-'+width+'.png'),fullPage:true});throw Error(`${width}: ${await page.locator('#transfer-app').innerText()} / ${errors.join(', ')} / ${e.message}`);}
  const image=await page.locator('.transfer-hero img').evaluate(async el=>{await el.decode();return {width:el.naturalWidth,height:el.naturalHeight};});assert.equal(image.width,512);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const style=await page.locator('#extract').evaluate(el=>({text:getComputedStyle(el).color,image:getComputedStyle(el).borderImageSource,height:el.getBoundingClientRect().height}));assert.equal(style.text,'rgb(24, 36, 10)');assert(style.image.includes('action-user-approved.webp'));assert(style.height>=48);
  await page.screenshot({path:path.join(out,'transfer-'+width+'.png'),fullPage:true});
  await page.locator('#extract').click();await page.locator('#transfer-confirm[open]').waitFor();assert.equal(await page.locator('#confirm-submit').isDisabled(),true);assert.match(await page.locator('#confirm-detail').innerText(),/2,300 EXP/);assert.match(await page.locator('#confirm-detail').innerText(),/Lv.1 · EXP 0/);
  await page.screenshot({path:path.join(out,'extract-confirm-'+width+'.png')});await page.locator('#confirm-check').check();await page.locator('#confirm-submit').click();await page.waitForFunction(()=>document.querySelector('.transfer-notice')?.textContent.includes('보관했습니다'));
  assert.equal((await readExperienceTransfer(fixture.env,7)).state.potions.length,1);
  assert.equal(await page.locator('#target option[value="V-996"]').evaluate(el=>el.disabled),true);assert.equal(await page.locator('#target option[value="V-001"]').evaluate(el=>el.disabled),true);
  await page.locator('#target').selectOption('V-055');await page.locator('#infuse').click();await page.locator('#transfer-confirm[open]').waitFor();assert.match(await page.locator('#confirm-detail').innerText(),/보관 800 EXP/);await page.locator('#confirm-check').check();await page.locator('#confirm-submit').click();await page.waitForFunction(()=>document.querySelector('.transfer-notice')?.textContent.includes('1회 사용 완료'));
  await page.reload();await page.locator('#extract:enabled').waitFor();assert.equal((await readExperienceTransfer(fixture.env,7)).state.potions.length,0);assert.match(await page.locator('.transfer-bank').innerText(),/800 EXP/);
  await page.goto(origin+'/mercenary-codex/leveling/?code=V-055',{waitUntil:'domcontentloaded'});await page.locator('#breakthrough:enabled').waitFor();await page.locator('#breakthrough').click();await page.locator('.break-skip').click();await page.locator('.break-continue').waitFor();assert.match(await page.locator('.break-result-note').innerText(),/800 EXP/);await page.locator('.break-continue').click();await page.waitForFunction(()=>document.querySelector('.level-display strong')?.textContent==='Lv.8');
  await page.getByRole('link',{name:'경험치 50% 이전 물약'}).click();await page.locator('#extract:enabled').waitFor();assert.match(await page.locator('.transfer-profile').first().innerText(),/물약 1회 사용 완료/);
  await page.locator('#extract').click();await page.locator('#transfer-confirm[open]').waitFor();assert.match(await page.locator('#confirm-detail').innerText(),/1,150 EXP/);await page.locator('#confirm-check').check();await page.locator('#confirm-submit').click();await page.waitForFunction(()=>document.querySelector('.transfer-notice')?.textContent.includes('보관했습니다'));
  assert.equal(await page.locator('#target option[value="V-055"]').evaluate(el=>el.disabled),true);assert.match(await page.locator('#target option[value="V-055"]').innerText(),/1회 사용 완료/);
  await page.screenshot({path:path.join(out,'used-after-reset-'+width+'.png'),fullPage:true});assert.deepEqual(errors,[]);
  reports.push({width,art:image,button:style,extractXp:2300,infuseAppliedXp:1500,reserveXp:800,breakthroughLevel:8,reextractXp:1150,onceSurvivesReset:true,wrongRanksDisabled:true,noHorizontalOverflow:true});console.log(width+' extraction, infusion, reserve breakthrough, reload and permanent once limit PASS');await page.close();await fixture.close();fixture=null;
 }
 assert.deepEqual([...new Set(missing)],[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',assets:publicBase||'local',api:'real handler, isolated SQLite fixture',productionWrites:0,reports,requests},null,2));
}finally{if(fixture)await fixture.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
