import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('./',import.meta.url),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 await page.goto('http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/');await page.waitForFunction(()=>window.CyanKnightPreview);
 for(const job of [{file:'review-array-v4.webm',speed:1},{file:'review-array-v4-slow.webm',speed:.4}]){
  const download=page.waitForEvent('download',{timeout:45000});
  const result=await page.evaluate(async(job)=>{
   const {fx,engine}=CyanKnightPreview;fx.zoom=false;fx.setEffects(true);fx.setSpeed(job.speed);fx.setMode('array');
   const stream=engine.app.canvas.captureStream(60),chunks=[],type='video/webm;codecs=vp9',rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:9500000});
   const stopped=new Promise(r=>rec.onstop=r),wait=ms=>new Promise(r=>setTimeout(r,ms));rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.start(250);
   const start=performance.now();await wait(180);fx.play();while(fx.playing)await wait(25);await wait(300);rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const blob=new Blob(chunks,{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=job.file;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
   return{file:job.file,speed:job.speed,duration:(performance.now()-start)/1000,bytes:blob.size,mime:type,source:'actual V3 canvas / GSAP clock',autoZoom:false,visualApproval:false};
  },job);
  await(await download).saveAs(fileURLToPath(new URL(job.file,root)));await fs.writeFile(new URL('qa/array-v4/'+job.file.replace('.webm','.json'),root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }
}finally{await browser.close();}
