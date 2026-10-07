import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {MODES} from './motion.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/slash-v2/',import.meta.url));await fs.mkdir(dir,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
  await page.goto('http://127.0.0.1:8975/preview/battle-suit-sx-v1/');await page.waitForFunction(()=>window.SXBodyPreview||document.getElementById('status').textContent.startsWith('준비 실패'),null,{timeout:60000});
  if(!await page.evaluate(()=>!!window.SXBodyPreview))throw Error(await page.locator('#status').textContent());
  const snapshots=[];const points=[['idle',1.2],['dash',.35],['dash',1.15],['attack',.43],...MODES.skill.contacts.map(t=>['skill',t]),['skill',1.9],['skill',3.3],...MODES.ultimate.contacts.map(t=>['ultimate',t]),['ultimate',2.97],['ultimate',4.95]];
  for(const [mode,at]of points){await page.evaluate(({mode,at})=>{const f=window.SXBodyPreview.fx;f.setMode(mode);f.seek(at);},{mode,at});await page.waitForTimeout(65);snapshots.push(await page.evaluate(()=>window.SXBodyPreview.diagnostics()));if(['idle','dash'].includes(mode)||at===.43||at===1.9||at===2.97||at===3.53)await page.locator('.battle-viewport').screenshot({path:dir+name+'-'+mode+'-'+at+'.png'});}
  const timing=await page.evaluate(async()=>{
   const f=window.SXBodyPreview.fx,report=[];f.setMode('skill');
   for(const speed of [.25,.5,1,2]){f.seek(0);f.setSpeed(speed);f.play();await new Promise(r=>setTimeout(r,300));f.pause();const a=f.time;await new Promise(r=>setTimeout(r,90));report.push({speed,advance:a,pauseStable:a===f.time});}
   f.setMode('idle');f.setSpeed(1);f.seek(4.65);f.play();await new Promise(r=>setTimeout(r,250));const idleLoop={time:f.time,playing:f.playing};f.cancel();const stopped=f.diagnostics();
   f.setMode('skill');f.setEffects(false);f.seek(.72);const effectsOff=f.diagnostics();f.setEffects(true);f.cancel();return{speeds:report,idleLoop,stopped,effectsOff};
  });
  await page.evaluate(()=>{const f=window.SXBodyPreview.fx;f.setMode('skill');f.setEffects(false);f.seek(.43);});await page.locator('.battle-viewport').screenshot({path:dir+name+'-body-only.png'});
  await page.evaluate(()=>{const f=window.SXBodyPreview.fx;f.setEffects(true);f.setMode('ultimate');f.seek(3.53);});await page.screenshot({path:dir+name+'-page.png',fullPage:true});
  const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  const frame=page.frames().find(f=>f.url().endsWith('battle.html'));
  const lifecycle=await frame.evaluate(()=>{const f=window.SXBodyPreview.fx;f.setMode('skill');f.play();const old=Object.getOwnPropertyDescriptor(document,'hidden');Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));const hidden=f.diagnostics();if(old)Object.defineProperty(document,'hidden',old);else delete document.hidden;window.dispatchEvent(new Event('pagehide'));return{hidden,disposed:f.disposed,timelineCleared:f.timeline===null};});
  results.push({name,errors,failures,overflow,snapshots,...timing,lifecycle});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(dir+'browser-report.json',JSON.stringify(results,null,2)+'\n');
const problems=[];
for(const r of results){
 if(r.errors.length||r.failures.length||r.overflow.scroll>r.overflow.width)problems.push([r.name,'browser',r.errors,r.failures]);
 for(const s of [r.stopped,r.lifecycle.hidden])if(s.registeredTimelines||s.visibleEffects||s.visibleGhosts)problems.push([r.name,'cleanup']);
 if(!r.lifecycle.disposed||!r.lifecycle.timelineCleared)problems.push([r.name,'dispose']);
 if(r.speeds.some(s=>s.advance<=0||!s.pauseStable)||!r.idleLoop.playing||r.idleLoop.time>=4.8)problems.push([r.name,'clock']);
 if(r.effectsOff.visibleEffects||r.effectsOff.visibleGhosts)problems.push([r.name,'effects toggle']);
 for(const s of r.snapshots){if(s.mainBodyTint!==0xffffff||!s.bodyUniformScale||s.title.mirrored||s.groundError>1e-8)problems.push([r.name,'body identity or ground',s.mode,s.time]);if(MODES[s.mode].contacts.includes(s.time)&&(!s.bladeContact.intersects||s.airborne))problems.push([r.name,'contact',s.mode,s.time,s.bladeContact]);if(s.bodyAuraAlpha!==1||!s.bladeAuraVisible||s.bladeAuraAttachmentError>1e-5)problems.push([r.name,'aura alignment/density',s.mode,s.time,s.bladeAuraAttachmentError]);}
 for(const [mode,time]of [['dash',.35],['dash',1.15],['skill',3.3],['ultimate',4.95]])if(!r.snapshots.find(s=>s.mode===mode&&s.time===time)?.visibleGhosts)problems.push([r.name,'missing movement afterimage',mode,time]);
}
console.log(JSON.stringify({screens:results.map(r=>({name:r.name,contacts:r.snapshots.filter(s=>MODES[s.mode].contacts.includes(s.time)).length,errors:r.errors.length,speeds:r.speeds,cleanup:r.lifecycle.disposed&&r.lifecycle.timelineCleared})),problems},null,2));if(problems.length)process.exitCode=1;
