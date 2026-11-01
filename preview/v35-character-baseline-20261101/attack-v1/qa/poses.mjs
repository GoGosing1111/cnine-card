import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:1280,height:1120},deviceScaleFactor:1});await page.goto('http://127.0.0.1:18764/');await page.waitForFunction(()=>window.rigReview?.ready);const poses=[];
for(const time of [0,.12,.26,.32,.36,.4,.44,.54,.68,.84,1.02,1.2]){const pose=await page.evaluate(t=>{rigReview.select('attack_basic',false);rigReview.setBackground('light');return rigReview.seek(t);},time);await page.waitForTimeout(70);const file='pose-'+time.toFixed(3).replace('.','-')+'.png';await page.locator('#stage').screenshot({path:path.join(dir,file)});poses.push({file,...pose});}
await fs.writeFile(path.join(dir,'poses.json'),JSON.stringify(poses,null,2));console.log(JSON.stringify({count:poses.length,errors:await page.evaluate(()=>rigReview.errors)}));
}finally{await browser.close();}
