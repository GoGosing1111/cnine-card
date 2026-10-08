import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {LIMITED_VISUALS,limitedVisual,limitedBattleArt,limitedEmission} from '../../../../shared/mercenary-limited-visuals-v1.mjs';
import {KnightFX,loadKnightAssets} from '../../../mercenary-crimson-silver-knight-battle-v1/source/KnightFX.js';
import {makePlan as valterPlan,OVERHEAD} from '../../../mercenary-crimson-silver-knight-battle-v1/skill.mjs';
import {VALTER_CODE,VALTER_AREA_EVENT} from '../../../../shared/mercenary-valter-v1.mjs';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const VALTER_ATTACK_PLAYBACK_RATE=2.5;
const frames=(texture,rows)=>rows.map(f=>new Texture({source:texture.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
let valterManifestPromise;
const valterManifest=()=>valterManifestPromise||=fetch(LIMITED_VISUALS.reference.manifest).then(r=>{if(!r.ok)throw Error('VALTER_APPROVED_MANIFEST');return r.json();}).catch(e=>{valterManifestPromise=null;throw e;});

// This adapter only displays authoritative events. It never rolls skills or calculates damage.
export async function setupLimitedActor(engine,actor){
 const spec=limitedVisual(actor.cardId);if(!spec)return null;
 engine.limitedStates||=new Map();engine.limitedLoads||=new Map();
 if(engine.limitedStates.has(actor))return engine.limitedStates.get(actor);
 if(engine.limitedLoads.has(actor))return engine.limitedLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const [auraTexture,effectTexture,manifest]=await Promise.all([Assets.load(LIMITED_VISUALS.aura.url),spec.effects?Assets.load(spec.effects.url):null,spec.id==='valter'?valterManifest():null]);
  const knightAssets=manifest?await loadKnightAssets(manifest):null;
  if(actor.root.destroyed||engine.mercenaryDisposed||epoch!==engine.mercenaryEpoch){
   if(knightAssets)for(const group of [knightAssets.motion,knightAssets.effects])for(const row of Object.values(group))for(const texture of row)texture.destroy(false);
   return null;
  }
  const art=limitedBattleArt(actor.cardId),scale=art.bodyHeight/spec.bodyHeight;
  const back=new Container({label:'ApprovedLimitedRearAura',zIndex:5}),auraFrames=frames(auraTexture,LIMITED_VISUALS.aura.frames),aura=new Sprite(auraFrames[0]);
  aura.anchor.set(.5);aura.tint=parseInt(spec.auraTint.slice(1),16);aura.blendMode='add';
  aura.position.set((spec.auraCenter.x-spec.feet.x)*scale,(spec.auraCenter.y-spec.feet.y)*scale);
  aura.scale.set(art.bodyHeight*spec.auraScale*1.65/auraFrames[0].width);back.addChild(aura);actor.view.addChild(back);actor.view.sortChildren();
  const layer=new Container({label:'ApprovedLimitedSkillFX'});layer.eventMode='none';engine.effectLayer.addChild(layer);
  const effectFrames=effectTexture?frames(effectTexture,spec.effects.frames):[],sprites=Array.from({length:3},()=>{const s=new Sprite();s.visible=false;s.blendMode='add';layer.addChild(s);return s;});
  const state={engine,actor,spec,art,back,aura,auraFrames,effectFrames,layer,sprites,time:0,busy:false,stopped:false,ambient:null,knight:null};
  if(manifest){
   const target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.root.destroyed)||actor;
   state.knight=new KnightFX(engine,actor,[target],knightAssets,manifest,valterPlan({mode:'aura'}));
   state.knight.removeTimeline();state.knight.audio.enabled=false;
  }
  engine.limitedStates.set(actor,state);
  actor.setAnimationAdapter({setState(next){if(next==='DEAD'){state.back.visible=false;state.layer.visible=false;if(state.knight){state.knight.aura.visible=false;state.knight.layer.visible=false;}}},destroy(){destroyState(state);}});
  startAmbient(state);return state;
 })().finally(()=>engine.limitedLoads.delete(actor));
 engine.limitedLoads.set(actor,pending);return pending;
}
function stopAmbient(s){
 if(!s.ambient)return;const entry=s.ambient;s.ambient=null;s.engine.simpleTimelines.delete(entry);entry.instance.kill();
}
function rear(s,t){s.aura.texture=s.auraFrames[Math.floor((t%LIMITED_VISUALS.aura.loopSeconds)/LIMITED_VISUALS.aura.loopSeconds*s.auraFrames.length)];}
function startAmbient(s){
 if(s.destroyed||s.stopped||s.actor.root.destroyed||s.actor.hp<=0)return;
 stopAmbient(s);s.busy=false;s.back.visible=true;s.layer.visible=true;
 if(s.knight){s.knight.plan=valterPlan({mode:'aura'});s.knight.captureFormation();s.knight.aura.visible=true;s.knight.layer.visible=true;}
 const clock={time:.08};
 const instance=gsap.timeline({repeat:-1,onUpdate(){
  if(s.destroyed||s.stopped||s.busy||s.actor.hp<=0||s.actor.root.destroyed)return;
  s.time=clock.time;rear(s,s.time);
  if(s.knight){
   const k=s.knight;k.start={x:s.actor.baseX,y:s.actor.baseY};
   // Ambient FX must not reset another actor's concurrent hit/recoil presentation.
   k.targetDefaults=k.targets.map(a=>({viewX:a.view.x,tint:a.fullBodySprite.tint}));k.render(s.time);
  }
 }}).to(clock,{time:5.95,duration:5.87,ease:'none'});
 const entry={instance,settle:()=>{stopAmbient(s);}};s.ambient=entry;s.engine.simpleTimelines.add(entry);
 if(!s.engine.visible){entry.resumeOnVisible=true;instance.pause();}
}
function destroyState(s){
 if(s.destroyed)return;s.stopped=true;stopAmbient(s);s.knight?.destroy();s.back.destroy({children:true});s.layer.destroy({children:true});
 for(const texture of [...s.auraFrames,...s.effectFrames])texture.destroy(false);s.destroyed=true;
}
export function clearLimitedActors(engine){for(const s of engine.limitedStates?.values()||[])destroyState(s);engine.limitedStates?.clear();}
export function resumeLimitedPlayback(engine){for(const s of engine.limitedStates?.values()||[]){if(s.destroyed||s.busy||s.actor.hp<=0)continue;s.stopped=false;startAmbient(s);}}
export function cancelLimitedPlayback(engine){for(const s of engine.limitedStates?.values()||[]){s.stopped=true;stopAmbient(s);s.sprites.forEach(a=>a.visible=false);s.knight?.cancel();}}
function place(s,slot,index,p,width,angle=0){
 const sprite=s.sprites[slot],f=s.spec.effects.frames[index],texture=s.effectFrames[index];sprite.texture=texture;
 sprite.anchor.set(f.origin.x/texture.width,f.origin.y/texture.height);sprite.position.set(p.x,p.y);sprite.scale.set(width/texture.width);sprite.rotation=angle;sprite.visible=true;
}
function renderImages(s,t,target){
 s.sprites.forEach(a=>a.visible=false);rear(s,t);
 const p=limitedEmission(s.actor,s.engine.effectLayer);if(!p)return;
 const targetFoot=s.engine.effectLayer.toLocal(target.root.toGlobal({x:0,y:0}));
 const distance=Math.max(p.height,(targetFoot.x-p.origin.x)/p.direction.x);
 const hit={x:p.origin.x+p.direction.x*distance,y:p.origin.y+p.direction.y*distance};
 if(t>=.38&&t<1.08)place(s,0,Math.min(3,Math.floor((t-.38)/.7*4)),p.origin,p.height*(s.spec.type==='cannon'?.33:.23));
 if(t>=1.08&&t<1.7){const q=clamp((t-1.08)/.62);place(s,1,4+Math.min(3,Math.floor(q*4)),{x:p.origin.x+(hit.x-p.origin.x)*q,y:p.origin.y+(hit.y-p.origin.y)*q},p.height*(s.spec.type==='cannon'?1.6:1.25),p.angle);}
 if(t>=1.68&&t<2.65)place(s,2,8+Math.min(3,Math.floor((t-1.68)/.97*4)),hit,p.height*(s.spec.type==='cannon'?.84:.65));
 s.emission=p;s.effectTime=t;
}
async function playback(engine,actor,targets,{basic=false,area=false,apply}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&engine.visible&&!actor.root.destroyed&&targets.every(t=>!t.root.destroyed);
 if(!valid()||!targets.length)return false;
 const s=await setupLimitedActor(engine,actor);if(!s||!valid())return false;
 engine.settlePendingTails?.([actor,...targets]);stopAmbient(s);s.stopped=false;s.busy=true;actor.animationController.kill();
 let duration=3.6,contact=1.68;
 if(s.knight){
  const k=s.knight;k.targets=targets;k.targetDefaults=targets.map(a=>({viewX:a.view.x,tint:a.fullBodySprite.tint}));k.plan={...valterPlan({mode:basic?'attack':area?'ultimate':'skill'}),damageAuthority:'SERVER_ONLY'};
  k.captureFormation();duration=k.plan.duration;contact=OVERHEAD.contact;
 }
 // Compress the approved attack/skill clock, contact and release together.
 // The global playback speed still applies; idle aura and server turns do not change.
 const rate=s.knight?VALTER_ATTACK_PLAYBACK_RATE:1,clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:duration,duration:duration/rate,ease:'none',onUpdate(){if(!valid()||s.destroyed)return;rear(s,clock.time);if(s.knight)s.knight.render(clock.time);else renderImages(s,clock.time,targets[0]);}});
  t.call(()=>{if(valid()&&!applied){applied=true;apply();}},[],contact/rate);
 },()=>{
  if(s.destroyed)return;s.busy=false;s.sprites.forEach(a=>a.visible=false);
  if(s.knight)s.knight.cancel();if(valid()&&!s.stopped)startAmbient(s);
 },null,{releaseAt:(contact+.12)/rate,owners:[actor,...targets]});
 engine.lastMercenaryPlayback={code:actor.cardId,eventType:basic?'ATTACK':area?VALTER_AREA_EVENT:'MERCENARY_HIT',visualVersion:LIMITED_VISUALS.version,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:applied?targets.length:0,playbackRate:rate,contactSeconds:contact/rate,durationSeconds:duration/rate};
 return result&&valid();
}
export function playLimitedBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],{basic:true,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }});
}
export function playLimitedSkill(engine,event){
 if(event.type===VALTER_AREA_EVENT){
  const actor=engine.combatantById(event.actorId);if(actor?.cardId!==VALTER_CODE||event.battleMode!=='PVE')return true;
  const rows=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)})).filter(r=>r.target&&!r.target.root.destroyed);
  if(!rows.length)return true;
  return playback(engine,actor,rows.map(r=>r.target),{area:true,apply(){
   for(const {hit,target} of rows){
    if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
    if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
    if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
    else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:rows.length>1});
   }
  }});
 }
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);if(!actor||!target)return true;
 const sync=()=>{if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter));if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);};
 if(event.dodge){sync();engine.queueBanner('빗나감',actor.accent,target.name);return true;}
 return playback(engine,actor,[target],{apply(){sync();engine.showAccountBattleUnitDamage(target,{damage:event.damage||0});}});
}
export function limitedDiagnostics(engine){return [...engine.limitedStates?.values()||[]].map(s=>({code:s.actor.cardId,version:LIMITED_VISUALS.version,bodyHeight:s.art.bodyHeight,textureHeight:s.art.originalTextureHeight,foot:{x:s.actor.root.x,y:s.actor.root.y},station:{x:s.actor.baseX,y:s.actor.baseY},scale:s.actor.root.scale.x,auraColor:s.spec.auraTint,rearAura:!!s.back.visible,originalValterFx:s.knight?{silhouetteCopies:18,filters:s.knight.auraFilters.length,risingParticles:s.knight.pool.filter(p=>p.visible).length}:null,emission:s.emission,ownedAmbientClock:!!s.ambient,busy:s.busy}));}
