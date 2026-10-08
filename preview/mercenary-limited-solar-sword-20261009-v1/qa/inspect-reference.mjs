import { chromium } from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import sharp from 'sharp';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try {
 const page=await browser.newPage({viewport:{width:1000,height:620}});
 await page.setContent('<body style="margin:0;background:#030810"><video muted style="width:1000px;height:620px;object-fit:contain" src="http://127.0.0.1:8914/preview/battle-suit-x-v1/review-v2.webm"></video></body>');
 await page.locator('video').evaluate(async v=>{await v.play();});
 await page.waitForTimeout(3800);
 const panels=[];
 for(const [i,t] of [0.5,1.0,1.7,2.5].entries()) {
  await page.locator('video').evaluate((v,t)=>new Promise(resolve=>{v.pause();v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;}),t);
  panels.push({input:await sharp(await page.screenshot()).resize(500,310).png().toBuffer(),left:(i%2)*500,top:Math.floor(i/2)*310});
 }
 await sharp({create:{width:1000,height:620,channels:4,background:'#030810'}}).composite(panels).png().toFile(new URL('./x-approved-playback-reference.png',import.meta.url).pathname.replace(/^\/C:/,'C:'));
 console.log('Viewed X approved actual playback; four time samples saved.');
} finally {await browser.close();}
