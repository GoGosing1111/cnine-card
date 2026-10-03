import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/',import.meta.url));await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1040}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:8978/preview/mercenary-limited-sd-skills-20261003-v1/',{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>window.LimitedReview&&window.LimitedReview.diagnostics().character,null,{timeout:60000});
 const stages=[];
 for(const id of ['bongsoon','joeun','ines','orikkung','diim','berkan']){
 await page.evaluate(async id=>{await window.LimitedReview.select(id);window.LimitedReview.seek(id==='berkan'?.8:1.4);},id);
 await page.waitForTimeout(120);
 stages.push(await page.evaluate(()=>window.LimitedReview.diagnostics()));
 await page.locator('#stage').screenshot({path:dir+name+'-'+id+'-alignment.png'});
 if(id==='bongsoon'){await page.evaluate(()=>window.LimitedReview.seek(.7));await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));await page.screenshot({path:dir+name+'-page.png',fullPage:true});}
 }
 const controls=await page.evaluate(async()=>{
 const r=window.LimitedReview;await r.select('joeun');const rows=[];
 for(const speed of [.25,1,2]){r.seek(0);r.setSpeed(speed);r.play();await new Promise(a=>setTimeout(a,220));r.pause();const t=r.diagnostics().time;await new Promise(a=>setTimeout(a,70));rows.push({speed,time:t,pauseStable:t===r.diagnostics().time});}
 r.setEffects(false);r.seek(1.4);const fxOff=r.diagnostics();r.setAura(false);const auraOff=r.diagnostics();r.setEffects(true);r.setAura(true);r.setAnchors(true);r.seek(1.4);const debug=r.diagnostics();r.cancel();return{rows,fxOff,auraOff,debug,cancel:r.diagnostics()};
 });
 const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 reports.push({name,errors,failures,overflow,stages,controls});
 await fs.writeFile(dir+'browser-report.json',JSON.stringify(reports,null,2)+'\n');
 console.log(JSON.stringify({name,errors,failures,overflow,axisErrors:stages.map(s=>s.axisLateralError),controls}));
 await page.close();
 }
}finally{await browser.close();}
if(reports.some(r=>r.errors.length||r.failures.length||r.overflow.scroll>r.overflow.client||r.stages.some(s=>s.axisLateralError>1e-6)||r.controls.rows.some(t=>t.time<=0||!t.pauseStable)||r.controls.cancel.registeredTimelines||r.controls.cancel.visibleSkillEffects))process.exitCode=1;
