import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {elapsedAt} from '../timing.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={views:[],errors:[]};
try{
 const p=await b.newPage({viewport:{width:1440,height:950}});p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto('http://127.0.0.1:18766/?case=whitecoat');await p.waitForFunction(()=>v35Review.ready||v35Review.errors.length);report.init=await p.evaluate(()=>v35Review.errors);if(report.init.length)throw Error(report.init.join('\n'));
 for(const on of [false,true]){
  await p.evaluate(on=>{const a=v35Review;a.effects.setEnabled(on);a.pending=a.attack(1,'skill_tempest');const t=a.engine.pendingTails.get(a.spine.actor)?.instance;if(!t)throw Error('No timeline');t.pause();},on);
  for(const time of [.30,.48,.64,.75,.84,.98,1.10,1.16,1.22,1.32,1.40,1.57,1.97]){
   const sample=await p.evaluate(({time,elapsed})=>{const a=v35Review;a.engine.pendingTails.get(a.spine.actor).instance.time(elapsed,false);a.engine.app.render();return {time,elapsed,attachment:a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name,fx:a.effects.audit(),root:{x:a.spine.actor.root.x,y:a.spine.actor.root.y},nativeRoot:{x:a.spine.rig.skeleton.findBone('root').appliedPose.worldX,y:a.spine.rig.skeleton.findBone('root').appliedPose.worldY}};},{time,elapsed:elapsedAt(time)});
   const file=(on?'on':'off')+'-'+Math.round(time*1000)+'.png';await p.screenshot({path:dir+file});report.views.push({on,file,...sample});
  }
  await p.evaluate(async()=>{v35Review.engine.cancelTimelines();await v35Review.pending;});
 }
 report.audit=await p.evaluate(()=>v35Review.audit());report.passed=!report.errors.length&&!report.audit.errors.length;
}catch(e){report.passed=false;report.error=e.stack;}
finally{await fs.writeFile(dir+'inspection.json',JSON.stringify(report,null,2));console.log({passed:report.passed,error:report.error,errors:report.errors});await b.close();if(!report.passed)process.exitCode=1;}
