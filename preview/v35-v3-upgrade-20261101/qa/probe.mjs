import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),kind=process.argv[2]||'sword';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:process.argv.includes('--mobile')?{width:390,height:844}:{width:1440,height:950},deviceScaleFactor:1});const failed=[];
await page.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'||u.protocol==='data:'?route.continue():route.abort();});
page.on('pageerror',e=>failed.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
await page.goto('http://127.0.0.1:18766/?case='+kind,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.v35Review?.ready||window.v35Review?.errors.length,{timeout:60000});
await page.screenshot({path:path.join(dir,kind+'-idle.png')});
console.log(JSON.stringify(await page.evaluate(()=>({audit:window.v35Review.ready?window.v35Review.audit():window.v35Review.errors,geometry:['#controls','#modal','.battle-v3-live-shell','.battle-v3-dock','#pvPixiBattle'].map(s=>{const el=document.querySelector(s);return {selector:s,rect:el?.getBoundingClientRect(),minHeight:el?getComputedStyle(el).minHeight:null,height:el?getComputedStyle(el).height:null};})})),null,2));console.log(JSON.stringify({failed}));
}finally{await browser.close();}
