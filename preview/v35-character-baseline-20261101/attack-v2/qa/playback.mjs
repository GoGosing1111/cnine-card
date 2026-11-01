import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import sharp from 'sharp';
const dir=fileURLToPath(new URL('../',import.meta.url)),file=p=>path.join(dir,p),native=JSON.parse(await fs.readFile(file('qa/native.json'),'utf8')),geometry=JSON.parse(await fs.readFile(file('qa/geometry.json'),'utf8'));
assert.equal(geometry.visibleFlips,0);assert.equal(geometry.nonFinite,0);assert(geometry.backPlantDrift<.001);assert(geometry.frontPlantDrift<.001);assert(geometry.weaponLengthError<.001);assert(geometry.endpointError<.001);assert(Object.values(geometry.gaps).every(x=>x<.001));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:1120},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:18765'?r.continue():r.abort());await page.goto('http://127.0.0.1:18765/');await page.waitForFunction(()=>window.rigReview?.ready);
 const report={nativeSha256:native.nativeSha256,geometry,desktopInput:false,physicalDevice:false,continuousVisualReview:false};
 await page.evaluate(()=>{
  rigReview.select('idle',true);rigReview.setBackground('dark');rigReview.contacts.length=0;
  const renderer=rigReview.engine.app.renderer;renderer.background.color=0x142333;renderer.background.alpha=1;
  const stream=document.querySelector('#stage canvas').captureStream(60),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  window.finishVideo=()=>new Promise(resolve=>{recorder.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let out='';for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));stream.getTracks().forEach(t=>t.stop());renderer.background.alpha=0;resolve(btoa(out));};recorder.stop();});recorder.start(250);
 });
 const runs=[];
 for(let i=0;i<3;i++){await page.waitForTimeout(400);await page.click('#attack');await page.waitForTimeout(1280);runs.push(await page.evaluate(()=>rigReview.sample()));assert.equal(runs[i].action,'idle');}
 await page.waitForTimeout(400);const video=Buffer.from(await page.evaluate(()=>finishVideo()),'base64');await fs.writeFile(file('qa/attack-three-runs.webm'),video);
 report.recording={file:'attack-three-runs.webm',bytes:video.length,realTimeAttacks:3,returnToIdle:3,normalSpeed:true};report.contacts=await page.evaluate(()=>rigReview.contacts);
 for(const name of ['visual_contact','step_land','step_recover'])assert.equal(report.contacts.filter(e=>e.name===name).length,3);
 await page.click('#attack');await page.waitForTimeout(200);await page.evaluate(()=>rigReview.pause());const paused=await page.evaluate(()=>rigReview.sample());await page.waitForTimeout(200);assert.equal((await page.evaluate(()=>rigReview.sample())).time,paused.time);
 report.speeds=[];for(const speed of [.25,.5,2]){await page.selectOption('#speed',String(speed));await page.evaluate(()=>{rigReview.select('attack_basic',false);rigReview.seek(.1);rigReview.play();});await page.waitForTimeout(250);const p=await page.evaluate(()=>rigReview.sample());assert(Math.abs(p.time-(.1+.25*speed))<.12);report.speeds.push({speed,time:p.time});}
 await page.selectOption('#speed','1');await page.evaluate(()=>rigReview.select('attack_basic',true));await page.waitForTimeout(160);await page.evaluate(()=>rigReview.setVisible(false));const hidden=await page.evaluate(()=>rigReview.sample());await page.waitForTimeout(200);assert.equal((await page.evaluate(()=>rigReview.sample())).time,hidden.time);await page.evaluate(()=>rigReview.setVisible(true));await page.waitForTimeout(130);assert.notEqual((await page.evaluate(()=>rigReview.sample())).time,hidden.time);
 report.cancellations=[];
 for(const t of [.20,.34,.80]){const jump=await page.evaluate(t=>{rigReview.select('attack_basic',false);rigReview.seek(t);const before=rigReview.sample();rigReview.select('idle',true);const after=rigReview.sample();return Math.hypot(before.head.x-after.head.x,before.head.y-after.head.y);},t);assert(jump<.1);await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>rigReview.sample())).action,'idle');report.cancellations.push({time:t,instantHeadJump:jump});}
 report.controls={pause:true,seek:true,speeds:true,hiddenFreeze:true,resume:true};
 const composite=[];report.denseFrames=[];
 for(let i=0;i<=33;i++){
  const time=i/30;await page.evaluate(t=>{rigReview.select('attack_basic',false);rigReview.setBackground('light');rigReview.seek(t);},time);await page.waitForTimeout(20);
  const canvas=await page.locator('#stage').screenshot(),cell=await sharp(canvas).extract({left:200,top:430,width:550,height:370}).resize(275,185).png().toBuffer();
  const label=Buffer.from('<svg width="275" height="24"><text x="10" y="18" font-family="sans-serif" font-size="15" fill="#15202c">'+time.toFixed(3)+' s</text></svg>');
  composite.push({input:cell,left:(i%6)*275,top:Math.floor(i/6)*209+24},{input:label,left:(i%6)*275,top:Math.floor(i/6)*209});report.denseFrames.push(time);
 }
 await sharp({create:{width:1650,height:1254,channels:4,background:'#e2e5e8'}}).composite(composite).png().toFile(file('qa/knees-30fps.png'));
 await page.evaluate(()=>{rigReview.select('attack_basic',false);rigReview.seek(.34);rigReview.setBackground('dark');});await page.waitForTimeout(50);await page.locator('#stage').screenshot({path:file('qa/contact-dark.png')});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.screenshot({path:file('qa/attack-mobile-390.png'),fullPage:true});report.mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvases:document.querySelectorAll('#stage canvas').length}));assert(report.mobile.scrollWidth<=report.mobile.width);assert.equal(report.mobile.canvases,1);assert.equal(errors.length,0);report.errors=errors;
 await fs.writeFile(file('qa/playback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({recording:report.recording,events:report.contacts.length,controls:report.controls,mobile:report.mobile,errors}));
}finally{await browser.close();}
