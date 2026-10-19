import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
const page=await browser.newPage({viewport:{width:1280,height:720}});
await page.goto('http://127.0.0.1:8973/preview/battle-suit-x-v1/');
await page.evaluate(async()=>{document.body.innerHTML='<video id="reference" muted style="width:1280px;height:720px"></video>';const v=document.getElementById('reference');v.src=URL.createObjectURL(new Blob([await(await fetch('/preview/battle-suit-x-v1/review-v2.webm')).arrayBuffer()],{type:'video/webm'}));await new Promise(r=>v.onloadeddata=r);await v.play();});
await page.waitForTimeout(4200);
for(const [i,t]of [0.7,1.75,2.65].entries()){await page.evaluate(async t=>{const v=document.getElementById('reference');v.pause();v.currentTime=t;await new Promise(r=>v.onseeked=r);},t);await page.screenshot({path:new URL('./qa/x-reference-'+i+'.png',import.meta.url).pathname.replace(/^\//,'')});}
console.log('Approved X reference played at 1x and inspected at three attack beats.');
}finally{await browser.close();}
