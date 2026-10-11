// Record the actual V3 battle, using its existing GSAP clock at deterministic times.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {MODES,SHOWCASE} from './skill.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('.',import.meta.url)),mode=process.argv[2]||'ultimate',fps=15,width=800;
const modes=mode==='all'?SHOWCASE:[mode];if(modes.some(m=>!MODES[m]))throw Error('Unknown mode');
const browser=await chromium.launch({channel:'chrome',headless:true}),buffers=[],errors=[];let info;
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8876/preview/mercenary-golden-dragon-battle-v1/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.GoldenDragonPreview?.diagnostics().ready);
 await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
 for(const m of modes){await page.locator('[data-mode="'+m+'"]').click();await page.evaluate(()=>window.GoldenDragonPreview.fx.pause());await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
  const duration=MODES[m].duration,count=Math.ceil(duration*fps);
  for(let i=0;i<count;i++){
   await page.evaluate(async t=>{const p=window.GoldenDragonPreview;p.fx.seek(t);p.engine.app.renderer.render(p.engine.app.stage);await new Promise(requestAnimationFrame);},Math.min(duration,i/fps));
   const png=await page.locator('.battle-viewport').screenshot(),raw=await sharp(png).resize({width}).ensureAlpha().raw().toBuffer({resolveWithObject:true});info=raw.info;buffers.push(raw.data);
  }
 }
 const output=root+'qa/'+(mode==='all'?'full-showcase.webp':'ultimate-preview.webp'),count=buffers.length;
 await sharp(Buffer.concat(buffers),{limitInputPixels:false,raw:{width:info.width,height:info.height*count,channels:4,pageHeight:info.height}}).webp({quality:82,effort:0,loop:0,delay:Array.from({length:count},(_,i)=>i===count-1?750:Math.round((i+1)*1000/fps)-Math.round(i*1000/fps))}).toFile(output);
 await fs.writeFile(root+'qa/recording-'+mode+'.json',JSON.stringify({output:output.slice(root.length),modes,fps,frames:count,width,height:info.height,source:'REAL_V3_BATTLE_CANVAS',errors},null,2)+'\n');
 await page.evaluate(()=>window.GoldenDragonPreview.dispose());if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({output,frames:count,errors}));
}finally{await browser.close();}
