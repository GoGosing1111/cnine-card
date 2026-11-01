import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),kind=process.argv[2]||'sword',mobile=process.argv.includes('--mobile');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:950},deviceScaleFactor:1});const failed=[];
await page.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'||u.protocol==='data:'||u.protocol==='blob:'?route.continue():route.abort();});
page.on('pageerror',e=>failed.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
await page.goto('http://127.0.0.1:18766/?case='+kind,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.v35Review?.ready,{timeout:60000});
if(kind==='cardgu')await page.waitForFunction(()=>window.v35Review.engine.cardguStates?.size>0,{timeout:30000});
await page.waitForTimeout(500);
const before=await page.evaluate(()=>v35Review.audit());
await page.evaluate(()=>{
 const api=v35Review,canvas=document.querySelector('#pvPixiBattle canvas'),stream=canvas.captureStream(30);api.recording={started:performance.now(),chunks:[],samples:[],active:true};const rec=api.recording;
 rec.media=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2200000});rec.media.ondataavailable=e=>{if(e.data.size)rec.chunks.push(e.data);};rec.media.start();
 const sample=()=>{if(!rec.active)return;rec.samples.push({t:(performance.now()-rec.started)/1000,actors:api.engine.mercenaries.map(a=>({x:a.root.x,y:a.root.y,scale:a.root.scale.x,frame:a.fullBodySprite?.texture?.frame,spine:a.spineRig?a.animationAdapter.clock.time:null}))});requestAnimationFrame(sample);};sample();
 });
for(let cycle=0;cycle<2;cycle++)for(let index=0;index<2;index++){
 await page.evaluate(async i=>{await v35Review.attack(i);},index);
 await page.waitForFunction(()=>window.v35Review.engine.pendingTails.size===0,{timeout:30000});
 await page.waitForTimeout(140);
}
await page.waitForTimeout(200);
const recording=await page.evaluate(async()=>{const rec=v35Review.recording;rec.active=false;await new Promise(resolve=>{rec.media.onstop=resolve;rec.media.stop();});rec.media.stream.getTracks().forEach(t=>t.stop());const b=await new Blob(rec.chunks,{type:'video/webm'}).arrayBuffer();let s='';for(const n of new Uint8Array(b))s+=String.fromCharCode(n);return {base64:btoa(s),samples:rec.samples,duration:(performance.now()-rec.started)/1000};});
const name=kind+(mobile?'-mobile':'');await fs.writeFile(path.join(dir,name+'-normal.webm'),Buffer.from(recording.base64,'base64'));delete recording.base64;
await page.screenshot({path:path.join(dir,name+'-after.png')});
const after=await page.evaluate(()=>({audit:v35Review.audit(),playback:v35Review.normalPlayback}));
const checks={singleCanvas:after.audit.canvasCount===1,perAttackOneImpact:after.audit.impacts.length===4,formationRestored:after.audit.actors.every(a=>Math.hypot(a.root.x-a.base.x,a.root.y-a.base.y)<.01),noPageErrors:failed.length===0&&after.audit.errors.length===0};
let controls=null;
if(kind==='mixed'||kind==='enemy'){
 controls=await page.evaluate(async()=>{const api=v35Review,e=api.engine,s=api.spine;let finished=false;void api.attack(1).then(()=>finished=true);await new Promise(r=>setTimeout(r,100));api.pause(true);const t=s.clock.time,x=s.actor.root.x;await new Promise(r=>setTimeout(r,180));const paused={timeDelta:s.clock.time-t,xDelta:s.actor.root.x-x};api.pause(false);while(!finished)await new Promise(r=>setTimeout(r,20));const prior=api.impacts.length;void api.attack(1);await new Promise(r=>setTimeout(r,45));e.cancelTimelines();await new Promise(r=>setTimeout(r,500));const cancelled={newImpacts:api.impacts.length-prior,busy:s.busy,position:{x:s.actor.root.x,y:s.actor.root.y},base:{x:s.actor.baseX,y:s.actor.baseY}};s.actor.setHp(0);const deadVisible=s.rig.visible;s.actor.setHp(100);const revivedVisible=s.rig.visible;await e.setVisible(false);const hiddenTime=s.clock.time;await new Promise(r=>setTimeout(r,100));const hiddenDelta=s.clock.time-hiddenTime;await e.setVisible(true);await new Promise(r=>setTimeout(r,100));return {paused,cancelled,deadVisible,revivedVisible,hiddenDelta,resumeTime:s.clock.time};});
}
const report={kind,mobile,before,after,checks,controls,failed,recording,continuousVideoWatched:false,realDeviceTest:false};await fs.writeFile(path.join(dir,name+'-playback.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({kind,mobile,checks,controls,failed,duration:recording.duration},null,2));if(Object.values(checks).some(x=>!x))process.exitCode=1;
}finally{await browser.close();}
