import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {browser,start,seek,cancel,modes,elapsed} from '../../swordplay-v5/qa/probe.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),checks=[],consoleErrors=[];
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const snap=p=>p.evaluate(()=>v35Review.spine.aura.audit());
const b=await browser();
try {
 const delivery=JSON.parse(await fs.readFile(dir+'../../skills-v4/qa/native.json'));
 const hash=createHash('sha256').update(await fs.readFile(dir+'../../'+delivery.native)).digest('hex');
 check('Original Spine motion master remains byte-identical',hash===delivery.nativeSha256,hash);
 const authored=JSON.parse(await fs.readFile(dir+'native.json'));
 check('Sixteen distinct cels have clean borders and native roundtrip equality',authored.reports.every(r=>r.drawings===8&&r.roundTripBinaryEqual)&&authored.cropAudit.every(r=>!r.border));
 for(const [kind,width] of [['whitecoat-squad',1440],['whitecoat-squad',390],['whitecoat-squad-enemy',390],['whitecoat-squad-enemy',320]]) {
  const label=kind+'/'+width,p=await b.newPage({viewport:{width,height:width>700?940:844}});
  p.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Could not initialize shader|program not valid/i.test(m.text()))consoleErrors.push(m.text());});
  await p.goto('http://127.0.0.1:18766/?case='+kind);
  await p.waitForFunction(()=>window.v35Review?.ready||window.v35Review?.errors?.length);
  const before=await snap(p);await p.waitForTimeout(180);const after=await snap(p);
  check(label+' idle rotates behind the body',after.time>before.time&&after.behindBody&&after.visible&&after.outline,{before,after});
  await p.evaluate(()=>{v35Review.pause(true);v35Review.spine.aura.render(1.5)});
  const frozen=await snap(p);await p.waitForTimeout(160);
  check(label+' pause freezes aura and silhouette glow',JSON.stringify(await snap(p))===JSON.stringify(frozen));
  const toggled=await p.evaluate(()=>{const a=v35Review,phase=a.spine.aura.time;a.effects.setEnabled(false);const off=a.spine.aura.audit();a.effects.setEnabled(true);const on=a.spine.aura.audit();return {phase,off,on};});
  check(label+' effect switch restores same phase',!toggled.off.visible&&!toggled.off.outline&&toggled.on.visible&&toggled.on.outline&&toggled.on.time===toggled.phase);
  const scene=await p.evaluate(()=>({canvases:document.querySelectorAll('#pvPixiBattle canvas').length,overflow:document.documentElement.scrollWidth>innerWidth,body:v35Review.spine.rig.getBounds()}));
  check(label+' one canvas, no overflow, body within viewport',scene.canvases===1&&!scene.overflow&&scene.body.minX>0&&scene.body.maxX<width,scene);
  await p.locator('#pvPixiBattle canvas').screenshot({path:dir+(width===1440?'idle-stage':kind+'-'+width)+'.png'});
  if(width===1440) {
   const r=scene.body,box=await p.locator('#pvPixiBattle canvas').boundingBox();
   await p.screenshot({path:dir+'idle-closeup.png',clip:{x:r.minX-45,y:r.minY+box.y-35,width:r.maxX-r.minX+80,height:r.maxY-r.minY+55}});
   const pixels=await p.evaluate(()=>{
    const a=v35Review,rig=a.spine.rig,extract=a.engine.app.renderer.extract,bounds=rig.getLocalBounds();
    const frame=new PIXI.Rectangle(bounds.minX-40,bounds.minY-40,bounds.maxX-bounds.minX+80,bounds.maxY-bounds.minY+80),filters=rig.filters;
    const on=extract.canvas({target:rig,frame,resolution:1});rig.filters=[];
    const off=extract.canvas({target:rig,frame,resolution:1});rig.filters=filters;
    const x=on.getContext('2d').getImageData(0,0,on.width,on.height).data,y=off.getContext('2d').getImageData(0,0,off.width,off.height).data;
    let opaque=0,maxDelta=0,added=0;for(let i=0;i<x.length;i+=4){if(y[i+3]===255){opaque++;for(let c=0;c<3;c++)maxDelta=Math.max(maxDelta,Math.abs(x[i+c]-y[i+c]));}if(!y[i+3]&&x[i+3]>30)added++;}
    return {opaque,maxDelta,added,size:[on.width,on.height]};
   });
   check('Outline leaves opaque artwork colours intact and adds exterior light',pixels.opaque>100&&pixels.maxDelta<=2&&pixels.added>100,pixels);
   const rates=[];for(const rate of ['1','0.5']){await p.selectOption('#speed',rate);rates.push(await p.evaluate(()=>v35Review.spine.ambient.instance.timeScale()));}
   check('Idle aura follows the common speed control',Math.abs(rates[0]/rates[1]-2)<1e-6,rates);
   await p.selectOption('#speed','1');
  }
  await p.evaluate(()=>v35Review.pause(false));
  for(const m of modes) {
   const cast=await start(p,m.id),states=[];
   for(const phase of m.phases){await seek(p,elapsed(m,phase));states.push(await p.evaluate(()=>{
    const a=v35Review,s=a.spine,h=s.rig.skeleton.findBone('head').appliedPose;
    const front=s.rig.skeleton.findBone('foot_front').appliedPose,rear=s.rig.skeleton.findBone('foot_rear').appliedPose;
    const feet=s.rig.toGlobal(new PIXI.Point((front.worldX+rear.worldX)/2,(front.worldY+rear.worldY)/2)),head=s.rig.toGlobal(new PIXI.Point(h.worldX,h.worldY));
    const center=s.aura.root.getGlobalPosition(),vx=head.x-feet.x,vy=head.y-feet.y,len=Math.hypot(vx,vy);
    const axisDistance=Math.abs((center.x-feet.x)*vy-(center.y-feet.y)*vx)/len;
    const position=((center.x-feet.x)*vx+(center.y-feet.y)*vy)/(len*len);
    const localHead=s.aura.front.toLocal(head);
    return {aura:s.aura.audit(),phase:s.clock.time,origin:s.auraOrigin,error:axisDistance,position,headTextureY:localHead.y+160};
   }));}
   check(label+'/'+m.id+' follows pose, root and facing without double mirroring',states.every(s=>s.error<1e-5&&s.position>.4&&s.position<.8&&s.headTextureY<110&&s.aura.behindBody&&s.aura.inFrontOfBody&&s.aura.outline&&Math.abs(s.aura.time-s.origin-s.phase)<1e-6),states.map(s=>({phase:s.phase,error:s.error,bodyPosition:s.position,headTextureY:s.headTextureY})));
   const held=await snap(p);await p.waitForTimeout(90);
   check(label+'/'+m.id+' paused attack has no independent aura clock',JSON.stringify(await snap(p))===JSON.stringify(held));
   const identical=await snap(p);await seek(p,.01);await seek(p,elapsed(m,m.phases.at(-1)));
   check(label+'/'+m.id+' backward seek reproduces aura phase',JSON.stringify(await snap(p))===JSON.stringify(identical));
   if(m.holds.length){const [at,length]=m.holds[0];await seek(p,elapsed(m,at)+length*.25);const a=await snap(p);await seek(p,elapsed(m,at)+length*.75);check(label+'/'+m.id+' hitstop freezes aura with body',JSON.stringify(await snap(p))===JSON.stringify(a));}
   const impacts=await p.evaluate(n=>v35Review.impacts.length-n,cast.impacts),expected=m.id==='skill_flash'||m.id==='skill_thrust'?1:kind.endsWith('-enemy')?5:3;
   check(label+'/'+m.id+' original attack speed and single damage delivery',Math.abs(cast.timeScale-cast.engineRate*2)<1e-7&&impacts===expected,{timeScale:cast.timeScale,impacts,expected});
   if(width===1440){await seek(p,elapsed(m,m.peak));await p.locator('#pvPixiBattle canvas').screenshot({path:dir+m.id+'-peak.png'});}
   await cancel(p);
   const cleanup=await p.evaluate(()=>({idle:v35Review.spine.actor.state,active:!!v35Review.effects.session,auras:v35Review.effects.auras.size,ambient:!!v35Review.spine.ambient}));
   check(label+'/'+m.id+' completion retains one persistent aura',cleanup.idle==='IDLE'&&!cleanup.active&&cleanup.auras===1&&cleanup.ambient,cleanup);
  }
  const lifecycle=await p.evaluate(async()=>{
   const a=v35Review,s=a.spine,e=a.engine;s.actor.hp=0;s.actor.setState('DEAD');const dead=s.aura.audit();
   s.actor.hp=100;s.actor.setState('IDLE');const alive=s.aura.audit();
   await e.setVisible(false);const t=s.aura.time;await new Promise(r=>setTimeout(r,100));const hiddenFrozen=t===s.aura.time;
   await e.setVisible(true);await new Promise(r=>setTimeout(r,100));const resumed=s.aura.time!==t;
   return {dead,alive,hiddenFrozen,resumed,errors:a.errors};
  });
  check(label+' death, revive, hidden, resume',!lifecycle.dead.visible&&!lifecycle.dead.outline&&lifecycle.alive.visible&&lifecycle.alive.outline&&lifecycle.hiddenFrozen&&lifecycle.resumed&&!lifecycle.errors.length,lifecycle);
  const disposed=await p.evaluate(()=>{const a=v35Review,s=a.spine,texture=s.aura.assets.layers.rear[0];s.destroy();return {destroyed:s.aura.destroyed,auras:a.effects.auras.size,texturePreserved:!texture.destroyed,noAmbient:!s.ambient,removed:!s.aura.root.parent&&!s.aura.front.parent};});
  check(label+' disposal removes owned glow and aura, keeps shared texture',disposed.destroyed&&!disposed.auras&&disposed.texturePreserved&&disposed.noAmbient&&disposed.removed,disposed);
  await p.close();
 }
 check('No shader or browser console errors',consoleErrors.length===0,consoleErrors);
}catch(error){check('Execution',false,error.stack);}finally{
 await b.close();const failed=checks.filter(c=>!c.pass);
 await fs.writeFile(dir+'verification.json',JSON.stringify({passed:!failed.length,checks,realDevice:false},null,2));
 console.log({checks:checks.length,failed});if(failed.length)process.exitCode=1;
}
