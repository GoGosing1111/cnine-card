import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

export const dir=fileURLToPath(new URL('.',import.meta.url));
export const host='http://127.0.0.1:18766';
export const modes=[
  {id:'skill_flash', motion:'skill_iai', contact:.30, holds:[], phases:[.27,.43,.58,.79],peak:.58},
  {id:'skill_thrust',motion:'skill_rift',contact:.48,holds:[[.48,.065]],phases:[.33,.45,.61,.78],peak:.70},
  {id:'skill_wheel',motion:'skill_tempest',contact:1.22,holds:[[.30,.035],[.64,.05],[1.22,.085]],phases:[.57,.84,1.22,1.43],peak:1.43},
  {id:'skill_rain',motion:'skill_verdict',contact:1.78,holds:[[.66,.02],[1.02,.025],[1.36,.03],[1.78,.11]],phases:[1.09,1.54,1.78,1.99],peak:1.78}
];
export const elapsed=(m,t)=>t+m.holds.reduce((sum,[start,hold])=>sum+(start<t-1e-7?hold:0),0);
export const browser=()=>chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--mute-audio','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
export async function open(b,kind='whitecoat-squad',width=1440) {
  const p=await b.newPage({viewport:{width,height:width<700?844:940},deviceScaleFactor:1});
  await p.goto(host+'/?case='+kind);
  await p.waitForFunction(()=>window.v35Review?.ready || window.v35Review?.errors?.length,null,{timeout:60000});
  const errors=await p.evaluate(()=>v35Review.errors);
  if (errors.length) throw Error(errors.join('\n'));
  return p;
}
export async function start(p,id) {
  return p.evaluate(id=>{
    const a=v35Review, attacker=a.spine.actor;
    a.testPending=a.attack(a.engine.mercenaries.indexOf(attacker),id);
    const timeline=a.engine.pendingTails.get(attacker)?.instance;
    if(!timeline)throw Error('No registered cast '+id);
    timeline.pause();
    return {timeScale:timeline.timeScale(),duration:timeline.duration(),engineRate:a.engine.actionPlaybackSpeed(),
      actorId:attacker.id,impacts:a.impacts.length};
  },id);
}
export async function seek(p,time) {
  return p.evaluate(t=>{
    const a=v35Review,actor=a.spine.actor;
    a.engine.pendingTails.get(actor).instance.time(t,false);
    a.engine.app.render();
    const fx=a.effects.session.audit();
    return {time:a.spine.clock.time,pose:a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name,
      root:[actor.root.x,actor.root.y],hud:actor.hud.y,mode:fx.mode,frames:fx.frames,visible:fx.active,
      targets:fx.targets,impacts:a.impacts.length,anchors:fx.trail?.strokes?.filter(s=>s.bladeAnchorError!==null).map(s=>s.bladeAnchorError) || []};
  },time);
}
export async function cancel(p) {
  await p.evaluate(async()=>{const a=v35Review;a.engine.cancelTimelines();await a.testPending;});
}
export async function capture(p,name) {
  const data=await p.locator('#pvPixiBattle canvas').screenshot({type:'png'});
  await fs.writeFile(path.join(dir,name+'.png'),data);
}
