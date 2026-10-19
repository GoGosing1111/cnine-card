import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('./',import.meta.url),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});await page.goto('http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/');await page.waitForFunction(()=>window.CyanKnightPreview);
 for(const [file,modes]of [['review-array-v2.webm',['array']],['review-all-skills-v2.webm',['horizon','flurry','meteor','array','zenith']]]){
  const bytes=await page.evaluate(async modes=>{
   const {fx,engine,modes:definitions}=CyanKnightPreview;fx.setEffects(true);fx.setSpeed(1);fx.setMode(modes[0]);fx.seek(0);
   const stream=engine.app.canvas.captureStream(60),chunks=[],type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
   const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:7000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const stopped=new Promise(r=>recorder.onstop=r);recorder.start();
   for(const mode of modes){fx.setMode(mode);await new Promise(r=>setTimeout(r,300));fx.play();await new Promise(r=>setTimeout(r,definitions[mode].duration*1000+350));}
   recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type}).arrayBuffer()));
  },modes);
  await fs.writeFile(new URL(file,root),Buffer.from(bytes));console.log(file+' '+bytes.length+' bytes');
 }
}finally{await browser.close();}
