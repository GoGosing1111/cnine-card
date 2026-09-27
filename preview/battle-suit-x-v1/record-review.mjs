import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:8973/preview/battle-suit-x-v1/');await page.waitForFunction(()=>window.XBodyPreview);
 const bytes=await page.evaluate(async()=>{
  const {fx,engine}=window.XBodyPreview;
  fx.setMode('skill');fx.setSpeed(1);fx.seek(0);
  const stream=engine.app.canvas.captureStream(60),chunks=[];
  const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:5000000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const stopped=new Promise(resolve=>recorder.onstop=resolve);
  recorder.start();await new Promise(r=>setTimeout(r,350));fx.play();
  await new Promise(r=>setTimeout(r,3800));recorder.stop();await stopped;
  stream.getTracks().forEach(t=>t.stop());
  return Array.from(new Uint8Array(await new Blob(chunks,{type}).arrayBuffer()));
 });
 const path=fileURLToPath(new URL('./review-v2.webm',import.meta.url));await fs.writeFile(path,Buffer.from(bytes));console.log(path+' ('+bytes.length+' bytes)');
}finally{await browser.close();}
