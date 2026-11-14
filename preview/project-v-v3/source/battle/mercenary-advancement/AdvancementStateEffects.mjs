import {Sprite,Point} from 'pixi.js';
import {acquireEffectAtlas,releaseEffectAtlases,trimEffectCache} from './AdvancementEffects.mjs';

const clips={avenger:'avenger-charge','shield-knight':'knight-ward',commander:'commander-mark'};
const positive=s=>s.id==='avenger'?s.charged:s.id==='shield-knight'?s.remaining>0:s.active;
/** Presentation only. The battle event adapter supplies authoritative states.
 * Never infers procs, changes HP, decrements shields, or applies attack buffs. */
export class AdvancementStateEffects{
 constructor(engine,options){Object.assign(this,{engine,...options,enabled:true,destroyed:false,epoch:0,time:0,speed:1,timeline:null,states:new Map(),versions:new Map(),pending:new Set(),pendingWork:new Set()});}
 validActor(actor){return !!(actor?.root?.parent&&!actor.root.destroyed&&this.engine.isAlive(actor));}
 apply(state){
  const work=this.applyState(state);this.pendingWork.add(work);
  void work.then(()=>this.pendingWork.delete(work),()=>this.pendingWork.delete(work));return work;
 }
 async applyState(state){
  if(this.destroyed||state.battleId!==this.battleId||!this.engine.visible)return false;
  if(!clips[state.id]||!state.actor?.id||!Number.isSafeInteger(state.revision)||state.revision<0)throw Error('Invalid advancement visual state');
  if(state.id==='shield-knight'&&(!Number.isInteger(state.remaining)||state.remaining<0||state.remaining>3))throw Error('Shield remaining must be 0..3');
  if(state.id==='avenger'&&typeof state.charged!=='boolean'||state.id==='commander'&&typeof state.active!=='boolean')throw Error('Explicit boolean state required');
  const key=state.id+':'+state.actor.id;
  if(state.revision<=(this.versions.get(key)??-1))return false;
  if(!this.versions.has(key)&&this.versions.size>=256)throw Error('Visual state identity limit exceeded');
  this.versions.set(key,state.revision);
  if(!positive(state)||!this.validActor(state.actor)){this.remove(key);return true;}
  const previous=this.states.get(key);
  if(previous){previous.state=state;this.reconcile(previous);this.render(this.time);return true;}
  const epoch=this.epoch,engineEpoch=this.engine.playbackEpoch,token={};this.pending.add(token);
  let lease;
  try{
   lease=await acquireEffectAtlas(this.base,clips[state.id],this.manifest.effects[clips[state.id]]);
   if(this.destroyed||epoch!==this.epoch||engineEpoch!==this.engine.playbackEpoch||state.revision!==this.versions.get(key)||!this.engine.visible||!this.validActor(state.actor)){void releaseEffectAtlases([lease]);return false;}
   const row={key,state,lease,sprites:[]};this.states.set(key,row);this.reconcile(row);this.ensureClock();this.render(this.time);return true;
  }catch(error){if(lease)void releaseEffectAtlases([lease]);throw error;}finally{this.pending.delete(token);}
 }
 reconcile(row){
  const {state,lease}=row;
  const actors=state.id==='commander'?[...new Set([state.actor,...(state.allies||[])])].filter(a=>a?.team===state.actor.team&&this.validActor(a)):state.id==='shield-knight'?Array(state.remaining).fill(state.actor):[state.actor];
  for(const entry of row.sprites){entry.sprite.removeFromParent();entry.sprite.destroy();}
  row.sprites=actors.map((actor,index)=>{
   const sprite=new Sprite(lease.textures[0]);sprite.label='MERCENARY_ADVANCEMENT_STATE:'+state.id;
   sprite.anchor.set(lease.spec.pivot[0]/lease.spec.frames[0].w,lease.spec.pivot[1]/lease.spec.frames[0].h);
   sprite.blendMode='normal';sprite.eventMode='none';this.engine.effectLayer.addChild(sprite);
   return {sprite,actor,index,frame:-1};
  });
 }
 ensureClock(){
  if(this.timeline||!this.states.size)return;
  const clock={t:0};
  this.done=this.engine.timeline(timeline=>{
   this.timeline=timeline;
   timeline.to(clock,{t:1,duration:1,repeat:-1,ease:'none',onUpdate:()=>this.render(timeline.totalTime())});
  },()=>{if(!this.timeline)return;this.timeline=null;this.epoch++;for(const key of [...this.states.keys()])this.remove(key,false);},this.speed);
 }
 point(actor,x,y){return this.engine.effectLayer.toLocal(actor.root.toGlobal(new Point(x,y)));}
 render(time){
  if(this.destroyed)return;this.time=Math.max(0,Number(time)||0);
  if(!this.engine.visible){this.cancel();return;}
  const commanderTargets=new Set();
  for(const row of [...this.states.values()]){
   const {state,lease}=row;
   if(!this.validActor(state.actor)){this.remove(row.key);continue;}
   const height=Number(state.actor.art?.bodyHeight)||300;
   for(const entry of row.sprites){
    const {sprite,actor,index}=entry;
    if(!this.validActor(actor)){sprite.visible=false;continue;}
    let visible=this.enabled&&actor.root.visible!==false;
    if(state.id==='commander'){
     // Multiple commanders must never layer the same standing ally mark.
     if(commanderTargets.has(actor.id))visible=false;else commanderTargets.add(actor.id);
    }
    const frame=Math.floor((this.time%lease.spec.duration)*lease.spec.fps+1e-6)%lease.textures.length;
    entry.frame=frame;sprite.texture=lease.textures[frame];sprite.visible=visible;
    const origin=this.point(actor,0,0),unit=this.point(actor,1,0),scale=Math.hypot(unit.x-origin.x,unit.y-origin.y);
    let x=0,y=-height*.45,width=340;
    if(state.id==='shield-knight'){x=[-120,0,120][index];y=-height*.5+(index===1?-26:10);width=230;}
    if(state.id==='commander'){y=-18;width=300;}
    sprite.position.copyFrom(this.point(actor,x,y));
    sprite.scale.set(scale*width/512/lease.spec.rasterScale[0],scale*width/512/lease.spec.rasterScale[1]);
    sprite.alpha=state.id==='commander'?.8:.95;
   }
  }
 }
 remove(key,stopClock=true){
  const row=this.states.get(key);if(!row)return;
  this.states.delete(key);for(const {sprite}of row.sprites){sprite.removeFromParent();sprite.destroy();}void releaseEffectAtlases([row.lease]);
  if(stopClock&&!this.states.size&&this.timeline){const timeline=this.timeline;this.timeline=null;timeline.kill();}
 }
 setEnabled(value){this.enabled=!!value;this.render(this.time);}
 setSpeed(value){if(Number.isFinite(value)&&value>0){this.speed=value;this.timeline?.timeScale(value);}}
 pause(value=true){if(value)this.timeline?.pause();else this.timeline?.resume();}
 seek(time){this.timeline?.pause();this.timeline?.totalTime(Math.max(0,time),false);this.render(time);}
 cancel(){this.epoch++;const timeline=this.timeline;this.timeline=null;timeline?.kill();for(const key of [...this.states.keys()])this.remove(key,false);}
 async destroy(){if(this.destroyed)return this.releasePromise;this.destroyed=true;this.cancel();return this.releasePromise=(async()=>{await Promise.allSettled([...this.pendingWork]);await trimEffectCache(true);})();}
 audit(){return {battleId:this.battleId,time:this.time,pending:this.pending.size,active:this.states.size,clock:!!this.timeline,rows:[...this.states.values()].map(r=>({id:r.state.id,actor:r.state.actor.id,revision:r.state.revision,remaining:r.state.remaining,sprites:r.sprites.map(s=>({actor:s.actor.id,frame:s.frame,visible:s.sprite.visible,x:s.sprite.x,y:s.sprite.y}))}))};}
}
