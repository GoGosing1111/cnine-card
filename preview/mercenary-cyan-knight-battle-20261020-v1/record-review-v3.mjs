import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('./',import.meta.url),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const jobs=process.argv.includes('--slow')?[{file:'review-effects-v3-slow.webm',speed:.4,modes:['meteor','array']}]:[{file:'review-effects-v3.webm',speed:1,modes:['horizon','flurry','meteor','array','zenith']}];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 await page.goto('http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/');await page.waitForFunction(()=>window.CyanKnightPreview);
 for(const job of jobs){
  const download=page.waitForEvent('download',{timeout:60000});
  const result=await page.evaluate(async(job)=>{
   const {fx,engine,modes}=CyanKnightPreview;fx.setEffects(true);fx.setSpeed(job.speed);fx.setMode(job.modes[0]);
   const stream=engine.app.canvas.captureStream(60),chunks=[],type='video/webm;codecs=vp9',rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:9500000});
   const stopped=new Promise(r=>rec.onstop=r),wait=ms=>new Promise(r=>setTimeout(r,ms));rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.start(250);
   const events=[],start=performance.now();
   for(const mode of job.modes){fx.setMode(mode);await wait(180);events.push({mode,at:(performance.now()-start)/1000});fx.play();while(fx.playing)await wait(35);await wait(250);}
   await wait(200);rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const blob=new Blob(chunks,{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=job.file;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
   return{file:job.file,speed:job.speed,events,duration:(performance.now()-start)/1000,bytes:blob.size,mime:type,source:'actual V3 canvas / GSAP clock',visualApproval:false};
  },job);
  await(await download).saveAs(fileURLToPath(new URL(job.file,root)));await fs.writeFile(new URL('qa/effects-v3/'+job.file.replace('.webm','.json'),root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }
}finally{await browser.close();}
