// Deterministic recording of the real V3 canvas, not extra generated sprites.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import sharp from 'sharp';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.CrimsonKnightPreview?.diagnostics().ready);await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
 await page.selectOption('#mode','ultimate');await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
 const buffers=[];let info;const count=103;
 for(let i=0;i<count;i++){await page.evaluate(async t=>{window.CrimsonKnightPreview.fx.seek(t);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},i/15);const png=await page.locator('.battle-viewport').screenshot();const raw=await sharp(png).resize({width:960}).ensureAlpha().raw().toBuffer({resolveWithObject:true});info=raw.info;buffers.push(raw.data);}
 const output=root+'qa/ultimate-preview.webp';await sharp(Buffer.concat(buffers),{raw:{width:info.width,height:info.height*count,channels:4,pageHeight:info.height}}).webp({quality:78,effort:0,loop:0,delay:Array.from({length:count},(_,i)=>i===count-1?700:67)}).toFile(output);
 const meta=await sharp(output,{animated:true}).metadata();console.log(JSON.stringify({output,pages:meta.pages,width:meta.width,pageHeight:meta.pageHeight,errors}));if(errors.length)process.exitCode=1;
 await page.evaluate(()=>window.CrimsonKnightPreview.dispose());
}finally{await browser.close();}
