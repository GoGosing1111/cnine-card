import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const dir=fileURLToPath(new URL('./',import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:20000,args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={physicalDevice:false,continuousVideoCaptured:false,continuousVisualReview:false,frameReview:'pending',screens:[]};
try{
 const context=await browser.newContext({viewport:{width:1280,height:1120},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:18763'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:18763/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.rigReview?.ready,{timeout:30000});
 const geometry=await page.evaluate(()=>{
  rigReview.select('idle',false);
  const vertices=()=>rigReview.actor.skeleton.slots.map(slot=>{const a=slot.appliedPose.attachment,values=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(rigReview.actor.skeleton,slot,0,a.worldVerticesLength,values,0,2);return {name:slot.data.name,values:[...values],triangles:a.triangles};});
  rigReview.seek(0);const initial=vertices(),start=rigReview.sample();let flips=0,nonFinite=0,rigidDrift=0,loopError=0,maxHeadShift=0,maxChestShift=0;const snapshots=[],flipExamples=[],flipsBySlot={};
  for(let i=0;i<=126;i++){
   const time=4.2*i/126;rigReview.seek(time);const pose=rigReview.sample(),now=vertices();
   maxHeadShift=Math.max(maxHeadShift,Math.hypot(pose.head.x-start.head.x,pose.head.y-start.head.y));maxChestShift=Math.max(maxChestShift,Math.hypot(pose.chest.x-start.chest.x,pose.chest.y-start.chest.y));
   for(let s=0;s<now.length;s++){
    const a=initial[s],b=now[s];if(!b.values.every(Number.isFinite))nonFinite++;
    if(['weapon','hand_near','foot_back','foot_front'].includes(b.name))for(let k=0;k<a.values.length;k+=2)rigidDrift=Math.max(rigidDrift,Math.hypot(a.values[k]-b.values[k],a.values[k+1]-b.values[k+1]));
    if(i===126)for(let k=0;k<a.values.length;k++)loopError=Math.max(loopError,Math.abs(a.values[k]-b.values[k]));
    const area=(v,a,b,c)=>(v[b*2]-v[a*2])*(v[c*2+1]-v[a*2+1])-(v[b*2+1]-v[a*2+1])*(v[c*2]-v[a*2]);
    for(let t=0;t<a.triangles.length;t+=3){const ids=a.triangles.slice(t,t+3),aa=area(a.values,...ids),bb=area(b.values,...ids);if(Math.abs(aa)>1e-3&&aa*bb<=0){flips++;flipsBySlot[a.name]=(flipsBySlot[a.name]||0)+1;if(flipExamples.length<12)flipExamples.push({time,slot:a.name,triangle:t/3,initialArea:aa,area:bb,points:ids.map(i=>a.values.slice(i*2,i*2+2))});}}
   }
   if(i%21===0)snapshots.push(pose);
  }
  return {samples:127,flips,flipsBySlot,flipExamples,nonFinite,rigidDrift,loopError,maxHeadShift,maxChestShift,snapshots};
 });
 await fs.writeFile(path.join(dir,'geometry-latest.json'),JSON.stringify(geometry,null,2));
 if(geometry.flips){await page.evaluate(()=>{rigReview.setBackground('light');rigReview.seek(1.4);});await page.waitForTimeout(100);await page.locator('#stage').screenshot({path:path.join(dir,'idle-geometry-diagnostic.png')});console.log(JSON.stringify(geometry));}
 assert.equal(geometry.flips,0);assert.equal(geometry.nonFinite,0);assert(geometry.rigidDrift<.001);assert(geometry.loopError<.001);assert(geometry.maxChestShift>2);
 report.geometry=geometry;
 for(const t of [0,.7,1.4,2.1,2.8,3.5,4.199]){
  await page.evaluate(t=>{rigReview.setBackground('light');rigReview.seek(t);},t);await page.waitForTimeout(80);
  const name='idle-'+t.toFixed(3).replace('.','-')+'.png';await page.locator('#stage').screenshot({path:path.join(dir,name)});report.screens.push(name);
 }
 await page.evaluate(()=>{
  rigReview.setBackground('dark');rigReview.select('idle',false);rigReview.seek(0);
  const renderer=rigReview.engine.app.renderer,oldColor=renderer.background.color.toNumber(),oldAlpha=renderer.background.alpha;renderer.background.color=0x142333;renderer.background.alpha=1;
  const stream=document.querySelector('#stage canvas').captureStream(30),chunks=[],type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:2500000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  window.finishIdleVideo=()=>new Promise(resolve=>{recorder.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));stream.getTracks().forEach(t=>t.stop());renderer.background.color=oldColor;renderer.background.alpha=oldAlpha;resolve(btoa(text));};recorder.stop();});
  recorder.start(500);rigReview.play();
 });
 const observed=[];for(let i=0;i<27;i++){await page.waitForTimeout(500);observed.push(await page.evaluate(()=>rigReview.sample()));}
 const wraps=observed.slice(1).filter((p,i)=>p.time<observed[i].time).length;assert(wraps>=3,'Three real-time loop boundaries');
 const video=Buffer.from(await page.evaluate(()=>finishIdleVideo()),'base64');await fs.writeFile(path.join(dir,'idle-three-loops.webm'),video);report.continuousVideoCaptured=true;report.recording={file:'idle-three-loops.webm',bytes:video.length,normalSpeed:true,observedLoopBoundaries:wraps};
 await page.evaluate(()=>rigReview.pause());const before=await page.evaluate(()=>rigReview.sample());await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>rigReview.sample())).time,before.time);
 report.slowSpeeds=[];
 for(const speed of [.25,.5]){await page.selectOption('#speed',String(speed));await page.evaluate(()=>{rigReview.seek(.2);rigReview.play();});await page.waitForTimeout(600);const p=await page.evaluate(()=>rigReview.sample());assert(Math.abs(p.time-(.2+.6*speed))<.08);report.slowSpeeds.push({speed,time:p.time,expectedTime:.2+.6*speed});}
 await page.selectOption('#speed','2');await page.evaluate(()=>{rigReview.seek(.2);rigReview.play();});await page.waitForTimeout(300);const accelerated=await page.evaluate(()=>rigReview.sample());assert(accelerated.time>.65&&accelerated.time<1.1);
 await page.evaluate(()=>rigReview.setVisible(false));const hidden=await page.evaluate(()=>rigReview.sample());await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>rigReview.sample())).time,hidden.time);
 await page.evaluate(()=>rigReview.setVisible(true));await page.waitForTimeout(180);assert.notEqual((await page.evaluate(()=>rigReview.sample())).time,hidden.time);await page.evaluate(()=>rigReview.pause());
 report.controls={pause:true,speed2:true,hiddenFreeze:true,resume:true};assert.equal(errors.length,0);report.errors=errors;
 await page.selectOption('#speed','1');await page.evaluate(()=>{rigReview.setBackground('dark');rigReview.seek(1.4);});await page.waitForTimeout(150);await page.locator('#stage').screenshot({path:path.join(dir,'idle-dark-peak.png')});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{rigReview.setBackground('light');rigReview.seek(1.4);});await page.waitForTimeout(150);await page.screenshot({path:path.join(dir,'idle-mobile-390.png'),fullPage:true});
 const mobile=await page.evaluate(()=>{const c=document.querySelector('#stage canvas').getBoundingClientRect();return {pageWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasWidth:c.width,canvasCount:document.querySelectorAll('#stage canvas').length,...rigReview.sample()};});assert(mobile.scrollWidth<=mobile.pageWidth);assert.equal(mobile.canvasCount,1);report.mobile=mobile;
 await context.close();await fs.writeFile(path.join(dir,'playback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({geometry,recording:report.recording,controls:report.controls,mobile:{width:mobile.pageWidth,noOverflow:true},errors}));
}finally{await browser.close();}
