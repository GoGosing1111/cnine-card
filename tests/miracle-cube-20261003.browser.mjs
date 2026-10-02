import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleMiracleCube,ensureMiracleCubeCatalog,saveMiraclePolicy} from '../functions/_miracle_cube.js';
import {MIRACLE_RANKS,MIRACLE_TOTAL,emptyMiraclePolicy} from '../shared/miracle-cube-policy-v1.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=process.env.MIRACLE_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'miracle-cube-qa-'));
fs.mkdirSync(out,{recursive:true});
const fixture=await mercenaryFixture(null),errors=[],checks=[];let openRequests=0,dropResponse=false;
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
await ensureMiracleCubeCatalog(fixture.env);await fixture.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'MIRACLE_CUBE',100,100)").run();
const picked=[];
fixture.document.mercenaries.forEach((card,index)=>{if(index<6){card.rank=MIRACLE_RANKS[index];picked.push(card);}else card.rank='C';});
await fixture.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(fixture.document)).run();
const policy=emptyMiraclePolicy();policy.ranks.SSS=MIRACLE_TOTAL;for(const card of picked)policy.cards[card.code]=MIRACLE_TOTAL;
await saveMiraclePolicy(fixture.env,fixture.user,{requestId:'miracle-browser-initial',revision:0,policy});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers),request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),route=url.pathname.slice(5);
   if(route==='miracle-cube/open')openRequests++;
   const response=await handleMiracleCube({path:route,request,env:fixture.env,deps:fixture.deps});
   if(response){if(route==='admin/miracle-cube'&&req.method==='PATCH')await new Promise(resolve=>setTimeout(resolve,300));if(dropResponse&&route==='miracle-cube/open'&&response.ok){dropResponse=false;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'검수: 지급 후 응답 유실',retryable:true}));return;}res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());return;}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(route==='shell/summary'?{avatarFeature:{visible:false},alchemyFeature:{visible:false}}:{visible:false}));return;
  }
  const name=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream'});fs.createReadStream(name).pipe(res);
 }catch(error){errors.push(error.message);res.writeHead(500);res.end('QA failed');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');const NativeAudio=window.Audio;window.qaAudio=[];window.Audio=class extends NativeAudio{constructor(src){super(src);window.qaAudio.push(this);this.qaPlayed=false;this.addEventListener('playing',()=>this.qaPlayed=true);}};});
  await page.goto(base+'/miracle-cube/',{waitUntil:'networkidle'});await page.locator('#owner-tools:not([hidden])').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(name==='desktop')check(await page.locator('#open-one').isDisabled(),'OFF disables opening');
  check(await page.locator('soop-adventure-lobby').count()===1,name+' shared navigation');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' no horizontal overflow');
  check(await page.locator('#closed-cube').evaluate(img=>img.complete&&img.naturalWidth>0),name+' cube art loaded');
  await page.screenshot({path:path.join(out,name+'-idle.png'),fullPage:true});
  if(name==='desktop')await page.locator('#sound').click();
  await page.locator('#preview').click();await page.locator('#opening-canvas:not([hidden])').waitFor();await page.waitForTimeout(1600);await page.screenshot({path:path.join(out,name+'-opening.png')});
  await page.locator('#result-dialog[open]').waitFor();check(await page.locator('#result-art').evaluate(img=>img.complete&&img.naturalWidth>0),name+' mercenary original art loads');
  check((await page.locator('#result-context').innerText()).includes('실제 지급 없음'),name+' preview is explicitly no grant');await page.screenshot({path:path.join(out,name+'-result.png')});await page.locator('[data-close="result-dialog"].mc-primary').click();
  if(name==='desktop'){check(openRequests===0,'preview does not call opening API');check(await page.evaluate(()=>qaAudio.length===3&&qaAudio.every(audio=>audio.qaPlayed&&!audio.error&&audio.paused&&audio.volume<=.22)),'three licensed sound stages decode, play and stop');await page.locator('#sound').click();}
  await page.locator('#probabilities').click();await page.locator('#rates-dialog[open]').waitFor();await page.screenshot({path:path.join(out,name+'-rates.png')});await page.locator('[data-close="rates-dialog"]').click();
  const admin=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});await admin.addInitScript(()=>localStorage.setItem('cnine_admin_token','local-account-7'));admin.on('pageerror',error=>errors.push(error.message));
  await admin.goto(base+'/admin/miracle-cube.html',{waitUntil:'networkidle'});await admin.locator('#cube-form:not([hidden])').waitFor();
  check(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' CMS no horizontal overflow');await admin.screenshot({path:path.join(out,name+'-cms.png'),fullPage:true});
  if(name==='desktop'){
   await admin.locator('[data-rank="SSS"]').fill('99');check(await admin.locator('#rank-total').innerText()==='99 / 100%','CMS total changes as typed');
   await admin.locator('#mode').selectOption('ON');check(await admin.locator('#save').isDisabled(),'CMS blocks ON with invalid total');
   await admin.locator('[data-rank="SSS"]').fill('100');await admin.locator('#save').click();check(await admin.locator('#cube-form').evaluate(form=>form.inert),'CMS protects draft edits during save');await admin.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('저장 완료'));
   await page.reload({waitUntil:'networkidle'});await page.locator('#open-one:not([disabled])').waitFor();
   dropResponse=true;await page.locator('#open-one').click();await page.locator('#recover:not([hidden]):not([disabled])').waitFor();const count=openRequests;
   check(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('cnine.miracle.pending:7'))),'uncertain response preserves account-bound receipt');
   await page.locator('#recover').click();await page.locator('#result-dialog[open]').waitFor();check(openRequests===count,'response recovery reads receipt without a second open');
   await page.locator('[data-close="result-dialog"].mc-primary').click();
  }
  await page.reload({waitUntil:'networkidle'});await page.locator('#open-ten:not([disabled])').waitFor();await page.locator('#open-ten').click();await page.locator('#skip:not([hidden])').waitFor();await page.locator('#skip').click();await page.locator('#result-dialog[open]').waitFor();
  check(await page.locator('#result-list button').count()===10,name+' ten results');await page.locator('#result-list button').last().click();check((await page.locator('#result-duplicate').innerText()).includes('중복'),name+' duplicate count shown');await page.screenshot({path:path.join(out,name+'-ten-results.png')});
  await page.locator('[data-close="result-dialog"].mc-primary').click();check(await page.locator('#opening-canvas').isHidden(),name+' animation cleaned after results');
  await admin.close();await page.close();
 }
 const reducedPage=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce',serviceWorkers:'block'});await reducedPage.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));await reducedPage.goto(base+'/miracle-cube/',{waitUntil:'networkidle'});await reducedPage.locator('#preview').click();await reducedPage.locator('#result-dialog[open]').waitFor();check(await reducedPage.locator('#opening-canvas').isHidden(),'reduced motion skips animation');await reducedPage.screenshot({path:path.join(out,'small-reduced-result.png')});await reducedPage.locator('[data-close="result-dialog"].mc-primary').click();check(await reducedPage.locator('#result-dialog').isHidden(),'320px result confirmation scrolls into view and closes');await reducedPage.close();
 const entry=await browser.newPage();await entry.goto(base+'/admin/miracle-cube.html',{waitUntil:'networkidle'});await entry.setContent('<nav id="nav"></nav><section id="view-dashboard"></section><div id="userDialog"><select id="inventoryItemCode"></select></div>');await entry.addScriptTag({type:'module',url:base+'/admin/miracle-cube-entry.mjs'});await entry.waitForFunction(()=>document.querySelector('#miracle-cube-cms-entry'));await entry.evaluate(()=>window.dispatchEvent(new CustomEvent('soop:cms-identity',{detail:{role:'OWNER'}})));check(await entry.locator('#miracle-cube-cms-entry').isVisible(),'CMS entry is independent of retired cube menu');check(await entry.locator('option[value="MIRACLE_CUBE"]').count()===1,'CMS adds new cube grant option');await entry.locator('#miracle-cube-cms-entry').click();check(new URL(entry.url()).pathname==='/admin/miracle-cube.html','CMS menu opens dedicated settings');await entry.close();
 check(errors.length===0,'no browser/server errors');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,out,checks,errors,openRequests},null,2));console.log(JSON.stringify({out,checks,errors,openRequests}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fixture.close();}
