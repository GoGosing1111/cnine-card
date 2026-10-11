import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true});const report=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>report.push({error:e.message}));page.on('response',r=>{if(r.status()>=400)report.push({status:r.status(),url:r.url()});});
 await page.goto('http://127.0.0.1:8876/preview/mercenary-golden-dragon-battle-v1/',{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>window.GoldenDragonPreview||document.getElementById('health').textContent.includes('실패'),null,{timeout:60000});
 const state=await page.evaluate(()=>({health:document.getElementById('health').textContent,ready:!!window.GoldenDragonPreview}));report.push(state);if(!state.ready)throw Error(state.health);
 for(const [mode,t] of [['aura',1.5],['attack',.79],['skill',1.5],['ultimate',2.08]]){
  await page.locator('[data-mode="'+mode+'"]').click();await page.evaluate(t=>window.GoldenDragonPreview.fx.seek(t),t);await page.waitForTimeout(150);
  await page.locator('.battle-viewport').screenshot({path:path.join(root,'qa','desktop-'+mode+'.png')});
  report.push(await page.evaluate(()=>{const p=window.GoldenDragonPreview;return {...p.diagnostics(),scene:p.engine.scene,actor:{baseX:p.merc.baseX,baseY:p.merc.baseY,scale:p.merc.root.scale.x,bounds:p.merc.fullBodySprite.getBounds()},target:p.fx.point(p.fx.targets[0])};}));
 }
 await page.screenshot({path:path.join(root,'qa/desktop-page.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.locator('[data-mode="ultimate"]').click();await page.evaluate(()=>window.GoldenDragonPreview.fx.seek(2.08));await page.waitForTimeout(150);
 await page.locator('.battle-viewport').screenshot({path:path.join(root,'qa/mobile-ultimate.png')});await page.screenshot({path:path.join(root,'qa/mobile-page.png'),fullPage:true});
 report.push({mobile:await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,diagnostics:window.GoldenDragonPreview.diagnostics()}))});
}finally{await browser.close();await fs.writeFile(path.join(root,'qa/smoke-report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report.map(r=>({error:r.error,health:r.health,mode:r.mode,pose:r.pose,unit:r.unit,scene:r.scene,actor:r.actor,target:r.target,mobile:r.mobile?.width,overflow:r.mobile?r.mobile.scroll-r.mobile.width:undefined})),null,2));
