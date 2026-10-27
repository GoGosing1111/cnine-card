import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {htmlForStore} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/functions/_onestore_web.js';
import {readBlackcrownPackState} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/functions/_mercenary_blackcrown_pack.js';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',out='C:/Users/User/.codex/visualizations/2026/10/27/01a17ab9-a03a-79f2-bb14-19ce5c1ac967/blackcrown-buttons-final-public',base='https://cnine-card.pages.dev';fs.mkdirSync(out,{recursive:true});assert(process.env.BC_PAGES);
const require=createRequire(root+'/package.json'),hash=b=>createHash('sha256').update(b).digest('hex');
const files=['index.html','js/app.js','service-worker.js','admin/index.html','admin/mercenary-admin-v1.js','admin/mercenary-blackcrown-admin-v1.bundle.mjs','css/mercenary-blackcrown-pack.bundle.css','js/mercenary-blackcrown-pack-live.bundle.mjs','onestore/index.html','onestore/js/app.js',...['blackcrown-vault-v2.webp','button-crown-gold-v3.webp','button-crown-obsidian-v3.webp'].map(f=>'assets/ui/packs/black-crown-20261027-v1/'+f)];
const verified=[];for(const f of files){const r=await fetch(base+'/'+f+'?qa=blackcrown-buttons-84c41277d',{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,f);const bytes=Buffer.from(await r.arrayBuffer()),local=fs.readFileSync(path.join(root,f)),expected=f==='onestore/index.html'?Buffer.from(htmlForStore(local.toString(),'/')):local;assert.equal(hash(bytes),hash(expected),f);verified.push({file:f,sha256:hash(bytes),bytes:bytes.length});}
const r=await fetch(base+'/api/mercenaries/v3/blackcrown-pack/feature',{signal:AbortSignal.timeout(30000)}),publicBody=await r.json();let feature;
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new (require('pg').Client)({connectionString,application_name:'blackcrown-public-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const DB={dialect:'postgres',prepare(sql){assert.match(sql.trim(),/^SELECT\b/,'Only SELECT permitted');let n=0;const query=sql.replace(/\?/g,()=>'$'+(++n)),rows=async args=>JSON.parse(JSON.stringify((await db.query(query,args)).rows));const bound=(args=[])=>({bind:(...values)=>bound(values),first:async()=>(await rows(args))[0]||null,all:async()=>({results:await rows(args)})});return bound();}};
 const {rawPack,stockScheduleHistory,...safe}=await readBlackcrownPackState({DB});feature={...safe,id:safe.pack.id,name:safe.pack.name,packSettings:safe.settings};
 assert.equal(feature.settings.mode,'OFF');assert.equal(feature.userOpeningEnabled,false);assert.equal(feature.stock.length,6);assert(feature.stock.every(s=>s.limit===10&&s.issued===0));for(const code of ['V-978','V-974','V-975','V-973'])assert(!Object.hasOwn(feature.settings.cardRatesPpm,code));
 await db.query('ROLLBACK');
}finally{await db.end();}
if(r.status===200)assert.deepEqual(publicBody.settings,feature.settings);else{assert.equal(r.status,503);assert.equal(publicBody.code,'MAINTENANCE');}
fs.writeFileSync(out+'/http.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'84c41277d',pages:process.env.BC_PAGES,verified,publicApi:{status:r.status,...(r.status===200?{mode:publicBody.settings.mode}:publicBody)},liveDatabase:{readOnly:true,revision:feature.revision,mode:feature.settings.mode,stock:feature.stock,removedRewardsAbsent:true},productionWrites:0},null,2));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failures=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/blackcrown|black-crown/.test(r.url()))failures.push({status:r.status(),url:r.url()});});
  await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())&&new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/offline.html?qa=buttons-v3',{waitUntil:'domcontentloaded'});
  await page.evaluate(async data=>{document.body.innerHTML='';document.body.style.background='#090a0c';const {mountBlackcrownPack}=await import('/js/mercenary-blackcrown-pack-live.bundle.mjs?v=20261027-buttons-v4');await mountBlackcrownPack({accountId:0,getAccountId:()=>0,api:async(endpoint,options={})=>{if(options.method&&options.method!=='GET')throw Error('Read only');if(endpoint==='mercenaries/v3/blackcrown-pack/feature')return data;throw Error('Unexpected endpoint '+endpoint);}});},feature);
  await page.waitForFunction(()=>document.querySelector('[data-bcp-availability]').textContent.includes('OFF'));
  for(const selector of ['[data-bcp-buy="1"]','[data-bcp-buy="10"]','[data-bcp-bulk-start]'])assert.equal(await page.locator(selector).isDisabled(),true);
  const buttons=await page.locator('.bcp-dialog button').evaluateAll(items=>items.map(el=>({label:el.textContent.trim(),image:getComputedStyle(el).backgroundImage,disabled:el.disabled})));assert(buttons.length>=18);assert(buttons.every(b=>/button-crown-(gold|obsidian)-v3\.webp/.test(b.image)));
  assert.equal(await page.locator('.bcp-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert(!/SSS 리미티드|프라임|레오넬|은설|제너럴/.test(await page.locator('.bcp-dialog').innerText()));
  await page.locator('.bcp-dialog').screenshot({path:out+'/room-off-'+width+'.png'});await page.locator('[data-bcp-auto-toggle]').click();await page.locator('[data-bcp-auto-panel]').screenshot({path:out+'/auto-off-'+width+'.png'});assert.equal(await page.locator('[data-bcp-auto-start]').isDisabled(),true);assert.equal(await page.locator('[data-bcp-auto-panel]').evaluate(e=>getComputedStyle(e).borderTopWidth),'1px');
  await page.locator('[data-bcp-auto-toggle]').click();await page.locator('.bcp-bulk-panel').screenshot({path:out+'/bulk-off-'+width+'.png'});await page.locator('[data-bcp-close]').click();assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  reports.push({width,mode:'PUBLIC_ASSETS_WITH_READ_ONLY_LIVE_DATABASE_STATE_DURING_MAINTENANCE',buttons,openingBlocked:true,errors,failures,productionWrites:0});await context.close();
 }
 fs.writeFileSync(out+'/browser.json',JSON.stringify({checkedAt:new Date().toISOString(),reports},null,2));console.log(JSON.stringify({verifiedFiles:verified.length,mode:feature.settings.mode,publicApiStatus:r.status,reports:reports.map(x=>({width:x.width,buttons:x.buttons.length,errors:x.errors}))}));
}finally{await browser.close();}
