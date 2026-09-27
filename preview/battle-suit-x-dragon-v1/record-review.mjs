import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [name,viewport]of[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:8973/preview/battle-suit-x-dragon-v1/');
  await page.waitForFunction(()=>window.XBodyDragonPreview);
  const bytes=await page.evaluate(async()=>{
   const review=window.XBodyDragonPreview;review.select('dragon',false);
   const {fx,engine}=review;fx.setSpeed(1);fx.seek(0);
   const stream=engine.app.canvas.captureStream(60),chunks=[];
   const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
   const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:5000000});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   const stopped=new Promise(resolve=>recorder.onstop=resolve);
   recorder.start();await new Promise(r=>setTimeout(r,350));fx.play();
   await new Promise(r=>setTimeout(r,5200));recorder.stop();await stopped;
   stream.getTracks().forEach(t=>t.stop());
   return Array.from(new Uint8Array(await new Blob(chunks,{type}).arrayBuffer()));
  });
  const path=fileURLToPath(new URL('./review-dragon-'+name+'-v1.webm',import.meta.url));
  await fs.writeFile(path,Buffer.from(bytes));console.log(path+' ('+bytes.length+' bytes)');
  await page.close();
 }
}finally{await browser.close();}
