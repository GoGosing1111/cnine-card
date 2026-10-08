import fs from'node:fs/promises';import{fileURLToPath}from'node:url';import{chromium}from'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{for(const [name,viewport]of[['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
const page=await browser.newPage({viewport,deviceScaleFactor:1});await page.goto('http://127.0.0.1:8914/preview/mercenary-limited-solar-sword-20261009-v1/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.SolarPreview);
const result=await page.evaluate(async()=>{
const r=window.SolarPreview,f=r.fx,canvas=r.engine.app.canvas,stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000}),saved=f.onComplete,segments=[];
recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const end=new Promise(resolve=>recorder.onstop=resolve);recorder.start();const started=performance.now();
async function segment(mode,{from=0,speed=1,effects=true}={}){f.setMode(mode);f.setEffects(effects);f.setSpeed(speed);f.seek(from);segments.push({mode,from,speed,effects,start:(performance.now()-started)/1000});await new Promise(resolve=>{f.onComplete=resolve;f.play();});}
await segment('aura',{from:4.3});await segment('dash');await segment('attack');await segment('skill');await segment('ultimate');await segment('attack',{speed:.5,effects:false});
f.onComplete=saved;f.pause();await new Promise(r=>setTimeout(r,150));recorder.stop();await end;stream.getTracks().forEach(t=>t.stop());
const blob=new Blob(chunks,{type:'video/webm'}),base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});return{base64,segments,width:canvas.width,height:canvas.height,silent:true,actualV3Renderer:true};
});
await fs.writeFile(file('review-'+name+'-v2.webm'),Buffer.from(result.base64,'base64'));delete result.base64;reports.push({name,...result});console.log(JSON.stringify({name,segments:result.segments,width:result.width,height:result.height}));await page.close();
}}finally{await browser.close();}
await fs.writeFile(file('qa/recording-report.json'),JSON.stringify(reports,null,2)+'\n');
