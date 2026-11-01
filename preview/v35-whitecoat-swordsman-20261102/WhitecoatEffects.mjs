import {Assets,Sprite,Texture,Rectangle,Point} from 'pixi.js';
export class WhitecoatEffects {
 static async load(){
  const base='/preview/v35-whitecoat-swordsman-20261102/effects/runtime/',manifest=await(await fetch(base+'fx-manifest.json')).json(),textures={};
  const oldBase='/preview/v35-effects-production-20261102/runtime/',old=await(await fetch(oldBase+'fx-manifest.json')).json();
  manifest.effects.debris={...old.effects.debris,externalBase:oldBase};manifest.decodedBytes+=old.effects.debris.atlasSize.reduce((a,v)=>a*v,4);
  await Promise.all(Object.entries(manifest.effects).map(async([id,s])=>{const tex=await Assets.load((s.externalBase||base)+s.atlas);textures[id]=s.frames.map(f=>new Texture({source:tex.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));}));return {manifest,textures};
 }
 constructor(engine,assets){Object.assign(this,{engine,assets,enabled:true,session:null,completed:0});}
 begin(adapter,target,mode){
  this.session?.destroy();const owner=this,layer=this.engine.effectLayer,actor=adapter.actor,rig=adapter.rig,specs=this.assets.manifest.effects,sprites={},frames={};
  for(const [id,s] of Object.entries(specs)){const sprite=new Sprite(this.assets.textures[id][0]);sprite.label='V35_WHITECOAT_FX_'+id;sprite.anchor.set(s.pivot[0]/s.frames[0].w,s.pivot[1]/s.frames[0].h);sprite.blendMode=s.blend;sprite.visible=false;layer.addChild(sprite);sprites[id]=sprite;}
  const bone=name=>{const p=rig.skeleton.findBone(name).appliedPose;return layer.toLocal(rig.toGlobal(new Point(p.worldX,p.worldY)));};
  const basis=()=>{const a=layer.toLocal(actor.root.toGlobal(new Point(0,0))),b=layer.toLocal(actor.root.toGlobal(new Point(1,0)));return Math.hypot(b.x-a.x,b.y-a.y);};
  let disposed=false,time=0,contact=null,floor=null,finish=null;const skill=mode==='skill_iai',at=skill?.30:.32;
  const show=(id,elapsed,p,scale,rotation=0,mx=1,my=1)=>{const s=specs[id],sprite=sprites[id],i=Math.floor(elapsed*s.fps*s.playbackRate+1e-7);sprite.visible=owner.enabled&&elapsed>=0&&i>=0&&i<s.frames.length;frames[id]=sprite.visible?i:-1;if(!sprite.visible)return;sprite.texture=owner.assets.textures[id][i];sprite.position.copyFrom(p);sprite.scale.set(scale*mx/s.rasterScale[0],scale*my/s.rasterScale[1]);sprite.rotation=rotation;};
  const session={
   impact(){if(disposed||contact)return;contact=bone('blade_tip');const g=layer.toLocal(target.root.toGlobal(new Point(0,0)));floor=new Point(contact.x,g.y);},
   render(t){if(disposed)return;time=t;const h=bone('weapon_grip'),tip=bone('blade_tip'),s=basis(),f=actor.view.scale.x>=0?1:-1,angle=Math.atan2(tip.y-h.y,tip.x-h.x),length=Math.hypot(tip.x-h.x,tip.y-h.y);
    if(!skill)show('edge-arc',t-.29,h,length/(4.3/12*512),angle-.3*f,1,f);
    else{const mid=new Point((h.x+tip.x)/2,(h.y+tip.y)/2);if(t>=.51&&!finish)finish={hand:h.clone(),scale:s};show('iai-line',t-.30,contact?new Point(contact.x-f*length*.5,contact.y-10*s):mid,s*1.1,0,f);if(finish){show('rising-cut',t-.51,finish.hand,finish.scale*.83,0,f);show('debris',t-.54,floor||mid,s*.42,0,f);}}
    if(contact)show('contact',t-at,contact,s*.80);
   },
   audit(){return {mode,time,frames:{...frames},active:Object.values(sprites).filter(s=>s.visible).length,contact,disposed};},
   destroy(){if(disposed)return;disposed=true;for(const sprite of Object.values(sprites)){sprite.removeFromParent();sprite.destroy();}if(owner.session===session)owner.session=null;owner.completed++;}
  };this.session=session;return session;
 }
 setEnabled(v){this.enabled=Boolean(v);if(this.session)this.session.render(this.session.audit().time);}
 audit(){return {enabled:this.enabled,active:this.session?.audit()||null,completed:this.completed,decodedBytes:this.assets.manifest.decodedBytes};}
 destroy(){this.session?.destroy();}
}
