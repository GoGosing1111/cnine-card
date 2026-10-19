import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),file=p=>fileURLToPath(new URL(p,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true}),report={screens:[],errors:[],requests:[]};
try{
for(const [name,viewport]of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({screen:name,error:e.message}));page.on('response',r=>{if(r.status()>=400)report.requests.push({screen:name,status:r.status(),url:r.url()});});
 await page.goto('http://127.0.0.1:8973/preview/mercenary-bathory-halloween-20261019-v1/');await page.waitForFunction(()=>window.BathoryPreview,{timeout:60000});
 await page.evaluate(()=>{const r=window.BathoryPreview;r.queue.active=false;r.fx.setMode('idle');r.fx.seek(0);});
 await page.screenshot({path:file('qa/'+name+'-idle.png'),fullPage:true});
 const checks=await page.evaluate(async()=>{
  const r=window.BathoryPreview,f=r.fx,out={overflow:document.documentElement.scrollWidth>innerWidth,contacts:[],seeks:[]};
  for(const[mode,times]of [['attack',[.4]],['skill',[.66,1.5]]])for(const time of times){f.setMode(mode);f.seek(time);out.contacts.push({...f.diagnostics(),requestedTime:time});}
  for(const speed of [.25,.5,1,2]){f.setMode('skill');f.setSpeed(speed);f.seek(.8);out.seeks.push({speed,time:f.time,frame:f.state.frame});}
  f.setMode('attack');f.setSpeed(2);f.play();await new Promise(r=>setTimeout(r,80));f.pause();const time=f.time;await new Promise(r=>setTimeout(r,70));out.pauseStable=Math.abs(f.time-time)<.001;
  f.setEffects(false);f.setMode('skill');f.seek(.66);out.effectsHidden=!f.front.visible&&!f.back.visible;
  f.setEffects(true);f.setSpeed(1);f.setMode('idle');f.cancel();out.cancel=f.diagnostics();return out;
 });
 await page.evaluate(()=>{const f=window.BathoryPreview.fx;f.setMode('skill');f.setEffects(false);f.seek(.66);});await page.locator('#stage').screenshot({path:file('qa/'+name+'-contact-body.png')});
 await page.evaluate(()=>{const f=window.BathoryPreview.fx;f.setEffects(true);f.seek(1.75);});await page.locator('#stage').screenshot({path:file('qa/'+name+'-impact.png')});
 await page.evaluate(()=>{const f=window.BathoryPreview.fx;f.setMode('skill');f.setSpeed(1);f.seek(0);f.play();});await page.waitForTimeout(2750);
 checks.playbackAt1x=true;report.screens.push({name,viewport,...checks});await page.close();
}
await fs.writeFile(file('qa/browser-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({errors:report.errors,requests:report.requests,screens:report.screens.map(s=>({name:s.name,overflow:s.overflow,pause:s.pauseStable,effects:s.effectsHidden,cancel:s.cancel.registeredTimelines,contacts:s.contacts.map(c=>c.bladeContact)}))},null,2));
}finally{await browser.close();}
