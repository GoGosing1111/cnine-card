import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio']});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:18766/preview/v35-v3-upgrade-20261101/qa/reader.html');
 const result=await page.evaluate(async()=>{const v=document.createElement('video');v.src=URL.createObjectURL(await(await fetch('/preview/v35-effects-production-20261102/qa/normal-on.webm')).blob());v.muted=true;await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=j;});if(!Number.isFinite(v.duration)){v.currentTime=1e6;await new Promise(r=>v.onseeked=r);}const duration=Number.isFinite(v.duration)?v.duration:v.currentTime;
  const canvas=document.createElement('canvas'),w=480,h=319;canvas.width=w*3;canvas.height=(h+26)*4;const ctx=canvas.getContext('2d');ctx.fillStyle='#0b1520';ctx.fillRect(0,0,canvas.width,canvas.height);const times=[];
  for(let i=0;i<12;i++){const t=.2+(duration-.35)*i/12;v.currentTime=t;await new Promise(r=>v.onseeked=r);const x=(i%3)*w,y=Math.floor(i/3)*(h+26);ctx.drawImage(v,x,y,w,h);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText('Normal ON / '+t.toFixed(3)+'s',x+10,y+h+18);times.push(t);}
  return {png:canvas.toDataURL('image/png').split(',')[1],times,duration,dimensions:[v.videoWidth,v.videoHeight]};});
 await fs.writeFile(dir+'normal-frames.png',Buffer.from(result.png,'base64'));delete result.png;await fs.writeFile(dir+'video-frames.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
