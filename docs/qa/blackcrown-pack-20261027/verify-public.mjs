import {htmlForStore} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/functions/_onestore_web.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/scripts/prepare-production-assets.mjs';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',out=path.join(root,'docs/qa/blackcrown-pack-20261027/public'),base='https://cnine-card.pages.dev';fs.mkdirSync(out,{recursive:true});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const files=execFileSync('git',['diff','--name-only','d929e8b6ca4aa89704f99f8dc4d5625f0653e4fe','36f3dcb06'],{cwd:root,encoding:'utf8',maxBuffer:32e6}).trim().split('\n').filter(f=>isProductionFile(f)&&!f.startsWith('functions/')&&!f.startsWith('workers/'));
const verified=[];
for(const file of files){const response=await fetch(base+'/'+file+'?qa=blackcrown-36f3dcb06',{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,file);const bytes=Buffer.from(await response.arrayBuffer());const original=fs.readFileSync(path.join(root,file)),expected=file==='onestore/index.html'?Buffer.from(htmlForStore(original.toString('utf8'),'/')):original;assert.equal(hash(bytes),hash(expected),file);verified.push({file,sha256:hash(bytes),bytes:bytes.length,verification:file==='onestore/index.html'?'EXISTING_SERVER_HTML_TRANSFORM':'EXACT_BYTES'});}
const read=async endpoint=>{const r=await fetch(base+'/api/'+endpoint,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,endpoint);return r.json();};
const feature=await read('mercenaries/v3/blackcrown-pack/feature'),packs=await read('packs');
assert.equal(feature.userOpeningEnabled,true);assert.equal(feature.settings.mode,'ON');assert.deepEqual(feature.settings.prices,{single:1500000000,ten:15000000000});assert.equal(feature.personalOddsKnown,false);assert.equal(feature.ownedDistinctCount,0);
const ss=feature.stock.filter(r=>/^V-95[0-5]$/.test(r.code));assert.equal(ss.length,6);assert(ss.every(r=>r.limit===65&&r.issued>=0));
const rows=Array.isArray(packs)?packs:packs.packs,row=rows.find(r=>r.id==='mercenary-blackcrown-ss-limited');assert(row?.drawEnabled);assert.equal(row.name,'블랙크라운팩');
const cms=await fetch(base+'/api/admin/mercenaries/blackcrown-pack');assert([401,403].includes(cms.status));
fs.writeFileSync(path.join(out,'http.json'),JSON.stringify({checkedAt:new Date().toISOString(),source:'36f3dcb06',files:verified,feature:{revision:feature.revision,mode:feature.settings.mode,prices:feature.settings.prices,ownershipRule:feature.ownershipRule,personalOddsKnown:feature.personalOddsKnown,stock:feature.stock},anonymousCmsStatus:cms.status,productionWrites:0},null,2));
console.log(JSON.stringify({verifiedFiles:verified.length,featureEnabled:true,ss,anonymousCmsStatus:cms.status}));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'}),page=await context.newPage(),assetFailures=[],errors=[];
  page.setDefaultTimeout(20000);page.on('response',r=>{if(r.status()>=400&&/blackcrown|black-crown/.test(r.url()))assetFailures.push({url:r.url(),status:r.status()});});page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const request=route.request();return ['GET','HEAD'].includes(request.method())&&new URL(request.url()).origin===base?route.continue():route.abort();});
  await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/offline.html?qa=blackcrown-36f3dcb06',{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(async()=>{document.body.innerHTML='';document.body.style.background='#090a0d';const {mountBlackcrownPack}=await import('/js/mercenary-blackcrown-pack-live.bundle.mjs?v=20261027-v1');await mountBlackcrownPack({accountId:0,getAccountId:()=>0,api:async(endpoint,options={})=>{if(options.method&&options.method!=='GET')throw Error('Read-only public verification');const r=await fetch('/api/'+endpoint,{method:'GET'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}});});
  await page.waitForFunction(()=>document.querySelector('[data-bcp-availability]').textContent.includes('개봉 가능'));
  assert.equal(await page.locator('#bcp-title').innerText(),'블랙크라운팩');assert.match(await page.locator('[data-bcp-ownership]').innerText(),/로그인 후/);assert.equal(await page.locator('.bcp-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.locator('.bcp-dialog').evaluate(e=>e.scrollTop=0);await page.locator('.bcp-dialog').screenshot({path:path.join(out,'room-'+width+'.png')});await page.locator('[data-bcp-close]').click();assert.deepEqual(assetFailures,[]);assert.deepEqual(errors,[]);
  reports.push({width,mode:'DIRECT_PUBLIC_MODULE_READ_ONLY',room:true,anonymousPersonalOddsHidden:true,assetFailures,observedPageErrors:errors,productionWrites:0});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checkedAt:new Date().toISOString(),reports,productionWrites:0},null,2));console.log(JSON.stringify(reports));
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}throw error;}finally{await browser.close();}
