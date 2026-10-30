import manifest from '../../../../assets/ui/project-v/mercenaries/bloodmoon-live-20261025/manifest.json' with {type:'json'};
import {BloodmoonFX,loadCharacterAssets} from '../../../mercenary-bloodmoon-battle-20261023-v1/source/BloodmoonFX.js';
import {makePlan} from '../../../mercenary-bloodmoon-battle-20261023-v1/source/PlaybackPlan.mjs';
const characters=new Map(manifest.characters.map(c=>{
 if(c.code!=='V-960')return [c.code,c];
 // Match Black Crown's 285-unit body, including the repaired idle boots.
 // Keep one scale for every pose so attacks and cancellation cannot grow her back.
 const bodyHeight=285,scale=bodyHeight/c.displayBodyHeight;
 return [c.code,{...c,battleBodyHeight:c.battleBodyHeight*scale,displayBodyHeight:bodyHeight,
  art:{...c.art,bodyHeight,fullBodyHeight:c.art.fullBodyHeight*scale}}];
}));
const ROOT='/assets/ui/project-v/mercenaries/bloodmoon-live-20261025/';
const disposeAssets=assets=>{for(const frames of Object.values(assets))for(const t of frames)t.destroy(false);};
export const bloodmoonBattleArt=code=>characters.get(code)?.art||null;
class BloodmoonLiveFX extends BloodmoonFX{
 captureFormation(){this.actor.applyFacing();super.captureFormation();}
 applyPose(p){super.applyPose(p);this.actor.applyFacing();}
 hideEffects(){this.pool?.forEach(s=>s.visible=false);this.light?.clear();}
 render(time,cancelled=false){
  if(this.destroyed||this.actor.root.destroyed)return;
  if(this.actor.hp<=0){this.hideEffects();return;}
  if(cancelled||!this.targets.length){this.hideEffects();this.applyPose(null);this.actor.root.position.set(this.start.x,this.start.y);return;}
  this.targetDefaults=this.targets.map(t=>({x:t.view.x,tint:t.fullBodySprite.tint}));
  super.render(time,cancelled);
  this.targets.forEach((t,i)=>{if(!t.root.destroyed){t.view.x=this.targetDefaults[i].x;t.fullBodySprite.tint=this.targetDefaults[i].tint;}});
 }
 begin(action,targets){this.cancel();this.targets=targets;this.plan=makePlan(this.character.skillKind,action);this.clock.time=0;this.captureFormation();this.render(0);}
 cancel(){
  if(this.destroyed)return;this.removeTimeline();this.hideEffects();
  if(this.actor.root.destroyed||this.actor.hp<=0)return;
  this.targets=[];this.targetDefaults=[];this.plan=makePlan(this.character.skillKind,'idle');this.clock.time=0;
  this.actor.restoreNeutralAvatarPose?.();this.captureFormation();this.render(0,true);
 }
 diagnostics(){return {...super.diagnostics(),code:this.character.code,liveEnabled:true,damageAuthority:'SERVER_ONLY',clockOwner:'V3_REGISTERED_GSAP',playbackRate:2};}
}
export async function setupBloodmoonActor(engine,actor){
 engine.bloodmoonStates||=new Map();engine.bloodmoonLoads||=new Map();
 if(engine.bloodmoonStates.has(actor))return engine.bloodmoonStates.get(actor);
 if(engine.bloodmoonLoads.has(actor))return engine.bloodmoonLoads.get(actor);
 const epoch=engine.mercenaryEpoch,pending=(async()=>{
  const character=characters.get(actor.cardId);if(!character)return null;
  const assets=await loadCharacterAssets(character,ROOT);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&actor.hp>0&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid()){disposeAssets(assets);return null;}
  const fx=new BloodmoonLiveFX(engine,actor,[],assets,character),state={actor,fx,busy:false,stopped:false};
  const setHp=actor.setHp;actor.setHp=function(v){const dead=this.hp<=0,result=setHp.call(this,v);if(this.hp<=0)fx.hideEffects();else if(dead&&!state.busy&&!state.stopped)fx.cancel();return result;};
  state.restoreHp=()=>{actor.setHp=setHp;};fx.cancel();engine.bloodmoonStates.set(actor,state);return state;
 })().finally(()=>engine.bloodmoonLoads.delete(actor));engine.bloodmoonLoads.set(actor,pending);return pending;
}
export function warmBloodmoonActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupBloodmoonActor(engine,actor).catch(e=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[Bloodmoon] 전투 효과 준비 지연; 서버 판정 유지',e);});}
export function resumeBloodmoonPlayback(engine){for(const s of engine.bloodmoonStates?.values()||[]){if(s.busy||s.actor.hp<=0)continue;s.stopped=false;s.fx.cancel();}}
export function cancelBloodmoonPlayback(engine){for(const s of engine.bloodmoonStates?.values()||[]){s.stopped=true;s.fx.cancel();}}
export function clearBloodmoonActors(engine){for(const s of engine.bloodmoonStates?.values()||[]){s.stopped=true;s.restoreHp();s.fx.destroy();}engine.bloodmoonStates?.clear();}
async function playback(engine,actor,target,action,apply){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>!engine.mercenaryDisposed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&!target.root.destroyed;
 if(!valid())return false;const s=engine.bloodmoonStates.get(actor);
 engine.settlePendingTails?.([actor,target]);actor.animationController.kill();s.busy=true;s.stopped=false;s.fx.begin(action,[target]);
 const plan=s.fx.plan,clock={time:0};let applied=false;
 const result=await engine.timeline(t=>{
  t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate(){if(valid()&&!s.stopped)s.fx.render(clock.time);}});
  t.call(()=>{if(valid()&&!s.stopped&&!applied){applied=true;apply();}},[],plan.contact);
 },()=>{s.busy=false;s.fx.cancel();if(valid()&&!s.stopped&&actor.hp>0)actor.animationController.setState('IDLE');},engine.reducedMotion?8:2,{owners:[actor,target]});
 engine.lastMercenaryPlayback={code:actor.cardId,eventType:action==='skill'?'MERCENARY_HIT':'ATTACK',authoritative:true,damageApplications:Number(applied),contactSeconds:plan.contact,durationSeconds:plan.duration,playbackRate:2,clockOwner:'V3_REGISTERED_GSAP'};
 return result&&valid();
}
export function playBloodmoonBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={},fallback=()=>false){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 if(!engine.bloodmoonStates?.has(actor)){warmBloodmoonActor(engine,actor);return fallback();}
 return playback(engine,actor,target,'attack',()=>{
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 });
}
export function playBloodmoonSkill(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);
 if(!actor||!target||target.root.destroyed)return true;
 const apply=()=>{
  if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter,event.targetMaxHp));
  if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);
  if(event.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(event.damage||0)+(event.absorbed||0)});
 };
 if(!engine.bloodmoonStates?.has(actor)){if(actor.hp>0)warmBloodmoonActor(engine,actor);apply();return true;}
 return playback(engine,actor,target,'skill',apply);
}
// The whip hit already played. Its subsequent mark/weakening is a status record,
// not another attack and not a member of the generic authored-skill catalog.
export function playBloodmoonStatus(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!=='V-961'||event.skillId!=='MS-961'||event.type!=='MERCENARY_DEBUFF'||event.mechanic!=='REPEAT_OFFENDER_RESTRAINT')return false;
 const label={OFFENDER_MARK:'위반 표식',BASIC_WEAKENED:'기본 공격 약화',NEXT_BASIC_WEAKENED:'다음 기본 공격 약화',OFFENSIVE_SKILL_ONLY:'다음 공격 스킬 약화'}[event.effect];
 if(!label)return false;
 const target=engine.combatantById(event.targetId);
 if(!target||target.hp<=0||target.battleActive===false||target.root.destroyed||!target.root.visible)return true;
 if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter,event.targetMaxHp));
 if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);
 engine.queueBanner(event.skillName||'홍련의 속박',0xeb4164,label);
 return true;
}
