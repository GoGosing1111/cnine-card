import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),base='http://127.0.0.1:8996';
const historical=path=>execFileSync('git',['show','476ededcad35468ca3ed32f9a5ad08e26ae34e3b:'+path],{cwd:root,encoding:'utf8',maxBuffer:40000000});
const oldWrapper=historical('js/battle-v3-live.js'),oldBundle=historical('preview/project-v-v3/project-v-pixi-battle.bundle.js');
const before=process.argv.includes('--before');
const app=before?execFileSync('git',['show','c0b3e1aa801a54d37f05951c6d5e2deba652d362:js/app.js'],{cwd:root,encoding:'utf8',maxBuffer:4000000}):await fs.readFile(root+'js/app.js','utf8');
const loader=app.slice(app.indexOf('const FEATURE_RESOURCE_MANIFEST='),app.indexOf('function featureKeyForTab('));
const html=(await fs.readFile(new URL('index.html',import.meta.url),'utf8')).replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<head>','<head><base href="/">');
const dir=new URL('qa/cache/',import.meta.url);await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const[name,viewport]of(before?[['desktop',{width:1440,height:1000}]]:[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],cacheHits=[],requests=[];
  page.on('pageerror',e=>errors.push(e.stack));
  page.on('request',r=>{if(r.url().includes('battle-v3-live.js')||r.url().includes('project-v-pixi-battle.bundle.js'))requests.push(r.url());});
  await page.route('**/preview/overlord-live-v1/cache-review',route=>route.fulfill({body:html,contentType:'text/html'}));
  await page.route('**/fixtures.json',route=>route.fulfill({path:fileURLToPath(new URL('fixtures.json',import.meta.url)),contentType:'application/json'}));
  await page.route('**/js/battle-v3-live.js?*',route=>{
   const url=new URL(route.request().url());
   if(!url.searchParams.has('overlord')){cacheHits.push(url.pathname+url.search);return route.fulfill({body:oldWrapper,contentType:'text/javascript'});}
   return route.continue();
  });
  await page.route('**/project-v-pixi-battle.bundle.js?*',route=>{
   const url=new URL(route.request().url());
   if(url.searchParams.get('battleRuntime')==='20261005-coop-readable-v4-backdrop'){
    cacheHits.push(url.pathname+url.search);return route.fulfill({body:oldBundle,contentType:'text/javascript'});
   }
   return route.continue();
  });
  await page.goto(base+'/preview/overlord-live-v1/cache-review');
  // Executes the actual main manifest and lazy loader, with the historical
  // URL responses still available. No player login or reward APIs are used.
  await page.addScriptTag({content:loader+'\nwindow.ensureFeatureResources=ensureFeatureResources;'});
  await page.evaluate(()=>window.ensureFeatureResources('battleV2'));
  await page.addScriptTag({url:base+'/preview/overlord-live-v1/review.js'});
  await page.waitForFunction(()=>window.OverlordLiveReview,null,{timeout:60000});
  const state=await page.evaluate(()=>{
   const e=window.OverlordLiveReview.engine,u=e.accountBattleUnit;
   return{runtime:window.ProjectVPixiBattle.runtimeVersion,wrapperRuntime:window.ProjectVBattleV3Live.runtimeVersion,active:e.accountBattleUnitEnabled,gunVisible:u.weaponSprite.visible,weaponSource:u.weaponSource,sword:u.swordAnimation?.diagnostics()||null};
  });
  await page.screenshot({path:fileURLToPath(new URL((before?'before-':'after-')+name+'.png',dir))});
  let normal=null;
  if(!before){
   const expected=await page.evaluate(()=>window.OverlordLiveReview.normal('attack'));
   await page.evaluate(()=>window.OverlordLiveReview.done);
   normal=await page.evaluate(()=>window.OverlordLiveReview.diagnostics());
   assert.equal(normal.normalDamage,expected,'sword attack replays actual damage receipts');
   assert.equal(state.gunVisible,false);assert.equal(state.sword?.version,'OVERLORD_LIVE_20261005_V6');
   assert.equal(state.wrapperRuntime,state.runtime);assert.equal(cacheHits.length,0);
  }else{assert.equal(state.gunVisible,true);assert.equal(state.sword,null);assert.equal(cacheHits.length,2);}
  assert.deepEqual(errors,[]);
  report.push({name,state,normal,cacheHits,requests,errors});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(new URL(before?'before.json':'after.json',dir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.map(r=>({name:r.name,runtime:r.state.runtime,gunVisible:r.state.gunVisible,sword:r.state.sword,cacheHits:r.cacheHits.length,normalDamage:r.normal?.normalDamage,errors:r.errors}))));
