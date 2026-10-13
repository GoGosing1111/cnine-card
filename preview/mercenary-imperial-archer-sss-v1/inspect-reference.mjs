import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto('http://127.0.0.1:8878/preview/battle-suit-x-v1/');
await page.setContent('<video style="width:100%;height:780px" muted controls></video>');
await page.locator('video').evaluate(async v=>{v.src=URL.createObjectURL(await (await fetch('/preview/battle-suit-x-v1/review-v2.webm')).blob());v.muted=true;await v.play();});
await page.waitForTimeout(4000);
const playback=await page.locator('video').evaluate(v=>({playing:!v.paused,time:v.currentTime,duration:v.duration,muted:v.muted}));
await page.locator('video').evaluate(v=>v.pause());
for(const at of [.6,1.6,2.6,3.6]){
 await page.locator('video').evaluate((v,t)=>new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;}),at);
 await page.screenshot({path:base+`qa/x-reference-${at}.png`});
}
await fs.writeFile(base+'qa/reference-playback.json',JSON.stringify({reference:'preview/battle-suit-x-v1/review-v2.webm',playback,frames:[.6,1.6,2.6,3.6]},null,2));
console.log(playback);await browser.close();
