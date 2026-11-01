import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[];
try{for(const enabled of [false,true]){
 const context=await browser.newContext({viewport:{width:1280,height:850},recordVideo:{dir,size:{width:1280,height:850}}});const page=await context.newPage();await page.goto('http://127.0.0.1:18766/?case=mixed');await page.waitForFunction(()=>v35Review.ready);
 const result=await page.evaluate(async enabled=>{const api=v35Review;api.effects.setEnabled(enabled);document.querySelector('#effects').checked=enabled;const frames=[];let maximum=0,running=true;function tick(){if(!running)return;const fx=api.effects.session?.audit();if(fx){frames.push({time:fx.time,frames:fx.frames,active:fx.active});maximum=Math.max(maximum,fx.active);}requestAnimationFrame(tick);}tick();const start=performance.now();for(let i=0;i<3;i++)await api.attack(1);running=false;return {enabled,ms:performance.now()-start,frames,maximum,impacts:api.impacts.length,errors:api.errors};},enabled);
 await page.waitForTimeout(150);const video=page.video();await context.close();const name=`normal-${enabled?'on':'off'}.webm`;await video.saveAs(dir+name);reports.push({...result,video:name});
 }
 await fs.writeFile(dir+'normal-playback.json',JSON.stringify({reports,continuousVideoWatched:false,headlessBrowser:true,source:'existing V3 workbench'},null,2));console.log(reports.map(({frames,...r})=>({...r,observedRuntimeFrames:frames.length})));
}finally{await browser.close();}
