import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report=[];
try{for(const variant of ['mixed','enemy','mobile']){
 const context=await browser.newContext({viewport:variant==='mobile'?{width:390,height:844}:{width:1440,height:950}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:18766/?case='+(variant==='enemy'?'enemy':'mixed'));await page.waitForFunction(()=>v35Review.ready);
 await page.evaluate(()=>{const api=v35Review;api.pause(true);api.pending=api.attack(1);api.testTimeline=api.engine.pendingTails.get(api.spine.actor).instance;api.testTimeline.pause();});
 const frames=[];
 for(const t of [.20,.27,.34,.40,.46,.60,.85,1.12]){
  const record=await page.evaluate(t=>{const api=v35Review;api.testTimeline.time(t,false);api.engine.app.render();const fx=api.effects.audit();return {t,fx,impacts:api.impacts.length,canvasCount:document.querySelectorAll('canvas').length,root:{x:api.spine.actor.root.x,y:api.spine.actor.root.y},nativeTime:api.spine.clock.time,errors:api.errors};},t);
  if(t<1.12){await page.screenshot({path:path.join(dir,`${variant}-${Math.round(t*100)}-on.png`)});if(t===.40){await page.evaluate(()=>{v35Review.effects.setEnabled(false);v35Review.engine.app.render();});await page.screenshot({path:path.join(dir,`${variant}-40-off.png`)});await page.evaluate(()=>{v35Review.effects.setEnabled(true);v35Review.effects.session?.render(v35Review.effects.session.audit().time);v35Review.engine.app.render();});}}
  frames.push(record);
 }
 await page.evaluate(()=>v35Review.pending);report.push({variant,frames});await context.close();
 }
 await fs.writeFile(dir+'visual.json',JSON.stringify(report,null,2));console.log(report.map(r=>({variant:r.variant,active:r.frames.map(f=>f.fx.active?.active||0),impacts:r.frames.at(-1).impacts,errors:r.frames.flatMap(f=>f.errors)})));
}finally{await browser.close();}
