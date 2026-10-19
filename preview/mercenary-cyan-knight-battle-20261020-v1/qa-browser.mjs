import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('./',import.meta.url),url='http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={status:'PASS',visualApproval:false,devices:[]};
try{
 for(const device of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},isMobile:device.name==='mobile',hasTouch:device.name==='mobile'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.CyanKnightPreview);
  const checks=await page.evaluate(()=>{
   const {fx:f,modes}=CyanKnightPreview,out={contacts:[],effectsOff:null,cancel:null,overflow:document.documentElement.scrollWidth>innerWidth};
   for(const mode of ['horizon','flurry','meteor','array','zenith']){f.setMode(mode);for(const time of modes[mode].contacts){f.seek(time);const d=f.diagnostics();out.contacts.push({mode,time,intersects:mode==='array'?d.phantomContacts.some(s=>s.intersects):d.bladeContact.intersects,groundError:d.groundError});}}
   f.setMode('array');f.seek(1.05);f.setEffects(false);out.effectsOff=f.diagnostics();f.setEffects(true);f.cancel();out.cancel=f.diagnostics();return out;
  });
  assert.equal(checks.overflow,false);assert.ok(checks.contacts.every(c=>c.intersects&&c.groundError<1e-8),'Blade must pass through actual target');
  assert.equal(checks.effectsOff.visibleEffects,0);assert.equal(checks.effectsOff.visibleGhosts,0);assert.equal(checks.effectsOff.visibleSwords,5);
  assert.equal(checks.cancel.registeredTimelines,0);assert.equal(checks.cancel.visibleEffects+checks.cancel.visibleGhosts+checks.cancel.visibleSwords,0);
  await page.evaluate(()=>{const f=CyanKnightPreview.fx;f.setMode('array');f.setSpeed(2);f.play();});await page.waitForTimeout(350);
  const paused=await page.evaluate(()=>{CyanKnightPreview.fx.pause();return CyanKnightPreview.fx.time});await page.waitForTimeout(180);
  assert.ok(Math.abs(await page.evaluate(()=>CyanKnightPreview.fx.time)-paused)<.002,'Pause drift');
  await page.evaluate(()=>{const f=CyanKnightPreview.fx;f.setSpeed(.25);f.seek(.7);f.play();});await page.waitForTimeout(240);
  const slow=await page.evaluate(()=>CyanKnightPreview.fx.time);assert.ok(slow>.70&&slow<.9,'Slow-motion clock');
  await page.evaluate(()=>{const f=CyanKnightPreview.fx;f.setSpeed(1);f.seek(0);f.play();});await page.waitForTimeout(1050);
  const progress=await page.evaluate(()=>CyanKnightPreview.fx.time);assert.ok(progress>.7&&progress<1.5,'Normal-speed clock must advance');await page.waitForTimeout(3100);
  assert.equal(await page.evaluate(()=>CyanKnightPreview.fx.playing),false);
  for(const [label,time]of [['fan',.55],['cross',1.05],['plunge',2.85],['finish',3.14]]){
   await page.evaluate(t=>CyanKnightPreview.fx.seek(t),time);await page.waitForTimeout(60);
   await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL('qa/'+device.name+'-array-'+label+'.png',root))});
  }
  await page.evaluate(()=>{CyanKnightPreview.fx.seek(1.05);CyanKnightPreview.fx.setEffects(false)});await page.waitForTimeout(60);
  await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL('qa/'+device.name+'-array-effects-off.png',root))});
  const cleanup=await page.evaluate(()=>{const r=CyanKnightPreview;r.fx.setEffects(true);r.fx.play();const w=r.engine.app.canvas.ownerDocument.defaultView;w.dispatchEvent(new Event('pagehide'));return{disposed:r.fx.disposed,frontDestroyed:r.fx.front.destroyed,swordsDestroyed:r.fx.swords.destroyed,backDestroyed:r.fx.back.destroyed,timelineRemoved:r.fx.timeline===null};});
  assert.ok(Object.values(cleanup).every(Boolean),'Page-exit cleanup');assert.deepEqual(errors,[]);
  report.devices.push({...device,...checks,pausePassed:true,slowPassed:true,normalSpeedCompleted:true,cleanup,errors});await page.close();
 }
 await fs.writeFile(new URL('qa/browser-check.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,devices:report.devices.map(d=>({name:d.name,contacts:d.contacts.length,cleanup:d.cleanup})),visualApproval:false}));
}finally{await browser.close();}
