import {gsap} from 'gsap';

// The existing V3 actor owns formation, mirroring, HUD, target IDs and HP.
// Spine owns only the local artwork. No independent Pixi ticker or damage roll.
export class SpineBattleAdapter {
 constructor(engine,actor,rig,{bodyPixels=1215,bodyHeight=285,effects=null}={}){
  Object.assign(this,{engine,actor,rig,bodyPixels,bodyHeight,effects,busy:false,destroyed:false,clock:{time:0},contacts:[]});
  rig.autoUpdate=false;rig.scale.set(bodyHeight/bodyPixels);rig.position.set(17.5*rig.scale.x,10*rig.scale.y);rig.label='V35_SPINE_ACTOR';
  actor.view.addChild(rig);actor.fullBodySprite.visible=false;actor.spineRig=rig;
  const setTint=actor.setTint.bind(actor);this.originalTint=actor.setTint;actor.setTint=value=>{setTint(value);rig.tint=value;};
 }
 begin(name){this.stopAmbient();this.rig.state.clearTracks();this.rig.skeleton.setupPose();this.entry=this.rig.state.setAnimation(0,name,name==='idle');this.clock.time=0;this.render(0);}
 render(t){if(this.destroyed)return;this.clock.time=t;this.entry.trackTime=t;this.rig.update(0);}
 setFacing(){/* BattleCharacter.view already mirrors the entire artwork once. */}
 stopAmbient(){if(!this.ambient)return;const entry=this.ambient;this.ambient=null;this.engine.simpleTimelines.delete(entry);entry.instance.kill();}
 idle(){if(this.destroyed||this.actor.hp<=0)return;this.begin('idle');this.rig.alpha=1;this.rig.rotation=0;this.rig.visible=true;const c={t:0};const instance=gsap.timeline({repeat:-1,paused:!this.engine.visible}).to(c,{t:4.2,duration:4.2,ease:'none',onUpdate:()=>this.render(c.t)});const entry={instance,settle:()=>this.stopAmbient()};this.ambient=entry;this.timeline=instance;this.engine.simpleTimelines.add(entry);}
 setState(state){if(this.destroyed)return;if(state==='DEAD'){this.stopAmbient();this.effects?.destroy();this.rig.visible=false;return;}if(this.busy)return;if(state==='IDLE'||state==='MOVE'||state==='HIT')this.idle();}
 async attack({target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}){
  const e=this.engine,a=this.actor;if(!e.isAlive(a)||!e.isAlive(target))return false;
  e.settlePendingTails([a,target]);this.busy=true;this.begin('attack_basic');a.state='ATTACK';
  const fx=this.effects?.begin(this,target);
  const epoch=e.playbackEpoch,c={time:0},duration=this.entry.animation.duration,contact=.34,start={x:a.root.x,y:a.root.y};let applied=false;
  const valid=()=>!this.destroyed&&!a.root.destroyed&&!target.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
  // Body travel is performed by the existing actor root. Local feet keep their
  // authored support; the opponent's formation and health remain engine-owned.
  const direction=target.root.x>=a.root.x?1:-1,reach=255*a.root.scale.x;
  const destination=target.root.x-direction*reach,advance=destination-start.x;
  const result=await e.timeline(t=>{
   t.to(c,{time:duration,duration,ease:'none',onUpdate:()=>{if(valid()){this.render(c.time);fx?.render(c.time);}}},0);
   t.to(a.root,{x:start.x+advance,y:target.root.y,duration:.21,ease:'power2.inOut'},.04);
   t.to(a.root,{x:start.x,y:start.y,duration:.25,ease:'power2.inOut'},.77);
   t.call(()=>{if(!valid()||applied)return;applied=true;this.render(contact);fx?.impact();fx?.render(contact);this.contacts.push({nativeTime:c.time,contact,epoch});if(targetHp!==null)e.syncTargetHp(target,Number(targetHp));if(targetShield!==null)e.syncTargetShield(target,Number(targetShield));onImpact(target);e.showAccountBattleUnitDamage(target,{damage});},[],contact);
  },()=>{fx?.destroy();a.root.position.set(start.x,start.y);this.busy=false;if(!this.destroyed&&a.hp>0){a.state='IDLE';if(e.visible)this.idle();}},null,{owners:[a,target]});
  e.lastMercenaryPlayback={code:a.cardId,mode:'attack_basic',clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,authoritative:true,damageApplications:applied?1:0,contactSeconds:contact,durationSeconds:duration};return result;
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;this.stopAmbient();this.effects?.destroy();this.actor.setTint=this.originalTint;this.rig.removeFromParent();this.rig.destroy({children:true});}
}

export function connectSpineAttacks(engine){const original=engine.normalAttack;engine.normalAttack=function(index,options={}){const adapter=options.attacker?.animationAdapter;if(adapter instanceof SpineBattleAdapter)return adapter.attack(options);return original.call(this,index,options);};return ()=>{engine.normalAttack=original;};}
