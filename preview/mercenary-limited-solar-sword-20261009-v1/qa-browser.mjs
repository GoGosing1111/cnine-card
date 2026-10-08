import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report=[];
const quick=process.argv.includes('--quick');
try{for(const [name,viewport]of (quick?[['desktop',{width:1440,height:1050}]]:[['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]])){
 const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
 await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
 await page.goto('http://127.0.0.1:8914/preview/mercenary-limited-solar-sword-20261009-v1/',{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>window.SolarPreview||document.getElementById('status').textContent.startsWith('준비 실패'),null,{timeout:60000});
 if(!await page.evaluate(()=>!!window.SolarPreview))throw Error(await page.locator('#status').textContent());
 const snapshots=[];
 for(const [mode,time]of [['aura',.7],['dash',.49],['attack',.48],['skill',.94],['skill',1.39],['skill',2.66],['ultimate',1.65],['ultimate',2.48],['ultimate',2.84],['ultimate',4.0]]){
  await page.evaluate(({mode,time})=>{const f=window.SolarPreview.fx;f.setMode(mode);f.seek(time);},{mode,time});await page.waitForTimeout(150);
  snapshots.push(await page.evaluate(()=>window.SolarPreview.diagnostics()));await page.locator('.battle-viewport').screenshot({path:file('qa/'+name+'-'+mode+'-'+time+'.png')});
 }
 const timing=await page.evaluate(async()=>{const f=window.SolarPreview.fx,values=[];f.setMode('ultimate');for(const speed of[.25,.5,1,2]){f.seek(0);f.setSpeed(speed);f.play();await new Promise(r=>setTimeout(r,300));f.pause();const t=f.time;await new Promise(r=>setTimeout(r,80));values.push({speed,advance:t,pauseStable:t===f.time});}f.setEffects(false);f.seek(2.48);const off=f.diagnostics();f.setEffects(true);f.cancel();const cancelled=f.diagnostics();return{values,off,cancelled};});
 const contacts=await page.evaluate(()=>{const f=window.SolarPreview.fx;f.setMode('skill');f.setEffects(false);return[1.20,1.39,1.58,1.77,1.96,2.15].map((t,i)=>{f.seek(t);return f.diagnostics().swordContacts[i];});});
 for(const [mode,time]of[['aura',.7],['attack',.48],['skill',.94],['ultimate',1.65]]){await page.evaluate(({mode,time})=>{const f=window.SolarPreview.fx;f.setMode(mode);f.setEffects(false);f.seek(time);},{mode,time});await page.waitForTimeout(80);await page.locator('.battle-viewport').screenshot({path:file('qa/'+name+'-'+mode+'-no-light.png')});}
 await page.locator('#weapon').screenshot({path:file('qa/'+name+'-weapon-comparison.png')});
 await page.evaluate(()=>{window.SolarPreview.fx.setMode('ultimate');window.SolarPreview.fx.seek(2.84);});await page.screenshot({path:file('qa/'+name+'-page.png'),fullPage:true});
 const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 const cleanup=await page.evaluate(()=>{const f=window.SolarPreview.fx;window.SolarPreview.dispose();return{disposed:f.disposed,frontDestroyed:f.front.destroyed,backDestroyed:f.back.destroyed,timeline:f.timeline===null};});
 const checks={basicContact:snapshots.find(s=>s.mode==='attack').bladeContact.intersects,allSixSwordContacts:contacts.every(c=>c.contact.intersects&&c.rigid),allFiveAreaTargets:snapshots.find(s=>s.mode==='ultimate'&&s.time===2.84).targets.every(t=>t.hit),weaponVisibleWithEffectsOff:timing.off.visibleWeapons===1&&timing.off.visibleEffects===0,stoppedClear:timing.cancelled.visibleEffects===0&&timing.cancelled.visibleWeapons===0&&timing.cancelled.registeredTimelines===0,disposed:Object.values(cleanup).every(Boolean)};
 report.push({name,errors,failures,overflow,snapshots,timing,contacts,cleanup,checks});console.log(JSON.stringify({name,errors,failures,overflow,checks}));await page.close();
}}finally{await browser.close();}
await fs.writeFile(file('qa/browser-report'+(quick?'-initial':'')+'.json'),JSON.stringify(report,null,2)+'\n');
if(report.some(r=>r.errors.length||r.failures.length||r.overflow.scroll>r.overflow.width||Object.values(r.checks).some(v=>!v)||r.timing.values.some(v=>!v.pauseStable||v.advance<=0)))process.exitCode=1;
