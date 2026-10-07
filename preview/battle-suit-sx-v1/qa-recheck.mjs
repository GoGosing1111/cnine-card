import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {MODES} from './motion.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/slash-v2/framing/',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true}),results=[],problems=[];
await fs.mkdir(dir,{recursive:true});
try{for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
 await page.goto('http://127.0.0.1:8975/preview/battle-suit-sx-v1/');await page.waitForFunction(()=>window.SXBodyPreview,null,{timeout:60000});
 const snapshots=[],points=[['idle',1.2],['dash',.35],['dash',1.15],['attack',.43],...MODES.skill.contacts.map(t=>['skill',t]),['skill',1.9],['skill',3.3],...MODES.ultimate.contacts.map(t=>['ultimate',t]),['ultimate',2.97],['ultimate',4.95],['ultimate',.52],['ultimate',1.08],['ultimate',2.4],['ultimate',3.78],['skill',1.44],['skill',2.53],['attack',.325]];
 for(const [mode,at]of points){await page.evaluate(({mode,at})=>{const f=window.SXBodyPreview.fx;f.setMode(mode);f.seek(at);},{mode,at});await page.waitForTimeout(65);
  const s=await page.evaluate(()=>({...window.SXBodyPreview.diagnostics(),canvas:{width:window.SXBodyPreview.engine.app.screen.width,height:window.SXBodyPreview.engine.app.screen.height}}));snapshots.push(s);
  if(MODES[mode].contacts.includes(at)&&(!s.bladeContact.intersects||s.airborne))problems.push([name,'contact',mode,at]);
  for(const [kind,b]of [['body',s.artScreenBounds],['title',s.title.bounds]])if(b.x<-1||b.y<-1||b.x+b.width>s.canvas.width+1||b.y+b.height>s.canvas.height+1)problems.push([name,'bounds',kind,mode,at,b,s.canvas]);
  if(['idle','dash'].includes(mode)||at===.43||at===1.9||at===2.97||at===3.53||[.52,1.08,2.4,3.78,1.44,2.53,.325].includes(at))await page.locator('.battle-viewport').screenshot({path:dir+name+'-'+mode+'-'+at+'.png'});
 }
 await page.evaluate(()=>{const f=window.SXBodyPreview.fx;f.setMode('skill');f.setEffects(false);f.seek(.43);});await page.locator('.battle-viewport').screenshot({path:dir+name+'-body-only.png'});
 await page.evaluate(()=>{const f=window.SXBodyPreview.fx;f.setEffects(true);f.setMode('idle');f.seek(.7);});await page.screenshot({path:dir+name+'-page.png',fullPage:true});
 if(name==='desktop'){
  const png=await page.evaluate(async()=>{const {fx,engine}=window.SXBodyPreview;return await engine.app.renderer.extract.base64({target:fx.title.view,resolution:3,format:'png'});});await fs.writeFile(dir+'title-open-v2.png',Buffer.from(png.split(',')[1],'base64'));
 }
 const font=await page.frames().find(f=>f.url().endsWith('battle.html')).evaluate(()=>document.fonts.check('900 34px SXTitleSerif','푸른 사신'));
 if(errors.length||failures.length||!font)problems.push([name,'load',errors,failures,font]);
 results.push({name,errors,failures,fontLoaded:font,snapshots});await page.close();
}}finally{await browser.close();}
await fs.writeFile(dir+'contact-title-recheck.json',JSON.stringify({scope:'Video-inspired slashes, dense aura and per-pose blade sheath; PC/mobile framing',priorReport:'browser-report.json',resolved:'Horizontal thrust loops removed; alternating whole-body slashes and rotational finisher',results,problems},null,2)+'\n');
console.log(JSON.stringify({screens:results.map(r=>({name:r.name,contacts:r.snapshots.filter(s=>MODES[s.mode].contacts.includes(s.time)).length,fontLoaded:r.fontLoaded})),problems},null,2));if(problems.length)process.exitCode=1;
