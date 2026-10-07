import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});const report=[];
try{for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});await page.goto('http://127.0.0.1:8975/preview/battle-suit-sx-v1/');await page.waitForFunction(()=>window.SXBodyPreview);
 const downloadPromise=page.waitForEvent('download',{timeout:90000});const result=await page.evaluate(async()=>{
  const {fx,engine}=window.SXBodyPreview,stream=engine.app.canvas.captureStream(30),chunks=[],samples=[],type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:5000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(r=>recorder.onstop=r);recorder.start();
  for(const [mode,ms]of [['idle',1100],['dash',1950],['attack',1800],['skill',4150],['ultimate',5950]]){fx.setMode(mode);fx.setSpeed(1);fx.play();await new Promise(r=>setTimeout(r,Math.min(ms,700)));samples.push(fx.diagnostics());await new Promise(r=>setTimeout(r,ms-Math.min(ms,700)));}
  fx.setMode('attack');fx.setEffects(false);fx.setSpeed(.5);fx.play();await new Promise(r=>setTimeout(r,1900));fx.pause();samples.push(fx.diagnostics());await new Promise(r=>setTimeout(r,400));recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='sx-review.webm';link.click();return{bytes:blob.size,samples};
 });const path=fileURLToPath(new URL('review-'+name+'-v2.webm',import.meta.url));const download=await downloadPromise;await download.saveAs(path);report.push({name,path,bytes:result.bytes,samples:result.samples});console.log(name+' video: '+result.bytes+' bytes');await page.close();
}}finally{await browser.close();}
await fs.writeFile(fileURLToPath(new URL('qa/slash-v2/recording-report.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
