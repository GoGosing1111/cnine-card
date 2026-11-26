import {Sprite,Texture} from 'pixi.js';
import {BATTLE_DEVICE} from './BattleDevicePolicy.mjs';
import {SAINT_CODE,SAINT_ART,SAINT_SKILLS,SAINT_EVENT,SAINT_FIELD_RATE,SAINT_IMPACT_EVENT} from '../../../../shared/mercenary-lightning-saint-v1.mjs';
import {actorPlacement,drawSkill,drawBattlePose,drawBasicCut,saintFieldFxScale} from './lightning-saint/mercenary.mjs';
import {stamp,smooth} from './lightning-saint/effects/paint.mjs';
import {makeAuraCanvas,idleFoot,drawIdleAura,saintActionCharge} from './lightning-saint/aura.mjs';
import {ryujinSkillPlacement} from './ryujin/SkillPlacement.mjs';

const root='/assets/ui/project-v/mercenaries/lightning-saint-20261125/';
export const saintBattleArt=code=>code===SAINT_CODE?{...SAINT_ART,calmIdle:true,spriteUrl:'/'+SAINT_ART.battleSprite,
 footAnchor:{x:97/193,y:1},bodyHeight:300,fullBodyHeight:300*442/294,originalTextureHeight:442}:null;

async function loadBank(compact,signal){
 const res=await fetch(root+(compact?'battle-sd.bin':'battle-hd.bin'),{signal});
 if(!res.ok)throw Error(`${SAINT_ART.name} 전투 리소스 ${res.status}`);
 const blob=await res.blob(),head=new DataView(await blob.slice(0,4).arrayBuffer()).getUint32(0,true);
 const def=JSON.parse(await blob.slice(4,4+head).text()),images=new Map();
 await Promise.all(Object.entries(def.files).map(async([key,[start,size]])=>{
  const url=URL.createObjectURL(blob.slice(4+head+start,4+head+start+size,'image/webp'));
  try{const img=new Image();img.src=url;await img.decode();images.set(key,img);}finally{URL.revokeObjectURL(url);}
 }));
 const art=Object.fromEntries(Object.entries(def.paint).map(([key,row])=>{
  const img=compact&&key!=='phantom'?row.image.replace('.webp','-sd.webp'):row.image;
  return [key,{...row,im:images.get('effects/textures/'+img),light:images.get('effects/textures/'+row.light)}];
 }));
 return {art,actor:{...def.actor,compact,auraArt:art,pages:def.actor.pages.map(p=>images.get('actor/'+(compact?p.compact:p.image)))}};
}
async function loadMaterial(signal,compact){
 const res=await fetch(root+'storm-material-v1.webp',{signal});
 if(!res.ok)throw Error(`${SAINT_ART.name} 발광 재질 ${res.status}`);
 const blob=await res.blob();
 if(compact&&typeof createImageBitmap==='function'){
  try{return await createImageBitmap(blob,{resizeWidth:768,resizeHeight:1536,resizeQuality:'high'});}catch{/* Use the native WebP decoder on older WebViews. */}
 }
 const url=URL.createObjectURL(blob);
 try{const im=new Image();im.src=url;await im.decode();return im;}finally{URL.revokeObjectURL(url);}
}
const sessions=new WeakMap();
export function warmSaint(engine){
 if(sessions.has(engine))return sessions.get(engine);
 const abort=new AbortController(),entry={abort,assets:null,material:null,generation:0,clock:0,lastPaint:-10,layers:new Map()};sessions.set(engine,entry);
 const compact=BATTLE_DEVICE.lowMemory||!!engine.mobile;
 void loadMaterial(abort.signal,compact).then(im=>{
  if(sessions.get(engine)!==entry){im.close?.();return;}
  entry.material=im;if(entry.assets)entry.assets.actor.material=im;entry.lastPaint=-10;
 }).catch(()=>{});
 entry.ready=loadBank(compact,abort.signal).then(assets=>{if(sessions.get(engine)===entry){entry.assets=assets;assets.actor.material=entry.material;}return assets;}).catch(()=>{
  if(sessions.get(engine)===entry){sessions.delete(engine);entry.material?.close?.();}return null;
 });
 return entry;
}
function syncLayer(actor,layer){
 const body=actor.fullBodySprite;
 layer.visible=actor.hp>0&&actor.battleActive!==false&&body.visible&&body.renderable;
 if(layer.visible){layer.position.copyFrom(body.position);layer.scale.copyFrom(body.scale);layer.rotation=body.rotation;layer.alpha=body.alpha;}
 return layer.visible;
}
export function warmSaintActor(engine,actor){
 const entry=warmSaint(engine);
 void entry.ready.then(assets=>{
  if(!assets||sessions.get(engine)!==entry||actor.root.destroyed||engine.mercenaryDisposed||entry.layers.has(actor))return;
  if(!entry.texture){
   const canvas=makeAuraCanvas();entry.texture=Texture.from(canvas,true);
   entry.tick=ticker=>{
    if(!engine.visible||document.hidden)return;
    let visible=false;
    for(const [unit,layer] of entry.layers){
     if(unit.root.destroyed||layer.destroyed){if(!layer.destroyed)layer.destroy();entry.layers.delete(unit);continue;}
     if(syncLayer(unit,layer)&&unit.root.visible)visible=true;
    }
    entry.clock+=Math.min(80,ticker?.deltaMS??0)/1000;
    const time=engine.reducedMotion?1.05:entry.clock;
    if(!visible||Math.abs(time-entry.lastPaint)<1/(BATTLE_DEVICE.lowMemory?16:24))return;
    drawIdleAura(canvas,assets,time);entry.texture.source.update();entry.lastPaint=time;
   };
   engine.app.ticker.add(entry.tick);
  }
  const layer=new Sprite(entry.texture);layer.label='LightningSaintAura';layer.anchor.set(idleFoot.x,idleFoot.y);
  layer.zIndex=actor.fullBodySprite.zIndex+.1;actor.view.addChild(layer);actor.view.sortChildren();
  entry.layers.set(actor,layer);syncLayer(actor,layer);entry.tick();
 });
}
export function cancelSaint(engine){const s=sessions.get(engine);if(s)s.generation++;}
export function clearSaint(engine){
 const s=sessions.get(engine);if(!s)return;
 s.generation++;s.abort.abort();sessions.delete(engine);
 if(s.tick)engine.app?.ticker?.remove(s.tick);
 for(const layer of s.layers.values())if(!layer.destroyed)layer.destroy();
 s.layers.clear();s.texture?.destroy(true);s.material?.close?.();
}
const point=a=>({x:a.root.x,y:a.root.y});
const height=a=>Math.abs(a.root.scale.y)*a.fullBodyHeight;
const bodyPoint=(layer,a,fraction)=>layer.toLocal(a.view.toGlobal({x:0,y:-(a.art?.bodyHeight||a.fullBodyHeight)*fraction}));
const blend=(a,b,t)=>a+(b-a)*t;
const basicTrack=[['v2',0],['guard',7],['guard',4],['combo',1],['combo',2],['combo',3],['combo',4],['combo',5],['combo',6],['combo',7],['combo',8],['combo',9],['combo',10],['high',8],['high',10],['high',12],['high',14],['v2',0]];
const basicSeconds=.58,basicPeak=.232;
function skillHit(engine,target,receipt,area){
 // The Citadel can already have a newer checkpoint, including a KO or a heal from another squad.
 if(!(engine.battleData?.citadelDamageHud&&engine.cooperativeFrame?.has(target.id))){
  if(Number.isFinite(receipt.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,receipt.targetHpAfter,receipt.targetMaxHp));
  if(Number.isFinite(receipt.targetShieldAfter))engine.syncTargetShield(target,receipt.targetShieldAfter,receipt.targetMaxShield);
 }
 if(receipt.dodge)engine.queueBanner('빗나감',SAINT_ART.accent,target.name);
 else engine.showAccountBattleUnitDamage(target,{damage:receipt.damage+receipt.absorbed,compactArea:area,impactPoint:bodyPoint(engine.uiLayer,target,.68)});
}
async function play(engine,actor,targets,skill,beats){
 if(!targets.length||!engine.isAlive(actor))return true;
 const session=warmSaint(engine),generation=session.generation,epoch=engine.playbackEpoch,entry=engine.mercenaryEpoch;
 const valid=()=>engine.visible&&!engine.mercenaryDisposed&&epoch===engine.playbackEpoch&&entry===engine.mercenaryEpoch&&session.generation===generation&&!actor.root.destroyed;
 if(!session.assets){
  let timer;
  try{await Promise.race([session.ready,new Promise(done=>{timer=setTimeout(done,4000);})]);}
  finally{clearTimeout(timer);}
 }
 if(!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);actor.animationController.kill();actor.restoreNeutralAvatarPose?.();
 const start=point(actor),span=skill?skill.durationMs/1000:basicSeconds,unit=height(actor)/(442*.846);
 const place=ryujinSkillPlacement({start,targets,duration:span,reach:230*unit,axis:engine.mobile&&engine.formationCoop?'y':'x',cooperative:engine.formationCoop});
 const facing=place.impact.x===start.x?(actor.team==='ALLY'?1:-1):Math.sign(place.impact.x-start.x);
 const approach=place.approachSeconds,back=place.returnSeconds,total=approach+span+back;
 const floor=[place.impact.x,place.impact.y],target=[floor[0],floor[1]];
 function aim(){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const t of targets)if(!t.root.destroyed){
   const p=bodyPoint(engine.effectLayer,t,.44);
   x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);
  }
  if(x0!==Infinity){target[0]=(x0+x1)/2;target[1]=(y0+y1)/2;}
 }
 aim();
 const cast=place.cast,source=[(cast.x-.51*target[0])/.49,cast.y];
 const contactSeconds=beats.map(beat=>beat.at);
 const effectScale=saintFieldFxScale(skill?.key||'basic',unit);
 const opts={source,target,floor,facing,scale:unit,effectScale,contactSeconds},canvas=document.createElement('canvas'),density=Math.min(1,(engine.mobile?720:1152)/engine.scene.width);
 canvas.width=Math.ceil(engine.scene.width*density);canvas.height=Math.ceil(engine.scene.height*density);
 const ctx=canvas.getContext('2d'),texture=Texture.from(canvas,true),overlay=new Sprite(texture);
 overlay.scale.set(1/density);engine.effectLayer.addChild(overlay);
 const prior=actor.fullBodySprite.renderable,clock={t:0},applied=new Set(),flashes=new Map(),due=[];
 const rate=engine.actionPlaybackSpeed()*SAINT_FIELD_RATE;
 let paintedFrames=0;
 function draw(){
  if(!valid())return;
  const strikes=due.splice(0),t=strikes.length?strikes.at(-1).at:clock.t-approach,world=place.rootAt(t);
  for(const beat of strikes)for(const row of beat.rows){
   if(!row.receipt?.dodge&&!row.target.root.destroyed&&(!row.receipt?.targetId||row.receipt.targetId===row.target.id))flashes.set(row.target,t);
  }
  aim();
  let x=world.x,y=world.y;
  ctx.resetTransform();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.scale(density,density);
  if(session.assets){
   const assets=session.assets;actor.fullBodySprite.renderable=false;paintedFrames++;
   const aura=session.layers.get(actor);if(aura)aura.visible=false;
   opts.auraTime=session.clock;
   if(t<0||t>=span)drawBattlePose(ctx,assets.actor,'v2',0,x,y,unit,facing,assets.art,session.clock);
   else if(skill){
    drawSkill(ctx,assets,skill.key,t,opts);
    const p=actorPlacement(assets.actor,skill.key,t,opts);x=p.x;y=p.y;
   }else{
    const [bank,cel]=basicTrack[Math.min(basicTrack.length-1,Math.floor(t/span*basicTrack.length))];
    const advance=t<=basicPeak?smooth(t/basicPeak):1-smooth((t-basicPeak)/(span-basicPeak));
    const charge=saintActionCharge(t,contactSeconds,span,session.clock);
    x=blend(cast.x,target[0]-facing*250*unit,advance);
    drawBattlePose(ctx,assets.actor,bank,cel,x,y,unit,facing,assets.art,session.clock,charge);
    drawBasicCut(ctx,assets,bank,cel,x,y,unit,facing,target,t,basicPeak);
   }
   for(const [unitTarget,at] of flashes){
    const u=(t-at)/.17;if(u>=1||unitTarget.root.destroyed){flashes.delete(unitTarget);continue;}
    const art=assets.art.burst,peak=art.time[art.peak]/art.duration,p=bodyPoint(engine.effectLayer,unitTarget,.44);
    if(u>=0)stamp(ctx,assets.art,'burst',peak+(1-peak)*u,p.x,p.y,188*unit,153*unit,{bloom:.70});
   }
  }
  actor.root.position.set(x,y);texture.source.update();
  for(const beat of strikes){
   const hits=[];
   for(const row of beat.rows){
    if(row.target.root.destroyed||row.receipt?.targetId&&row.receipt.targetId!==row.target.id)continue;
    row.apply();if(row.receipt)hits.push(row.receipt);
   }
   if(hits.length&&engine.battleData?.citadelDamageHud)
    engine.app.canvas.dispatchEvent(new CustomEvent(SAINT_IMPACT_EVENT,{bubbles:true,detail:{hits}}));
  }
 }
 try{
  draw();
  return await engine.timeline(timeline=>{
   timeline.to(clock,{t:total,duration:total,ease:'none'});
   beats.forEach((beat,i)=>timeline.call(()=>{
    if(!valid()||applied.has(i))return;applied.add(i);
    due.push(beat);
   },[],approach+beat.at));
   timeline.eventCallback('onUpdate',draw);
  },()=>{
   overlay.removeFromParent();overlay.destroy();texture.destroy(true);
   if(!actor.root.destroyed){actor.fullBodySprite.renderable=prior;actor.root.position.set(start.x,start.y);
    const layer=session.layers.get(actor);if(layer&&!layer.destroyed)syncLayer(actor,layer);
    if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');}
   engine.lastMercenaryPlayback={code:SAINT_CODE,mode:skill?.key||'basic',clockOwner:'V3_REGISTERED_GSAP',authoritative:true,
    contactSeconds,playbackRate:rate,appliedContacts:applied.size,paintedFrames,durationSeconds:total,elapsedSeconds:total/rate};
  },rate,{owners:[actor,...targets]});
 }finally{flashes.clear();}
}
export function playSaintSkill(engine,event){
 const actor=engine.combatantById(event.actorId),skill=SAINT_SKILLS.find(s=>s.id===event.skillId);
 if(actor?.cardId!==SAINT_CODE||event.type!==SAINT_EVENT||!skill)return true;
 const targets=new Map(),beats=[];
 for(const beat of event.beats||[]){
  const rows=[];
  for(const h of beat.hits){const t=engine.combatantById(h.targetId);if(!t||t.root.destroyed||t.team===actor.team)continue;
   targets.set(h.targetId,t);rows.push({target:t,receipt:h,apply:()=>skillHit(engine,t,h,skill.targetRule==='all')});}
  if(rows.length)beats.push({at:beat.atMs/1000,rows});
 }
 return play(engine,actor,[...targets.values()],skill,beats);
}
export function playSaintBasic(engine,{attacker,target,damage=0,targetHp=null,targetShield=null,receipt,onImpact=()=>{}}){
 if(!engine.isAlive(attacker)||!engine.isAlive(target))return false;
 return play(engine,attacker,[target],null,[{at:basicPeak,rows:[{target,receipt,apply(){
  if(!(engine.battleData?.citadelDamageHud&&engine.cooperativeFrame?.has(target.id))){
   if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
   if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  }
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage,impactPoint:bodyPoint(engine.uiLayer,target,.68)});
 }}]}]);
}
