import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),base='http://127.0.0.1:18766',browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={cause:{before:'ECONNREFUSED 127.0.0.1:18766; no listener or review-server process',repair:'separate hidden Start-Process, outside the previous terminal session'},videos:[],desktopInput:false,artworkChanged:false,productionDeployment:false};
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview/v35-whitecoat-swordsman-20261102/review.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2));
  const result=await page.evaluate(async()=>{
   const all=[...document.querySelectorAll('video')],checks=[];
   const sample=v=>{const c=document.createElement('canvas');c.width=240;c.height=132;c.getContext('2d').drawImage(v,0,0,c.width,c.height);return c.toDataURL();};
   for(const v of all){v.muted=true;v.currentTime=0;await v.play();const start=v.currentTime,pixels=sample(v);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video failed to advance')),6000);const done=()=>{if(v.currentTime>=start+1.3){clearTimeout(timer);v.removeEventListener('timeupdate',done);resolve();}};v.addEventListener('timeupdate',done);});v.pause();const end=v.currentTime,changed=pixels!==sample(v);await new Promise(r=>{v.onseeked=r;v.currentTime=.4;});const seek=v.currentTime;await v.play();await new Promise(r=>setTimeout(r,250));v.pause();checks.push({src:v.getAttribute('src'),ready:v.readyState,error:v.error?.message||null,secondsAdvanced:end-start,decodedImageChanged:changed,seek,continuedAfterSeek:v.currentTime>seek,dimensions:[v.videoWidth,v.videoHeight]});}
   return checks;
  });report.videos.push({mobile,results:result,errors});await page.screenshot({path:dir+'replay-recovered-'+(mobile?'mobile':'pc')+'.png'});await page.close();
 }
 const page=await browser.newPage();await page.goto(base+'/?case=whitecoat');await page.waitForFunction(()=>window.v35Review?.ready||window.v35Review?.errors.length,{},{timeout:60000});
 report.battle=await page.evaluate(async()=>{const api=v35Review;if(!api.ready)return {ready:false,errors:api.errors};for(const mode of ['attack_basic','skill_iai'])await api.attack(1,mode);const audit=api.audit();return {ready:api.ready,impacts:audit.impacts.length,errors:audit.errors,returned:audit.actors.every(a=>Math.hypot(a.root.x-a.base.x,a.root.y-a.base.y)<.01),canvasCount:audit.canvasCount};});await page.close();
 const range=await fetch(base+'/preview/v35-whitecoat-swordsman-20261102/qa/normal-effects-on.webm',{headers:{Range:'bytes=1024-2047'}});const expected=await fs.readFile(dir+'normal-effects-on.webm'),part=Buffer.from(await range.arrayBuffer());report.range={status:range.status,contentRange:range.headers.get('content-range'),exactBytes:part.equals(expected.subarray(1024,2048))};
 report.nativeSha256=createHash('sha256').update(await fs.readFile(new URL('../whitecoat-c3ad326c9e61.spine',import.meta.url))).digest('hex');
 report.passed=report.videos.every(x=>!x.errors.length&&x.results.every(v=>!v.error&&v.secondsAdvanced>1&&v.decodedImageChanged&&v.continuedAfterSeek))&&report.battle.ready&&report.battle.impacts===2&&report.battle.returned&&!report.battle.errors.length&&report.range.status===206&&report.range.exactBytes;
 await fs.writeFile(dir+'replay-recovery.json',JSON.stringify(report,null,2));console.log(report);if(!report.passed)process.exitCode=1;
}finally{await browser.close();}
