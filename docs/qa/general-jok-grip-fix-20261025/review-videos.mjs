import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.cwd(),out='C:/Users/User/.codex/visualizations/2026/10/25/01a170fb-166f-7250-a2e6-d351c185e8ee/general-jok-grip-fix-20261025/video-review';
fs.mkdirSync(out,{recursive:true});
const files={x:path.join(root,'preview/battle-suit-x-v1/review-v2.webm'),desktop:path.join(out,'../browser/desktop-area-review.webm'),mobile:path.join(out,'../browser/mobile-area-review.webm')};
const server=http.createServer((req,res)=>{
 const key=req.url?.split('?')[0].slice(1);if(files[key]){res.writeHead(200,{'content-type':'video/webm'});return fs.createReadStream(files[key]).pipe(res);}
 res.writeHead(200,{'content-type':'text/html'});res.end('<body style="margin:0;background:#111"><video id="v" muted controls style="max-width:100%;max-height:100vh"></video></body>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const key of Object.keys(files)){
  const p=await browser.newPage({viewport:key==='mobile'?{width:390,height:844}:{width:1440,height:1000}});await p.goto(base);
  await p.evaluate(async src=>{const v=document.querySelector('video');v.src=src;await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});await v.play();},base+'/'+key);
  await p.waitForTimeout(300);
  const duration=await p.evaluate(()=>document.querySelector('video').duration);
  const times=key==='x'?[.37,1.43,2.18]:[.1,.45,1.1,2.4];
  for(const time of times){await p.evaluate(async t=>{const v=document.querySelector('video');v.pause();await new Promise(r=>{v.onseeked=r;v.currentTime=t;});},time);await p.screenshot({path:path.join(out,`${key}-${time}.png`)});}
  report.push({key,duration,reviewTimes:times,decoded:true});await p.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));}
