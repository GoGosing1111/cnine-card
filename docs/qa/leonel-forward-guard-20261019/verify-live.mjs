import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),sub='preview/mercenary-leonel-sss-limited-20261018-v2/',out=path.join(root,'docs/qa/leonel-forward-guard-20261019/production');
await fs.mkdir(out,{recursive:true});
const base='https://cnine-card.pages.dev',stamp=Date.now(),sha=b=>createHash('sha256').update(b).digest('hex');
const files=[sub+'preview.bundle.js',sub+'assets/frames/ultimate-09.png',sub+'assets/white-crest-20261019/crest.webp',sub+'assets/white-crest-20261019/ground.webp',sub+'assets/white-crest-20261019/sword.webp','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','preview/coop-defense-v1/defense.bundle.js','defense/index.html','js/battle-v3-live.js','js/app.js','service-worker.js','index.html'];
const hashes=await Promise.all(files.map(async file=>{const r=await fetch(base+'/'+file+'?leonel-motion-fix='+stamp,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,file);const data=Buffer.from(await r.arrayBuffer()),local=await fs.readFile(path.join(root,file));assert.equal(sha(data),sha(local),'Deployed hash '+file);return{file,status:r.status,sha256:sha(data),bytes:data.length};}));
await fs.writeFile(path.join(out,'hashes.json'),JSON.stringify(hashes,null,2)+'\n');console.log('Matched '+hashes.length+' deployed files.');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),screens=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,400));});
  await page.goto(base+'/'+sub+'?review=forward-guard-20261019',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.LeonelPreview,null,{timeout:60000});
  const state=await page.evaluate(()=>{
   const f=window.LeonelPreview.fx,r=f.whiteRig;f.setMode('idle');const idle=[];
   for(const t of [0,.5,1,1.5,2,2.5,3,3.5,4]){f.seek(t);idle.push({layers:r.current.layers.length,bank:r.current.layers[0].pose.bank,index:r.current.layers[0].pose.index,x:r.current.x,y:r.current.y,angle:r.current.angle});}
   f.setMode('ultimate');f.cutInEnabled=false;const ultimate=[];
   for(const t of [0,1.3,1.44,1.68,1.79,2.4,3.7]){f.seek(t);ultimate.push({layers:r.current.layers.length,actual:r.current.layers[0].pose.index,original:f.state.pose.index===0||f.state.pose.index>=8?8:f.state.pose.index});}
   f.setMode('idle');f.seek(.3);const b=r.blade(),forward=b.tip.x>b.grip.x;return{idle,ultimate,forward,neon:r.glow.enabled,swordAura:r.swordAura.some(s=>s.visible),crest:f.backgroundAura.visible,ground:f.aura.visible,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert(state.forward);assert(state.neon&&state.swordAura&&state.crest&&state.ground&&!state.overflow);assert(state.idle.every(p=>p.layers===1&&p.bank==='ultimate'&&p.index===8&&p.angle===state.idle[0].angle&&p.x===state.idle[0].x));assert(Math.max(...state.idle.map(p=>p.y))-Math.min(...state.idle.map(p=>p.y))<1);assert(state.ultimate.every(p=>p.layers===1&&p.actual===p.original));
  await page.locator('.battle-viewport').screenshot({path:path.join(out,label+'-live.png')});
  const cut=await page.evaluate(()=>{const f=window.LeonelPreview.fx;f.cutInState.shown=false;f.setMode('ultimate');f.seek(.6);const first=f.screenLayer.visible;f.setMode('ultimate');f.seek(.6);return{first,second:f.screenLayer.visible};});assert.deepEqual(cut,{first:true,second:false});assert.deepEqual(errors,[]);screens.push({label,state,cut,errors});await page.close();console.log(label+' production forward guard PASS');
 }
}finally{await browser.close();}
const result={dateKST:'2026-10-19',status:'PASS',origin:base,hashes,screens,productionAccountWrites:0};await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,matchedFiles:hashes.length,screens:screens.length,productionAccountWrites:0}));
