import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const report={date:new Date().toISOString(),source:'REALTIME_CANVAS_RECORDINGS',screens:[]};
try{
 for(const [name,viewport]of [['desktop',{width:1360,height:680}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});
  await page.goto('http://127.0.0.1:8878/preview/mercenary-imperial-archer-sss-v1/review.html');
  await page.setContent('<style>body{margin:0;background:#090c13}video{width:100%;height:100vh;object-fit:contain}</style><video muted playsinline preload="auto" src="http://127.0.0.1:8878/preview/mercenary-imperial-archer-sss-v1/qa/arrow-v2/'+name+'-showcase.webm"></video>');
  await page.evaluate(async()=>{const v=document.querySelector('video'),r=await fetch(v.src),blob=new Blob([await r.arrayBuffer()],{type:'video/webm'});v.src=URL.createObjectURL(blob);v.load();});
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const metadata=await page.evaluate(()=>{const v=document.querySelector('video');return{width:v.videoWidth,height:v.videoHeight,duration:Number.isFinite(v.duration)?v.duration:null};});
  for(const time of [7.85,11.96,16.4,17.75]){
   await page.evaluate(t=>new Promise(resolve=>{const v=document.querySelector('video');v.pause();v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=t;}),time);
   await page.waitForTimeout(80);
   const actual=await page.evaluate(()=>document.querySelector('video').currentTime);if(Math.abs(actual-time)>.06)throw Error('Video seek failed '+actual+' / '+time);
   await page.screenshot({path:file('qa/arrow-v2/video-'+name+'-'+time+'.png')});
  }
  report.screens.push({name,...metadata,inspectedTimes:[7.85,11.96,16.4,17.75]});await page.close();
 }
 report.status='CAPTURED_FOR_VISUAL_REVIEW';await fs.writeFile(file('qa/arrow-v2/video-inspection.json'),JSON.stringify(report,null,2));
}finally{await browser.close();}
console.log(JSON.stringify(report));
