import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import 'pixi.js/prepare';
import {ZERO_AWAKENING,ZERO_AREA_EVENT} from '../../../shared/mercenary-zero-v1.mjs';

export const AWAKENING={...ZERO_AWAKENING,phase:'USER_APPROVED',damageAuthority:'SERVER_EVENT_ONLY'};
const ROOT='/preview/zero-awakening-20261115/',clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a+(b-a)*t,smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const cache=new WeakMap(),pending=new WeakMap(),cancelLoads=new WeakMap();
function installCleanup(engine){
 if(engine.zeroAwakeningCleanupInstalled)return;const destroy=engine.destroy,setVisible=engine.setVisible;
 engine.destroy=function(...args){disposeAwakening(this);return destroy.apply(this,args);};
 engine.setVisible=async function(...args){const value=await setVisible.apply(this,args);if(!this.visible)[...cache.get(this)?.active.values()||[]].forEach(a=>a.silence());return value;};
 engine.zeroAwakeningCleanupInstalled=true;
}
export async function prepareAwakening(engine){
 if(cache.has(engine))return cache.get(engine);if(pending.has(engine))return pending.get(engine);
 installCleanup(engine);let cancelLoad;const cancelled=new Promise(resolve=>{cancelLoad=resolve;});cancelLoads.set(engine,cancelLoad);
 const epoch=engine.mercenaryEpoch,start=performance.now();
 const promise=(async()=>{
  const [body,fx]=await Promise.all(['runtime/body.json','effects-v2/runtime/fx-manifest.json'].map(p=>fetch(ROOT+p).then(r=>{if(!r.ok)throw Error('Awakening manifest '+r.status);return r.json();})));
  const urls=[ROOT+'runtime/'+body.atlas,...Object.values(fx.effects).map(s=>ROOT+'effects-v2/runtime/'+s.atlas)];
  const settled=await Promise.allSettled(urls.map(url=>Assets.load(url)));const bad=settled.find(r=>r.status==='rejected');if(bad)throw bad.reason;
  const imagesMs=performance.now()-start;
  const audioStart=performance.now();engine.audio?.ensure();await engine.audio?.prepareAdvancements(['AFTERIMAGE','RIPOSTE','SHATTER']);const audioMs=performance.now()-audioStart;
  if(engine.disposed||engine.mercenaryDisposed||engine.mercenaryEpoch!==epoch)return null;
  const sources=settled.map(r=>r.value),sub=(s,f)=>new Texture({source:s.source,frame:new Rectangle(f.x,f.y,f.w,f.h)});
  const uploadStart=performance.now(),aborted=await Promise.race([engine.app.renderer.prepare.upload(sources).then(()=>false),cancelled.then(()=>true)]),uploadMs=performance.now()-uploadStart;
  if(aborted)return null;
  if(engine.disposed||engine.mercenaryDisposed||engine.mercenaryEpoch!==epoch)return null;
  const state={body,fx,bodyFrames:body.frames.map(f=>sub(sources[0],f)),effects:{},loadMs:performance.now()-start,imagesMs,audioMs,uploadMs,urls,active:new Map(),disposed:false};
  Object.entries(fx.effects).forEach(([key,s],i)=>state.effects[key]=s.frames.map(f=>sub(sources[i+1],f)));
  cache.set(engine,state);return state;
 })().finally(()=>{if(pending.get(engine)===promise)pending.delete(engine);if(cancelLoads.get(engine)===cancelLoad)cancelLoads.delete(engine);});pending.set(engine,promise);return promise;
}
export function disposeAwakening(engine){cancelLoads.get(engine)?.();cancelLoads.delete(engine);pending.delete(engine);const s=cache.get(engine);if(!s)return;for(const active of s.active.values())active.cancel();for(const t of [...s.bodyFrames,...Object.values(s.effects).flat()])t.destroy(false);s.disposed=true;cache.delete(engine);}
export function awakeningDiagnostics(engine){const s=cache.get(engine);return{ready:!!s,loading:pending.has(engine),active:!!s?.active.size,loadMs:s?.loadMs,imagesMs:s?.imagesMs,audioMs:s?.audioMs,uploadMs:s?.uploadMs,bodyFrames:s?.bodyFrames.length||0,visibleFx:s?[...s.active.values()].reduce((n,a)=>n+a.sprites.filter(x=>x.visible).length,0):0,last:engine.lastZeroAwakening};}
export function pauseAwakening(engine){const active=[...cache.get(engine)?.active.values()||[]];return active.map(a=>a.pause()).some(Boolean);}
export function resumeAwakening(engine){const active=[...cache.get(engine)?.active.values()||[]];return active.map(a=>a.resume()).some(Boolean);}

export function awakeningStrikes(targets,size,dir){
 const ordered=targets.slice().sort((a,b)=>a.foot.y-b.foot.y||a.foot.x-b.foot.x),groups=[];
 for(const p of ordered){let row=groups.at(-1);if(!row||Math.abs(row[0].foot.y-p.foot.y)>size*.25)groups.push(row=[]);row.push(p);}
 if(!groups.length)return [];
 const strikes=[],count=Math.max(12,targets.length);let cycle=0;
 while(strikes.length<count){
  for(const [r,row]of groups.entries()){
   const facing=((r+cycle)%2?-1:1)*dir;
   for(const p of row.slice().sort((a,b)=>(a.foot.x-b.foot.x)*facing)){
    if(strikes.length===count)break;
    strikes.push({...p,at:.48+strikes.length*1.66/(count-1),facing,pose:[1,2,3,4][(r+cycle)%4]});
   }
  }cycle++;
 }
 return strikes;
}
function schedule(engine,actor,rows,assets){
 const parent=actor.root.parent,scale=Math.abs(actor.root.scale.x),size=360*scale,dir=actor.team==='ENEMY'?-1:1;
 const foot=t=>parent.toLocal(t.root.toGlobal({x:0,y:0}));
 const torso=t=>parent.toLocal(t.root.toGlobal({x:0,y:-(t.art?.bodyHeight||t.fullBodyHeight||300)*.52}));
 const home={x:actor.baseX,y:actor.baseY},targets=rows.map(r=>({id:r.target.id,foot:foot(r.target),point:torso(r.target)}));
 // Visit every authoritative target. Row direction alternates so the sword
 // cuts across the formation instead of repeating only the front three anchors.
 // A lone boss receives the full visual flurry too; the HP receipt below
 // still applies once per unique authoritative target.
 const strikes=awakeningStrikes(targets,size,dir);
 const center={x:targets.reduce((n,p)=>n+p.foot.x,0)/targets.length,y:targets.reduce((n,p)=>n+p.foot.y,0)/targets.length};
 const nodes=[{at:0,...home,pose:-1,facing:dir},{at:.08,...home,pose:0,facing:dir},{at:.32,...home,pose:0,facing:dir}];
 for(const s of strikes){const f=assets.body.frames[s.pose],reach=(f.tip[0]-f.pivot[0])*scale*s.facing;nodes.push({at:s.at,x:s.point.x-reach,y:s.foot.y-(s.pose===3||s.pose===4?size*.22:0),pose:s.pose,facing:s.facing});}
 const apex={x:center.x-size*.48*dir,y:center.y-size*1.12};
 nodes.push({at:2.37,...apex,pose:5,facing:dir},{at:2.62,...apex,pose:5,facing:dir});
 const finish=assets.body.frames[6],final={x:center.x-(finish.tip[0]-finish.pivot[0])*scale*dir,y:center.y};
 nodes.push({at:2.9,...final,pose:6,facing:dir},{at:3.14,...final,pose:6,facing:dir},{at:3.32,...final,pose:7,facing:dir},{at:3.58,...final,pose:7,facing:dir},{at:4.04,...home,pose:7,facing:dir},{at:4.2,...home,pose:-1,facing:dir});
 const sample=t=>{let i=0;while(i<nodes.length-2&&nodes[i+1].at<=t)i++;const a=nodes[i],b=nodes[i+1],q=smooth((t-a.at)/(b.at-a.at));return{x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),pose:t<a.at+.001?a.pose:(b.at-a.at<.28?b.pose:a.pose),facing:b.facing,alpha:t>3.65&&t<4.04?.48:1};};
 return{home,scale,size,dir,strikes,center,targets,nodes,sample,parent};
}

export async function playAwakening(engine,event,{speed=AWAKENING.playbackRate,effects=true,manual=false,resumeIdle=()=>{}}={}){
 const actor=engine.combatantById(event.actorId),epoch=engine.playbackEpoch;
 if(actor?.cardId!=='V-976'||event.type!==ZERO_AREA_EVENT||event.battleMode!=='PVE'||event.skillId!==AWAKENING.id||!engine.visible||actor.root.destroyed)return false;
 const rows=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
 if(!rows.length)return false;
 const assets=await prepareAwakening(engine).catch(()=>null),s=engine.zeroStates?.get(actor);
 const valid=()=>engine.visible&&!engine.disposed&&!engine.mercenaryDisposed&&engine.playbackEpoch===epoch&&!actor.root.destroyed&&rows.every(r=>!r.target.root.destroyed);
 if(!assets||!s||!valid()||assets.active.has(actor))return false;
 engine.settlePendingTails?.([actor,...rows.map(r=>r.target)]);actor.animationController.kill();
 const ambient=s.ambient;if(ambient){s.ambient=null;engine.simpleTimelines.delete(ambient);ambient.instance.kill();}
 s.busy=true;s.stopped=false;s.fx.cancel();
 const motion=schedule(engine,actor,rows,assets),body=actor.fullBodySprite;
 const saved={texture:body.texture,anchor:[body.anchor.x,body.anchor.y],scale:[body.scale.x,body.scale.y],viewScale:[actor.view.scale.x,actor.view.scale.y],hud:actor.hud.visible};
 // Keep the approved separate wings but make the joint follow each new torso.
 // The old aura copies the old body, so hide that attachment during this action.
 const mantle=s.fx.appearance?.root,wings=s.fx.backdrop?.root;
 if(mantle)mantle.visible=false;
 const front=new Container({label:'ZeroAwakeningEffects',eventMode:'none'}),back=new Container({label:'ZeroAwakeningTrails',eventMode:'none'});
 engine.effectLayer.addChild(front);engine.backgroundLayer.addChild(back);
 const sprites=Array.from({length:48},()=>{const p=new Sprite();p.visible=false;p.blendMode='add';front.addChild(p);return p;});
 const ghosts=Array.from({length:4},()=>{const p=new Sprite();p.visible=false;p.tint=0x8ddfff;p.blendMode='add';back.addChild(p);return p;});
 const shade=new Graphics();back.addChildAt(shade,0);let applied=false,closed=false,used=0,entry=null;
 const ownedSounds=new Set(),dialogue=engine.mercenaryAreaPresentation?.actors.get(actor)?.dialogue;
 dialogue?.begin('이 일섬으로, 모든 검로를 끝낸다.',AWAKENING.name);
 function sound(code,offset=0){if(manual||!effects||!valid())return;const previous=new Set(engine.audio.activeSources);engine.audio.startAdvancementBuffer(code,{offset});for(const node of engine.audio.activeSources)if(!previous.has(node)){node.playbackRate.value=engine.reducedMotion?8:speed;ownedSounds.add(node);}}
 function silence(){for(const node of ownedSounds){try{node.stop();node.disconnect();}catch{}engine.audio.activeSources.delete(node);}ownedSounds.clear();}
 const stats={...AWAKENING,speed,effects,clockOwner:'V3_REGISTERED_GSAP',visualTargetIds:motion.strikes.map(s=>s.id),damageApplications:0,cancelled:false};
 const point=(p,layer)=>layer.toLocal(motion.parent.toGlobal(p));
 const pose=(sprite,p,global=false)=>{const f=assets.body.frames[p.pose];sprite.texture=assets.bodyFrames[p.pose];sprite.anchor.set(f.pivot[0]/f.w,f.pivot[1]/f.h);sprite.scale.set((global?motion.scale:1)*p.facing,global?motion.scale:1);};
 function effect(id,age,p,width,rotation=0,alpha=1,stretch=1){
  if(age<0||!effects||used>=sprites.length)return;const spec=assets.fx.effects[id],frame=Math.floor(age*spec.fps);if(frame>=spec.frames.length)return;
  const v=sprites[used++],q=point(p,front);v.texture=assets.effects[id][frame];v.anchor.set(spec.pivot[0]/v.texture.width,spec.pivot[1]/v.texture.height);
  // Width describes the original 512px render canvas, not the cropped bounds.
  v.scale.set(width/512/spec.rasterScale[0],width/512/spec.rasterScale[1]*stretch);v.position.set(q.x,q.y);v.rotation=rotation;v.alpha=alpha;v.visible=true;
 }
 function render(time){
  if(closed||!valid())return;used=0;sprites.forEach(p=>p.visible=false);ghosts.forEach(p=>p.visible=false);shade.clear();
  const p=motion.sample(time);actor.root.position.set(p.x,p.y);actor.root.depthSortY=Math.max(...motion.targets.map(v=>v.foot.y))+motion.size;actor.view.scale.set(1,1);actor.hud.visible=false;
  if(p.pose>=0){pose(body,p);body.position.set(0,0);body.alpha=p.alpha;if(wings){wings.visible=effects;wings.position.set(-24*p.facing,p.pose===5?-170:p.pose===6?-190:-210);wings.scale.set(p.facing,1);wings.rotation=p.pose===4?-.2*p.facing:0;wings.alpha=.48;}}
  else{body.texture=saved.texture;body.anchor.set(...saved.anchor);body.scale.set(...saved.scale);actor.view.scale.set(...saved.viewScale);}
  if(effects&&time>.32&&time<2.25)for(let i=0;i<4;i++){const old=motion.sample(Math.max(0,time-.025*(i+1)));if(old.pose<0||Math.hypot(old.x-p.x,old.y-p.y)<2)continue;const g=ghosts[i];pose(g,old,true);const q=point(old,back);g.position.set(q.x,q.y);g.alpha=.24-i*.045;g.visible=true;}
  if(effects){const dim=Math.min(smooth(time/.25),1-smooth((time-3.4)/.8))*.22;shade.rect(-2000,-2000,6000,6000).fill({color:0x020915,alpha:dim});}
  effect('awakening-crown',(time-.02)*1.3,{x:motion.home.x,y:motion.home.y-motion.size*.55},motion.size*2.8,0,1);
  for(const [i,strike]of motion.strikes.entries()){
   const age=time-strike.at;
   effect('awakening-storm',age*2.8,strike.point,motion.size*.95,0,.8);
   if(i%3===1)effect('awakening-storm',age*1.35,strike.point,motion.size*3.1,strike.pose===1?0:strike.pose===2?-.28:strike.pose===3?-.6:.3,1);
  }
  if(time>2.22&&time<2.9)effect('awakening-crown',(time-2.22)*1.3,{x:p.x,y:p.y-motion.size*.45},motion.size*2.7,0,.8);
  for(const [i,target]of motion.targets.entries())effect('awakening-storm',(time-AWAKENING.impact-i%3*.025)*1.8,target.point,motion.size*1.65,i%2?.4:-.4,.8);
  const fieldWidth=Math.max(...motion.targets.map(t=>t.foot.x))-Math.min(...motion.targets.map(t=>t.foot.x));
  const verdictWidth=Math.max(motion.size*4.5,fieldWidth*1.5);
  effect('awakening-verdict',time-2.68,{x:motion.center.x,y:motion.center.y-verdictWidth*.18},verdictWidth,0,1.1);
  engine.sortCombatDepth();stats.time=time;stats.visibleFx=used;if(manual)engine.app.render();
 }
 function clean(cancelled=false){if(closed)return;closed=true;stats.cancelled=cancelled;front.destroy({children:true});back.destroy({children:true});assets.active.delete(actor);s.busy=false;if(!manual&&effects)engine.camera.reset(true);dialogue?.end();silence();
  if(!actor.root.destroyed){body.alpha=1;body.texture=saved.texture;body.anchor.set(...saved.anchor);body.scale.set(...saved.scale);actor.view.scale.set(...saved.viewScale);if(wings){wings.rotation=0;wings.scale.set(1,1);wings.alpha=1;}s.fx.cancel();actor.hud.visible=saved.hud;if(valid()&&!s.stopped){actor.animationController.setState('IDLE');resumeIdle(engine);}}
  engine.lastZeroAwakening={...stats,homeError:actor.root.destroyed?0:Math.hypot(actor.root.x-actor.baseX,actor.root.y-actor.baseY),remainingEffects:0};}
 const control={render,sprites,silence,pause(){if(!entry)return false;entry.instance.pause();silence();stats.paused=true;return true;},resume(){if(!entry)return false;stats.paused=false;entry.instance.resume();return true;},cancel(){entry?.instance.kill();clean(true);},stats};assets.active.set(actor,control);
 render(0);if(manual)return control;
 const clock={time:0};const ok=await engine.timeline(t=>{entry=[...engine.simpleTimelines].find(e=>e.instance===t);t.to(clock,{time:AWAKENING.impact,duration:AWAKENING.impact,ease:'none',onUpdate:()=>render(clock.time)}).to(clock,{time:AWAKENING.impact,duration:AWAKENING.hitstop,ease:'none',onUpdate:()=>render(clock.time)}).to(clock,{time:AWAKENING.duration,duration:AWAKENING.duration-AWAKENING.impact,ease:'none',onUpdate:()=>render(clock.time)});t.call(()=>{
  if(applied||!valid()||s.stopped)return;applied=true;for(const {target,hit}of rows){
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
   if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:true});
  }stats.damageApplications=rows.length;
 },[],AWAKENING.impact);t.call(()=>sound('AFTERIMAGE'),[],.08);for(const at of [.48,1.06,1.55,2.04])t.call(()=>sound('RIPOSTE',.3),[],at);t.call(()=>sound('SHATTER',.25),[],AWAKENING.impact);if(effects&&!engine.reducedMotion)engine.camera.addShake(t,{intensity:engine.mobile?4:8,duration:.34,rotation:.002,at:AWAKENING.impact});},()=>clean(clock.time<AWAKENING.duration-.01),engine.reducedMotion?8:speed,{owners:[actor,...rows.map(r=>r.target)]});
 return ok&&valid();
}
