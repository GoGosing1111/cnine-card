import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true});
const version=process.argv[2]||'v7';
if(!/^v\d+$/.test(version))throw Error('Expected an idle revision such as v7');
const context=await browser.newContext({viewport:{width:1360,height:820}});
const page=await context.newPage();
try{
  await page.goto(`http://127.0.0.1:8864/preview/prime-requiem-blood-skills-20261021-v1/?v=idle-${version}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.PrimePreview,null,{timeout:60000});
  const closeup=await page.evaluate(()=>{
    const p=window.PrimePreview;p.fx.pause();p.fx.render(0,3.2);
    return p.engine.app.renderer.extract.canvas({target:p.actor.view,resolution:2}).toDataURL('image/png');
  });
  await fs.writeFile(path.join(root,`qa/idle-closeup-${version}.png`),Buffer.from(closeup.split(',')[1],'base64'));
  // Record the real renderer's canvas, omitting page-loading and controls.
  const video=await page.evaluate(async()=>{
    const p=window.PrimePreview;p.select('blood-dash');
    const stream=p.engine.app.canvas.captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
    const done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.start();await new Promise(r=>setTimeout(r,8500));recorder.stop();await done;
    stream.getTracks().forEach(t=>t.stop());
    const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(binary);
  });
  await fs.writeFile(path.join(root,`prime-requiem-idle-${version}.webm`),Buffer.from(video,'base64'));
}finally{await context.close();await browser.close();}
console.log(`Saved actual V3 standing aura: prime-requiem-idle-${version}.webm`);
