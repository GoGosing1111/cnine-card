import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']}),results=[];
try{const p=await b.newPage();await p.goto('http://127.0.0.1:18766/?case=whitecoat');await p.waitForFunction(()=>v35Review.ready);
 for(const action of ['skill_tempest','attack_basic','skill_iai','attack_basic','skill_iai']){
  const r=await p.evaluate(async action=>{const a=v35Review,before=a.impacts.length;await a.attack(1,action);return {action,impacts:a.impacts.length-before,last:a.engine.lastMercenaryPlayback,pose:a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name,hudY:a.spine.actor.hud.y,position:[a.spine.actor.root.x,a.spine.actor.root.y],base:[a.spine.actor.baseX,a.spine.actor.baseY],errors:a.errors};},action);results.push(r);
 }
 const anchors=[];for(const [action,time]of [['attack_basic',.40],['skill_iai',.51]]){
  anchors.push(await p.evaluate(async({action,time})=>{const a=v35Review;a.pending=a.attack(1,action);const t=a.engine.pendingTails.get(a.spine.actor).instance;t.pause();t.time(time,false);const errors=a.effects.session.audit().trail.strokes.map(s=>s.bladeAnchorError).filter(x=>x!==null);a.engine.cancelTimelines();await a.pending;return {action,errors};},{action,time}));
 }
 const passed=results.every(r=>r.impacts===1&&r.last.mode===r.action&&r.last.damageApplications===1&&r.pose==='guard'&&r.hudY===-403&&!r.errors.length&&Math.hypot(r.position[0]-r.base[0],r.position[1]-r.base[1])<.01)&&anchors.every(a=>a.errors.length&&a.errors.every(e=>e<.002));
 await fs.writeFile(dir+'legacy.json',JSON.stringify({results,anchors,passed},null,2));console.log({passed,results:results.map(r=>({action:r.action,impacts:r.impacts,pose:r.pose})),anchors});if(!passed)process.exitCode=1;
}finally{await b.close();}
