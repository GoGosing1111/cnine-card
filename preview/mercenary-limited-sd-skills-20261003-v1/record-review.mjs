import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:1040}});await page.goto('http://127.0.0.1:8978/preview/mercenary-limited-sd-skills-20261003-v1/?character=valter',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.LimitedReview&&window.LimitedReview.diagnostics().character);
const base64=await page.evaluate(async()=>{
 const r=window.LimitedReview,stream=r.engine.app.canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2300000});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const ended=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
 for(const id of ['valter','bongsoon','joeun','ines','orikkung','diim']){await r.select(id);r.seek(0);r.setSpeed(1);r.play();await new Promise(resolve=>setTimeout(resolve,id==='valter'?4900:3800));r.pause();}
 recorder.stop();await ended;stream.getTracks().forEach(t=>t.stop());const buffer=await new Blob(chunks,{type:'video/webm'}).arrayBuffer();let str='';for(const byte of new Uint8Array(buffer))str+=String.fromCharCode(byte);return btoa(str);
});
await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'limited-sd-aura-skills-review.webm',Buffer.from(base64,'base64'));console.log('Saved actual V3 canvas recording: qa/limited-sd-aura-skills-review.webm');
await page.close();}finally{await browser.close();}
