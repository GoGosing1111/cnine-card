import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}});
try{
 await page.goto('http://127.0.0.1:8973/preview/mercenary-bathory-halloween-20261019-v1/');await page.waitForFunction(()=>window.BathoryPreview);
 await page.locator('#stage').scrollIntoViewIfNeeded();
 const speeds=await page.evaluate(async()=>{const f=BathoryPreview.fx;BathoryPreview.queue.active=false;const out=[];for(const speed of [.25,.5,1,2]){f.setMode('skill');f.setSpeed(speed);f.play();await new Promise(r=>setTimeout(r,180));f.pause();out.push({speed,time:f.time,expected:.18*speed});}return out;});for(const r of speeds)assert(Math.abs(r.time-r.expected)<.18);
 for(const [name,t]of [['windup',1.05],['first-contact',.66],['finish-contact',1.5]]){await page.evaluate(t=>{const f=BathoryPreview.fx;f.setMode('skill');f.setEffects(false);f.seek(t);},t);await page.locator('#stage').screenshot({path:fileURLToPath(new URL('qa/'+name+'.png',import.meta.url))});}
 const result=await page.evaluate(async()=>{
  const r=BathoryPreview,f=r.fx;r.queue.active=false;f.setEffects(true);f.setSpeed(1);f.setMode('idle');f.pause();
  const stream=r.engine.app.canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  for(const[mode,ms]of [['idle',1800],['dash',900],['attack',1150],['skill',2700],['hit',750],['defeat',1300],['idle',1000]]){f.setMode(mode);f.play();await new Promise(r=>setTimeout(r,ms));}
  recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return {base64:btoa(text),bytes:bytes.length};
 });
 await fs.writeFile(new URL('review-1x.webm',import.meta.url),Buffer.from(result.base64,'base64'));await fs.writeFile(new URL('qa/recording-report.json',import.meta.url),JSON.stringify({speeds,video:'review-1x.webm',bytes:result.bytes,rate:1,framesPerSecond:30},null,2)+'\n');
 // Play the recorded artifact itself and inspect its decoded contact frame.
 await page.setContent('<video controls muted src="http://127.0.0.1:8973/preview/mercenary-bathory-halloween-20261019-v1/review-1x.webm" style="width:100%;background:#090d13"></video>');
 await page.locator('video').evaluate(async v=>{await new Promise(r=>v.readyState>=2?r():v.addEventListener('loadeddata',r,{once:true}));await v.play();});
 await page.waitForTimeout(600);await page.screenshot({path:fileURLToPath(new URL('qa/recorded-playback.png',import.meta.url))});console.log(JSON.stringify({video:'review-1x.webm',bytes:result.bytes,speeds}));
}finally{await browser.close();}
