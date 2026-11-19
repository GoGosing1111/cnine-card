import {spine} from '../hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {BODY,EFFECTS} from './assets.mjs';
import catalog from './effects-catalog.json' with {type:'json'};
import {Assets,Container,Point,Graphics,ColorMatrixFilter} from 'pixi.js';
const clamp=v=>Math.max(0,Math.min(1,v)),mix=(a,b,u)=>a+(b-a)*u;
const interpolate=(keys,t,key,initial=0)=>{let a={at:0,[key]:initial};for(const b of keys){if(t<b.at)return mix(a[key],b[key],clamp((t-a.at)/(b.at-a.at||1)));a=b;}return a[key];};
export class ReferenceCrimsonEffects {
 static async load(){return {catalog,records:Object.fromEntries(catalog.records.map(r=>[r.id,r]))};}
 constructor(engine,assets){Object.assign(this,{engine,assets,enabled:true,session:null,persistent:new Set(),completed:0,metrics:[]});this.observer={prerender:()=>{for(const p of this.persistent)p.render();}};engine.app.renderer.runners.prerender.add(this.observer);}
 rig(){return spine.Spine.from({...EFFECTS,autoUpdate:false});}
 body(){return spine.Spine.from({...BODY,autoUpdate:false});}
 async warm(){
  const group=new Container();group.label='CRIMSON_SHADER_WARMUP';group.alpha=.001;group.position.set(4,4);this.engine.effectLayer.addChild(group);
  for(const r of this.assets.catalog.records){const rig=this.rig(),entry=rig.state.setAnimation(0,r.id,false);entry.trackTime=r.times[r.peak];rig.update(0);rig.scale.set(.005);group.addChild(rig);}
  const body=this.body(),entry=body.state.setAnimation(0,'idle',true);entry.trackTime=0;body.update(0);body.scale.set(.002);body.filters=[this.spiritFilter(true)];group.addChild(body);
  await new Promise(resolve=>{let frames=0;const o={postrender:()=>{if(++frames<3)return;this.engine.app.renderer.runners.postrender.remove(o);resolve();}};this.engine.app.renderer.runners.postrender.add(o);});
  group.removeFromParent();group.destroy({children:true});
 }
 spiritFilter(body=false){const f=new ColorMatrixFilter();const lift=body?.22:0,weights=body?[.3,.59,.11]:[1,.25,.15];f.matrix=[...weights,0,lift,...weights,0,lift,...weights,0,lift+.025,0,0,0,1,0];return f;}
 ambient(){}
 setEnabled(v){this.enabled=Boolean(v);this.session?.render(this.session.time);for(const p of this.persistent)p.render();}
 paint(node,cue,elapsed,H,p,flip=1){
  const {rig,entry}=node,record=this.assets.records[cue.type];rig.visible=this.enabled&&elapsed>=0&&elapsed<cue.life;if(!rig.visible)return;
  const u=clamp(elapsed/cue.life);let local=u*record.duration;
  if(cue.loop){if(u<.15)local=u/.15*.22;else if(u>.84)local=.5+(u-.84)/.16*.499;else local=.22+(elapsed%.21);}
  if(cue.hold){if(u<.12)local=u/.12*.12;else if(u<.78)local=.15;else local=.3+(u-.78)/.22*(record.duration-.301);}
  entry.trackTime=Math.min(record.duration-.001,local)+1e-6;rig.update(0);
  rig.position.set(p.x,p.y);rig.scale.set(cue.w*H/record.peakVisible.width*flip*(cue.flip||1),cue.h*H/record.peakVisible.height);rig.rotation=(cue.angle||0)*flip;
  rig.alpha=(cue.alpha??1)*(u>.88?(1-u)/.12:1);
 }
 persistentCue(adapter,cue,p,H,flip){
  const rig=this.rig(),entry=rig.state.setAnimation(0,cue.type,false),layer=cue.behind?this.engine.combatLayer:this.engine.effectLayer;layer.addChildAt(rig,0);rig.label='CRIMSON_PERSISTENT_VORTEX';rig.visible=false;
  const clock={time:-cue.at},owner=this;let dead=false;
  const item={adapter,render(){if(dead)return;owner.paint({rig,entry},cue,clock.time,H,p,flip);},destroy(){if(dead)return;dead=true;rig.removeFromParent();rig.destroy();owner.persistent.delete(item);}};this.persistent.add(item);
  void this.engine.timeline(t=>{item.timeline=t;t.to(clock,{time:cue.life,duration:cue.life+cue.at,ease:'none'});},()=>item.destroy(),this.engine.actionPlaybackSpeed());
 }
 stopPersistentFor(adapter){for(const p of [...this.persistent])if(p.adapter===adapter){p.timeline?.kill();p.destroy();}}
 begin(adapter,target,mode,context){
  this.session?.destroy();const owner=this,e=this.engine,actor=adapter.actor,layer=e.effectLayer,spec=context.spec;
  const front=new Container(),behind=new Container(),bodies=new Container();front.label='CRIMSON_V3_REFERENCE_FX';behind.label='CRIMSON_V3_REAR_FX';bodies.label='CRIMSON_V3_SPIRIT_ACTIONS';layer.addChild(front);e.combatLayer.addChildAt(behind,0);e.combatLayer.addChild(bodies);
  const map=(x,y)=>layer.toLocal(actor.view.toGlobal(new Point(x,y)));
  const o=map(0,0),unit=map(0,-300),H=Math.hypot(unit.x-o.x,unit.y-o.y),flip=actor.view.scale.x>=0?1:-1;
  const rootPoint=p=>layer.toLocal(actor.root.parent.toGlobal(new Point(p.x,p.y)));
  const start=rootPoint(context.start),ground=context.impactPoint?rootPoint(context.impactPoint):layer.toLocal(target.root.toGlobal(new Point(0,0))),mid=new Point((start.x+ground.x)/2,ground.y);
  const anchors={target:ground,hit:new Point(ground.x,ground.y-H*.5),start,mid:new Point(mid.x,mid.y-H*.4)};
  const nodes=(spec.cues||[]).filter(c=>!c.persistent).map(cue=>{const rig=this.rig(),entry=rig.state.setAnimation(0,cue.type,false);(cue.behind?behind:front).addChild(rig);rig.visible=false;if(cue.spirit)rig.filters=[this.spiritFilter()];return {cue,rig,entry};});
  for(const cue of spec.cues||[])if(cue.persistent){const p=anchors[cue.anchor]||ground;this.persistentCue(adapter,cue,new Point(p.x+(cue.x||0)*H*flip,p.y+(cue.y||0)*H),H,flip);}
  const companions=(spec.clones||[]).map(cue=>{const rig=this.body(),entry=rig.state.setAnimation(0,cue.animation,false);rig.filters=[this.spiritFilter(true)];rig.visible=false;bodies.addChild(rig);return {cue,rig,entry};});
  const trails=Array.from({length:3},(_,i)=>{const rig=this.body(),entry=rig.state.setAnimation(0,mode,false);rig.tint=i?0x78000e:0x220007;rig.visible=false;behind.addChild(rig);return {rig,entry};});
  let dark=null,savedAlphas=[];
  const needsRoom=(spec.cues||[]).some(c=>Math.abs(c.w*Math.sin(c.angle||0))+Math.abs(c.h*Math.cos(c.angle||0))>=2.8||c.w>=6.8);
  // The shared battlefield stays fixed. In parties, a cast must also leave
  // other players' visibility alone when their skills overlap.
  if(!e.formationCoop&&(spec.cinematic||needsRoom)){dark=new Graphics().rect(-500,-500,e.scene.width+1000,e.scene.height+1000).fill(0x050307);dark.alpha=0;dark.label='CRIMSON_STAGE_CINEMATIC_DARKEN';e.stage.addChildAt(dark,e.stage.getChildIndex(e.combatLayer));savedAlphas=e.characters.filter(a=>a!==actor&&a.root&&!a.root.destroyed).map(a=>[a.root,a.root.alpha]);}
  let disposed=false;
  const session={time:0,H,mode,render(t){
   if(disposed)return;session.time=t;front.visible=behind.visible=bodies.visible=owner.enabled;
   const actorOrigin=map(0,0),actorChest=map(0,-150),liveAnchors={...anchors,actor:actorOrigin,chest:actorChest};
   for(const node of nodes){const c=node.cue,elapsed=t-c.at,anchor=liveAnchors[c.anchor]||anchors.hit,u=clamp(elapsed/c.life);const p=new Point(anchor.x+((c.x||0)+(c.travel||0)*u)*H*flip,anchor.y+(c.y||0)*H);
    if(c.type==='crescent'&&c.h>=2){const r=owner.assets.records.crescent,f=r.frames[r.peak],b=f.alpha128Bounds,angle=(c.angle||0)*flip;let bottom=-Infinity;for(const x of [b.left,b.right])for(const y of [b.top,b.bottom]){const dx=(x-f.origin[0])/b.width*c.w*H*flip*(c.flip||1),dy=(y-f.origin[1])/b.height*c.h*H;bottom=Math.max(bottom,Math.sin(angle)*dx+Math.cos(angle)*dy);}p.y=ground.y+.13*H-bottom+(c.y||0)*H;}
    if(c.type==='crescent'&&(mode==='skill_crescent'||mode==='skill_twin')){const from=c.spirit?ground.x+flip*H*2.3:actorOrigin.x+flip*H*1.2,to=anchor.x+(c.x||0)*H*flip;p.x=mix(from,to,clamp(elapsed/.12))+(c.travel||0)*H*flip*Math.max(0,u-.24);}
    owner.paint(node,c,elapsed,H,p,flip);}
   for(const node of companions){const {cue:c,rig,entry}=node,u=(t-c.at)/c.life;rig.visible=owner.enabled&&u>=0&&u<1;if(!rig.visible)continue;const anchor=c.anchor==='actor'?actorOrigin:ground;let s=clamp((u-.12)/.54),x=mix(c.from[0],c.to[0],s),y=mix(c.from[1],c.to[1],s);if(c.animation==='clone_finisher'){x=interpolate([{at:0,x:3},{at:.12,x:3},{at:.18,x:.5},{at:.27,x:-.6},{at:.35,x:1.6},{at:.44,x:.8},{at:.7,x:1.8},{at:.85,x:-1.8},{at:1,x:1.5}],u,'x');}rig.position.set(anchor.x+x*H*flip,anchor.y+y*H);rig.scale.set(H/1040*flip*(c.reverse?-1:1),H/1040);const d=adapter.frames.companions[c.animation]?.duration??adapter.frames.states[c.animation]?.duration??c.life;entry.trackTime=clamp(u)*d+1e-6;rig.update(0);rig.alpha=(c.alpha??.82)*Math.min(1,u/.05,(1-u)/.1);}
   for(let i=0;i<trails.length;i++){const {rig,entry}=trails[i],past=t-(i+1)*.045,p=context.rootAt(Math.max(0,past)),n=context.rootAt(t),moving=Math.hypot(p.x-n.x,p.y-n.y)>6;rig.visible=owner.enabled&&past>=0&&moving;if(!rig.visible)continue;rig.position.copyFrom(rootPoint(p));rig.scale.set(H/1040*flip,H/1040);entry.trackTime=past+1e-6;rig.update(0);rig.alpha=.23-i*.055;}
   if(dark){const opacity=owner.enabled?interpolate(spec.camera||[],t,'dark'):0;dark.alpha=opacity;for(const [r,a]of savedAlphas)if(!r.destroyed)r.alpha=a*(1-opacity*.72);}
  },audit(){return {mode,time:session.time,bodyHeight:H,visibleEffects:nodes.filter(n=>n.rig.visible).map(n=>({type:n.cue.type,wH:n.cue.w,hH:n.cue.h,frame:n.rig.skeleton.slots[0].pose.attachment?.name})),companions:companions.filter(n=>n.rig.visible).length,persistent:owner.persistent.size,cinematic:!!dark,portraitCutin:false,cameraLocked:true,placement:context.placementMode||null,impactPoint:context.impactPoint||null,disposed};},destroy(){if(disposed)return;disposed=true;owner.metrics.push(session.audit());if(owner.metrics.length>32)owner.metrics.shift();for(const c of [front,behind,bodies]){c.removeFromParent();c.destroy({children:true});}if(dark){dark.removeFromParent();dark.destroy();for(const [r,a]of savedAlphas)if(!r.destroyed)r.alpha=a;}if(owner.session===session)owner.session=null;owner.completed++;}};
  this.session=session;return session;
 }
 audit(){return {version:'reference-v3-colour-approved',paletteApproved:true,sizeApproval:false,enabled:this.enabled,paintedFrames:84,session:this.session?.audit()||null,persistent:this.persistent.size,completed:this.completed};}
 destroy(){this.session?.destroy();for(const p of [...this.persistent]){p.timeline?.kill();p.destroy();}this.engine.app?.renderer?.runners?.prerender?.remove(this.observer);}
}
