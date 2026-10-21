import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
 await page.goto('http://127.0.0.1:8916/preview/seal-battle-rework-20261021/');
 await page.locator('[data-seal-role="BOSS"]').click();await page.locator('[data-seal-confirm]').click();
 const captured=await page.evaluate(()=>new Promise(resolve=>{
  const poll=async()=>{const c=window.ProjectVPixiBattle?.diagnostics()?.characterStates?.find(c=>c.sealDragon?.casting&&c.sealDragon?.frame==='breath-2');
   if(!c){requestAnimationFrame(poll);return;}
   const engine=await window.ProjectVPixiBattle.mount();for(const t of engine.simpleTimelines)t.instance.pause();
   requestAnimationFrame(()=>resolve({frame:c.sealDragon,pausedTimelines:engine.simpleTimelines.size}));};poll();
 }));
 await page.screenshot({path:'docs/qa/seal-dragon-20261022/mobile-breath.png'});
 await fs.writeFile('docs/qa/seal-dragon-20261022/breath-capture.json',JSON.stringify(captured,null,2));
 console.log(JSON.stringify(captured));
}finally{await browser.close();}
