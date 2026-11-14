import {Assets,Sprite,Texture,Rectangle,Point} from 'pixi.js';
import {EFFECTS} from './catalog.mjs';

const cache=new Map(),pending=new Map(),retiring=new Map();
const budget=32*1048576;
let access=0;
const clamp=n=>Math.max(0,Math.min(1,n));
const lerp=(a,b,t)=>a+(b-a)*t;
async function acquire(base,id,spec){
 const key=base+spec.atlas;
 if(retiring.has(key))await retiring.get(key);
 if(!cache.has(key)){
  if(!pending.has(key))pending.set(key,Assets.load(key).then(atlas=>{
   const item={key,spec,atlas,refs:0,used:++access,textures:spec.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}))};
   cache.set(key,item);return item;
  }).finally(()=>pending.delete(key)));
  await pending.get(key);
 }
 const item=cache.get(key);item.refs++;item.used=++access;return item;
}
async function trimCache(all=false){
 let bytes=[...cache.values()].reduce((n,c)=>n+c.spec.decodedBytes,0);
 for(const c of [...cache.values()].sort((a,b)=>a.used-b.used)){
  if(c.refs||(!all&&bytes<=budget))continue;
  cache.delete(c.key);bytes-=c.spec.decodedBytes;
  for(const texture of c.textures)texture.destroy(false);
  // Only this module owns these URL loads. refs cover all concurrent engines;
  // active consumers' shared sources are never destroyed.
  const work=Assets.unload(c.key).finally(()=>retiring.delete(c.key));
  retiring.set(c.key,work);
  await work;
 }
 if(all)await Promise.allSettled([...retiring.values()]);
}
function release(items){for(const c of items)c.refs--;return trimCache();}
// Shared ownership for the separately authored sustained-state clips.
export {acquire as acquireEffectAtlas,release as releaseEffectAtlases,trimCache as trimEffectCache};

export class AdvancementEffects{
 constructor(engine,base,manifest){Object.assign(this,{engine,base,manifest,enabled:true,destroyed:false,sessions:new Set(),pendingEvents:new Set(),pendingWork:new Set(),seen:new Set(),epoch:0,completed:0});}
 begin(event){
  const work=this.beginEvent(event);this.pendingWork.add(work);
  void work.then(()=>this.pendingWork.delete(work),()=>this.pendingWork.delete(work));return work;
 }
 async beginEvent(event){
  if(this.destroyed||!this.engine.visible||this.sessions.size+this.pendingEvents.size>=8)return null;
  const spec=EFFECTS[event.id];if(!spec)throw Error('Unknown advancement effect '+event.id);
  if(!event.actor?.root||!event.target?.root)throw Error('Explicit visual actor and target required');
  if(typeof event.eventId!=='string'||!event.eventId)throw Error('Stable server or fixture eventId required');
  if(this.seen.has(event.eventId)||this.pendingEvents.has(event.eventId))return null;
  const ids=[event.id],epoch=this.epoch,engineEpoch=this.engine.playbackEpoch;
  this.pendingEvents.add(event.eventId);let leases=[];
  try{
   // AllSettled ensures partial successful loads are released if another fails.
   const results=await Promise.allSettled(ids.map(id=>acquire(this.base,id,this.manifest.effects[id])));
   leases=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
   const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   if(this.destroyed||epoch!==this.epoch||engineEpoch!==this.engine.playbackEpoch||!this.engine.visible){await release(leases);return null;}
   this.seen.add(event.eventId);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value);
   const session=new EffectSession(this,event,spec,ids,leases);this.sessions.add(session);return session;
  }catch(error){await release(leases);throw error;}finally{this.pendingEvents.delete(event.eventId);}
 }
 async play(event,{speed=1,paused=false}={}){
  const session=await this.begin(event);if(!session)return null;
  const clock={time:0};
  // Register in the existing V3 GSAP timeline owner. No ticker/RAF/timer,
  // additional renderer, random proc, health mutation or damage callback.
  session.done=this.engine.timeline(timeline=>{
   session.timeline=timeline;timeline.to(clock,{time:session.duration,duration:session.duration,ease:'none',onUpdate:()=>session.render(clock.time)});
  },()=>session.destroy(),speed);
  if(paused)session.timeline.pause(0);session.render(0);return session;
 }
 setEnabled(value){this.enabled=Boolean(value);for(const s of this.sessions)s.render(s.time);}
 cancel(){this.epoch++;for(const s of [...this.sessions]){s.timeline?.kill();s.destroy();}}
 async destroy(){if(this.destroyed)return this.releasePromise;this.destroyed=true;this.cancel();return this.releasePromise=(async()=>{await Promise.allSettled([...this.pendingWork]);await trimCache(true);})();}
 audit(){return {active:this.sessions.size,sprites:[...this.sessions].reduce((n,s)=>n+s.sprites.length,0),sessions:[...this.sessions].map(s=>s.audit()),cacheBytes:[...cache.values()].reduce((n,c)=>n+c.spec.decodedBytes,0),loadedClips:[...cache.values()].map(c=>({id:c.key.split('/').at(-1),refs:c.refs})),completed:this.completed};}
}
class EffectSession{
 constructor(owner,event,spec,ids,leases){
  Object.assign(this,{owner,event,spec,ids,leases,time:0,disposed:false,sprites:[],duration:Math.max(...leases.map(c=>c.spec.duration))});
  const targets=event.id==='commander'?[...new Set([event.actor,...(event.allies||[])])].filter(a=>a?.root):[];
  for(let i=0;i<ids.length;i++){
   const clip=ids[i],data=leases[i],actors=clip==='commander-mark'?targets:[null];
   for(const actor of actors){const sprite=new Sprite(data.textures[0]);sprite.label='MERCENARY_ADVANCEMENT_FX:'+clip;sprite.anchor.set(data.spec.pivot[0]/data.spec.frames[0].w,data.spec.pivot[1]/data.spec.frames[0].h);sprite.blendMode=data.spec.blend;sprite.visible=false;sprite.eventMode='none';owner.engine.effectLayer.addChild(sprite);this.sprites.push({sprite,clip,data,actor,frame:-1});}
  }
 }
 point(actor,floor=false){
  const layer=this.owner.engine.effectLayer,height=Number(actor.art?.bodyHeight)||300;
  return layer.toLocal(actor.root.toGlobal(new Point(0,floor?0:-height*.52)));
 }
 render(time){
  if(this.disposed)return;this.time=Math.max(0,time);
  const {owner,event,spec}=this,layer=owner.engine.effectLayer;
  if(!event.actor.root?.parent||!event.target.root?.parent){this.destroy();return;}
  const source=this.point(event.actor),target=this.point(event.target),origin=layer.toLocal(event.actor.root.toGlobal(new Point())),unit=layer.toLocal(event.actor.root.toGlobal(new Point(1,0))),scale=Math.hypot(unit.x-origin.x,unit.y-origin.y);
  const facing=source.x===target.x?(event.actor.team==='ENEMY'?-1:1):target.x>source.x?1:-1;
  let anchor=event.id==='avenger'&&event.phase==='charge'?'self':spec.anchor;
  let position=anchor==='self'?source:target;
  if(anchor==='return'||anchor==='outbound'){
   const u=clamp((this.time-.02)/(this.duration*.70)),e=u*u*(3-2*u),from=anchor==='return'?target:source,to=anchor==='return'?source:target;
   position=new Point(lerp(from.x,to.x,e),lerp(from.y,to.y,e)-Math.sin(u*Math.PI)*50*scale);
  }
  for(const s of this.sprites){
   const {sprite,data,clip}=s,frame=Math.floor(this.time*data.spec.fps+1e-7);
   s.frame=frame;const expired=frame>=data.textures.length;
   sprite.visible=owner.enabled&&!expired&&owner.engine.visible;
   if(!sprite.visible)continue;sprite.texture=data.textures[frame];
   sprite.position.copyFrom(clip==='commander-mark'?this.point(s.actor,true):position);
   const width=clip==='commander-mark'?250:spec.width,mirrored=['vanguard','combo','guardian'].includes(event.id)?facing:1;
   sprite.scale.set(scale*width/512/data.spec.rasterScale[0]*mirrored,scale*width/512/data.spec.rasterScale[1]);
   sprite.alpha=clip==='commander-mark'?.72:1;
  }
 }
 audit(){return {id:this.event.id,eventId:this.event.eventId,phase:this.event.phase||'proc',time:this.time,duration:this.duration,disposed:this.disposed,frames:this.sprites.map(s=>({clip:s.clip,frame:s.frame,visible:s.sprite.visible,x:s.sprite.x,y:s.sprite.y,scaleX:s.sprite.scale.x}))};}
 destroy(){
  if(this.disposed)return;this.disposed=true;
  for(const {sprite}of this.sprites){sprite.removeFromParent();sprite.destroy();}
  this.owner.sessions.delete(this);this.owner.completed++;void release(this.leases);
 }
}
