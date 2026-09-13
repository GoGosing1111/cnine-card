import {AnimatedSprite,Assets} from 'pixi.js';
import {CHARACTER_STATE} from './BattleCharacter.js';
import {configureDamageText} from './ObjectPool.js';
import {mercenaryAttachment,mercenaryEmission} from '../../../project-v-mercenary-system-v1/source/MercenaryAttachmentPoints.js';
import {getMercenaryAudio} from '../../../project-v-mercenary-system-v1/source/MercenarySkillAudio.js';

// These are the seven CMS mercenary roles, independent of the four regular
// card uniques. User approved all seven authored sequences for live use.
export const MERCENARY_ROLE_ATTACKS=Object.freeze({
 GUARDIAN:{label:'수호',detail:'방패 강타 · 은철 파쇄',impactAt:.29,duration:.86,size:1.04,shake:8,sound:'MS-003'},
 VANGUARD:{label:'돌격',detail:'중검 돌파 · 중량 참격',impactAt:.28,duration:.83,size:1.24,shake:11,sound:'MS-001'},
 ASSASSIN:{label:'기습',detail:'그림자 절단 · 압축 파열',impactAt:.22,duration:.68,size:.92,shake:5,sound:'MS-010'},
 MARKSMAN:{label:'사격',detail:'정밀 사격 · 탄착 파편',impactAt:.24,duration:.69,size:.79,shake:5,sound:'MS-009'},
 SNIPER:{label:'저격',detail:'집중 조준 · 관통 충격',impactAt:.36,duration:.90,size:1.13,shake:9,sound:'MS-004'},
 CONTROLLER:{label:'제압',detail:'구속 전류 · 전자 파열',impactAt:.29,duration:.82,size:1.02,shake:6,sound:'MS-042'},
 SUPPORT:{label:'지원',detail:'집속 방출 · 광편 충격',impactAt:.28,duration:.80,size:.93,shake:4,sound:'MS-028'}
});
const cache=new Map();
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function roleFrameAt(time,profile){
 if(time<0||time>=profile.duration)return -1;
 return time<profile.impactAt?Math.min(3,Math.floor(time/profile.impactAt*4)):Math.min(15,4+Math.floor((time-profile.impactAt)/(profile.duration-profile.impactAt)*12));
}
export async function preloadMercenaryRole(role){
 if(!MERCENARY_ROLE_ATTACKS[role])throw Error('UNKNOWN_MERCENARY_ROLE');
 if(!cache.has(role))cache.set(role,Assets.load(`/preview/mercenary-role-attacks-v2100/assets/${role.toLowerCase()}/atlas.json`).then(sheet=>{
  const frames=Object.entries(sheet.textures).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
  if(frames.length!==16)throw Error('MERCENARY_ROLE_FRAME_COUNT');return frames;
 }).catch(error=>{cache.delete(role);throw error;}));
 return cache.get(role);
}
export function roleContact(actor,layer){
 const authored=mercenaryAttachment(actor,'contact',layer);if(authored)return authored;
 const sprite=actor?.fullBodySprite;
 if(sprite&&!sprite.destroyed){const box=sprite.texture.orig;return layer.toLocal({x:(.5-sprite.anchor.x)*box.width,y:(.48-sprite.anchor.y)*box.height},sprite);}
 return layer.toLocal({x:0,y:-176},actor.root);
}
function bodyHeight(actor,layer){
 const sprite=actor.fullBodySprite;if(!sprite)return 180;
 const a=layer.toLocal({x:0,y:0},sprite),b=layer.toLocal({x:0,y:sprite.texture.orig.height},sprite);
 return Math.hypot(a.x-b.x,a.y-b.y);
}
export class MercenaryRoleAttackFX{
 constructor(engine,actor,target,frames){
  this.engine=engine;this.actor=actor;this.target=target;this.role=actor.role;this.profile=MERCENARY_ROLE_ATTACKS[this.role];this.frame=-1;this.visited=new Set();this.released=false;
  this.sprite=new AnimatedSprite({textures:frames,autoUpdate:false});this.sprite.anchor.set(.5);this.sprite.eventMode='none';this.sprite.blendMode='normal';
  this.sprite.label=`MERCENARY_ROLE_${this.role}`;engine.effectLayer.addChild(this.sprite);
  this.size=clamp(bodyHeight(target,engine.effectLayer)*this.profile.size,95,280);
 }
 render(time){
  if(this.released)return;
  this.time=time;const frame=roleFrameAt(time,this.profile);this.frame=frame;
  if(frame<0||!this.target.root?.visible||this.target.battleActive===false||!this.contactApplied&&!this.engine.isAlive(this.target)){this.sprite.visible=false;return;}
  const layer=this.engine.effectLayer,source=mercenaryEmission(this.actor,layer)||roleContact(this.actor,layer),contact=roleContact(this.target,layer);
  const remote=['GUN','BOW','MAGIC'].includes(this.actor.mercenaryAttachments?.weaponKind),emitted=time>=this.profile.impactAt*.72;
  let point=contact,size=this.size;
  if(frame<4){
   const travel=remote&&emitted?clamp((time/this.profile.impactAt-.72)/.28,0,1):0;
   point={x:source.x+(contact.x-source.x)*travel,y:source.y+(contact.y-source.y)*travel};size*=remote?.30:.58;
  }
  this.sprite.position.set(point.x,point.y);this.sprite.width=size;this.sprite.height=size;
  // Only reflect direction; never stretch/recolor a common effect into roles.
  this.sprite.scale.x=Math.abs(this.sprite.scale.x)*(contact.x<source.x?-1:1);
  this.sprite.visible=true;this.sprite.alpha=1;this.sprite.gotoAndStop(frame);this.visited.add(frame);
  this.contact={x:contact.x,y:contact.y};this.emission={x:source.x,y:source.y};
 }
 release(){if(this.released)return;this.released=true;this.sprite.removeFromParent();this.sprite.destroy({texture:false,textureSource:false});}
 diagnostics(){return {role:this.role,frame:this.frame,visited:[...this.visited],time:this.time,contact:this.contact,emission:this.emission,released:this.released};}
}

export async function playMercenaryRoleAttack(engine,{attacker:actor,target,damage=0,critical=false,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!actor?.isMercenary||!MERCENARY_ROLE_ATTACKS[actor.role]||!engine.isAlive(actor)||!engine.isAlive(target)||!target.root.visible)return false;
 const epoch=engine.playbackEpoch,mercenaryEpoch=engine.mercenaryEpoch;
 const valid=()=>engine.visible&&epoch===engine.playbackEpoch&&mercenaryEpoch===engine.mercenaryEpoch&&!actor.root.destroyed&&!target.root.destroyed;
 const frames=await preloadMercenaryRole(actor.role);if(!valid()||!engine.isAlive(target))return false;
 engine.settlePendingTails([actor,target]);
 const audio=engine.audio?.enabled?.()!==false?getMercenaryAudio(engine):null;
 if(audio){let deadline;await Promise.race([audio.unlock().catch(()=>false),new Promise(resolve=>{deadline=setTimeout(()=>resolve(false),2500);})]).finally(()=>clearTimeout(deadline));if(!valid())return false;}
 const fx=new MercenaryRoleAttackFX(engine,actor,target,frames),p=fx.profile,clock={value:0},remote=['GUN','BOW','MAGIC'].includes(actor.mercenaryAttachments?.weaponKind);
 engine.mercenaryRoleFx=fx;
 const actorView=actor.root,damageLabel=engine.pools.damage.acquire(),direction=target.root.x<actor.baseX?-1:1;
 const distance=Math.hypot(target.root.x-actor.baseX,target.root.y-actor.baseY),approach=remote?{x:actor.baseX,y:actor.baseY}:{x:actor.baseX+(target.root.x-actor.baseX)*Math.max(0,1-95/Math.max(1,distance)),y:actor.baseY+(target.root.y-actor.baseY)*Math.max(0,1-95/Math.max(1,distance))};
 configureDamageText(damageLabel,{kind:'ATTACK',damage,critical,healing:0,hitCount:1,compact:engine.mobile});damageLabel.visible=false;engine.uiLayer.addChild(damageLabel);
 let impacted=false,timelineRef;
 const cleanup=()=>{
  if(audio?.planEvents===ownedAudioPlan)audio?.stop();engine.lastMercenaryRoleFx={...fx.diagnostics(),impacted};fx.release();if(engine.mercenaryRoleFx===fx)engine.mercenaryRoleFx=null;
  engine.pools.damage.release(damageLabel);
  if(!actorView.destroyed){actorView.position.set(actor.baseX,actor.baseY);actorView.scale.set(actor.restScale);actor.setState(actor.hp>0?CHARACTER_STATE.IDLE:CHARACTER_STATE.DEAD);}
  if(!target.root.destroyed){target.tint=0xffffff;target.setState(target.hp>0?CHARACTER_STATE.IDLE:CHARACTER_STATE.DEAD);}
 };
 audio?.select({id:p.sound,visual:{impacts:[p.impactAt]}},{authoritative:true,duration:p.duration,events:[{kind:'HIT',at:p.impactAt,phaseIndex:0}]},{panDirection:direction});
 const ownedAudioPlan=audio?.planEvents;
 engine.updateStatus(`${actor.name} · ${p.label} · ${p.detail}`);
 const playback=engine.timeline(t=>{
  timelineRef=t;fx.timeline=t;
  t.call(()=>{actor.setState(remote?CHARACTER_STATE.ATTACK:CHARACTER_STATE.MOVE);audio?.scheduleFrom(0,t.timeScale());},[],0);
  t.to(clock,{value:p.duration,duration:p.duration,ease:'none',onUpdate:()=>{fx.render(clock.value);if(audio&&audio.planEvents===ownedAudioPlan&&audio.lastRate!==t.timeScale())audio.scheduleFrom(clock.value,t.timeScale());}},0);
  if(remote){
   t.to(actorView,{x:actor.baseX-direction*10,duration:.055,ease:'power3.out'},p.impactAt*.68);
   t.to(actorView,{x:actor.baseX,duration:.18,ease:'power2.out'},p.impactAt);
  }else{
   t.to(actorView,{...approach,duration:p.impactAt*.82,ease:actor.role==='ASSASSIN'?'power4.in':'power2.out'},0);
   t.call(()=>actor.setState(CHARACTER_STATE.ATTACK),[],p.impactAt*.78);
   t.to(actorView,{x:actor.baseX,y:actor.baseY,duration:.22,ease:'power2.inOut'},p.impactAt+.08);
  }
  t.call(()=>{
   if(!valid()||!engine.isAlive(target))return;
   impacted=true;fx.contactApplied=true;fx.render(p.impactAt);target.setState(CHARACTER_STATE.HIT);target.tint=0xffead9;
   if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
   if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
   onImpact(target);damageLabel.position.set(target.root.x,target.root.y-290);damageLabel.visible=true;
  },[],p.impactAt);
  t.call(()=>{if(!target.root.destroyed)target.tint=0xffffff;},[],p.impactAt+.07);
  t.fromTo(damageLabel,{alpha:0},{alpha:1,duration:.08},p.impactAt);
  t.to(damageLabel,{alpha:0,duration:.22},p.impactAt+.18);
  if(!engine.reducedMotion)engine.camera.addShake(t,{intensity:p.shake*(critical?1.1:1),duration:.14,rotation:.002,at:p.impactAt});
 },cleanup,null,engine.mercenaryRoleReviewHold?{}:{releaseAt:p.impactAt+.31,owners:[actor,target]});
 if(Number.isFinite(engine.mercenaryRoleReviewStartAt)){
  const at=clamp(engine.mercenaryRoleReviewStartAt,0,p.duration-.0001);timelineRef.pause();timelineRef.seek(at,true);fx.render(at);audio?.stop();
 }
 return playback;
}
