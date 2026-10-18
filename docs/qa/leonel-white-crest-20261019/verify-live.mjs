import {fileURLToPath} from "node:url";
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL("../../../",import.meta.url)),sub='preview/mercenary-leonel-sss-limited-20261018-v2/',out=path.join(root,'docs/qa/leonel-white-crest-20261019/production');
await fs.mkdir(out,{recursive:true});
const base='https://cnine-card.pages.dev',stamp=Date.now(),sha=b=>createHash('sha256').update(b).digest('hex');
const files=[sub+'manifest.json',sub+'preview.bundle.js',sub+'assets/white-crest-20261019/crest.webp',sub+'assets/white-crest-20261019/ground.webp',sub+'assets/white-crest-20261019/sword.webp',sub+'assets/white-crest-20261019/body-idle-0.webp',sub+'assets/white-crest-20261019/body-attack-0.webp','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','preview/coop-defense-v1/defense.bundle.js','defense/index.html','js/battle-v3-live.js'];
const hashes=await Promise.all(files.map(async file=>{const r=await fetch(base+'/'+file+'?white-crest-verify='+stamp,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,file);const data=Buffer.from(await r.arrayBuffer()),local=await fs.readFile(path.join(root,file));assert.equal(sha(data),sha(local),'Deployed hash '+file);return{file,status:r.status,sha256:sha(data),bytes:data.length};}));
await fs.writeFile(path.join(out,'hashes.json'),JSON.stringify(hashes,null,2)+'\n');console.log('Matched '+hashes.length+' deployed files.');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),screens=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,400));});
  await page.goto(base+'/'+sub+'?review=white-crest-20261019',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.LeonelPreview,null,{timeout:60000});console.log(label+' live preview ready.');
  const state=await page.evaluate(()=>{const f=window.LeonelPreview.fx;f.setMode('idle');f.seek(.3);return{version:f.manifest.whiteCrest.version,rig:!!f.whiteRig,neon:f.whiteRig.glow.enabled,swordAura:f.whiteRig.swordAura.some(s=>s.visible),crest:f.backgroundAura.visible,ground:f.aura.visible,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(state.rig&&state.neon&&state.swordAura&&state.crest&&state.ground&&!state.overflow);
  await page.locator('.battle-viewport').screenshot({path:path.join(out,label+'-live.png')});
  const cut=await page.evaluate(()=>{const f=window.LeonelPreview.fx;f.setMode('ultimate');f.seek(.6);const first=f.screenLayer.visible;f.setMode('ultimate');f.seek(.6);return{first,second:f.screenLayer.visible};});assert.deepEqual(cut,{first:true,second:false});assert.deepEqual(errors,[]);screens.push({label,state,cut,errors});await page.close();
 }
}finally{await browser.close();}
const result={dateKST:'2026-10-19',status:'PASS',origin:base,hashes,screens,productionAccountWrites:0};await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,matchedFiles:hashes.length,screens:screens.length,productionAccountWrites:0}));
