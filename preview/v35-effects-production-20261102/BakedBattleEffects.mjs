import {Assets,Sprite,Texture,Rectangle,Point} from 'pixi.js';

// Offline Effekseer/Blender frames, rendered by the existing V3 Pixi instance.
// No ticker, WebGL context, damage, or wall-clock timer is created here.
export class BakedBattleEffects {
 static async load(base='/preview/v35-effects-production-20261102/runtime/'){
  const response=await fetch(base+'fx-manifest.json');if(!response.ok)throw Error('V3.5 effect manifest unavailable');
  const manifest=await response.json(),textures={};
  await Promise.all(Object.entries(manifest.effects).map(async([id,s])=>{const atlas=await Assets.load(base+s.atlas);textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));}));
  return {manifest,textures};
 }
 constructor(engine,assets){Object.assign(this,{engine,assets,enabled:true,session:null,completed:0});}
 begin(adapter,target){this.session?.destroy();const owner=this,specs=this.assets.manifest.effects,sprites={};
  for(const id of Object.keys(specs)){const s=specs[id],sprite=new Sprite(this.assets.textures[id][0]);sprite.label='V35_BAKED_'+id;sprite.anchor.set(s.pivot[0]/s.frames[0].w,s.pivot[1]/s.frames[0].h);sprite.blendMode=s.blend;sprite.visible=false;this.engine.effectLayer.addChild(sprite);sprites[id]=sprite;}
  const actor=adapter.actor,rig=adapter.rig,layer=this.engine.effectLayer;
  const bonePoint=name=>{const pose=rig.skeleton.findBone(name)?.appliedPose;if(!pose)throw Error('Missing effect socket '+name);return layer.toLocal(rig.toGlobal(new Point(pose.worldX,pose.worldY)));};
  const basis=()=>{const o=layer.toLocal(actor.root.toGlobal(new Point(0,0))),x=layer.toLocal(actor.root.toGlobal(new Point(1,0)));return Math.hypot(x.x-o.x,x.y-o.y);};
  let disposed=false,contactPoint=null,groundPoint=null,currentTime=0;const currentFrames={};
  const show=(id,elapsed,position,scale,rotation=0,mirrorY=1,mirrorX=1)=>{const sprite=sprites[id],s=specs[id],index=Math.floor(elapsed*s.fps*s.playbackRate+1e-7);sprite.visible=owner.enabled&&elapsed>=0&&index>=0&&index<s.frames.length;currentFrames[id]=sprite.visible?index:-1;if(!sprite.visible)return;sprite.texture=owner.assets.textures[id][index];sprite.position.copyFrom(position);sprite.scale.set(scale*mirrorX/s.rasterScale[0],scale*mirrorY/s.rasterScale[1]);sprite.rotation=rotation;};
  const session={
   impact(){if(disposed||contactPoint)return;contactPoint=bonePoint('blade_tip');const floor=layer.toLocal(target.root.toGlobal(new Point(0,0)));groundPoint=new Point(contactPoint.x,floor.y);},
   render(t){if(disposed)return;currentTime=t;const hand=bonePoint('weapon_grip'),tip=bonePoint('blade_tip'),scale=basis();const length=Math.hypot(tip.x-hand.x,tip.y-hand.y),angle=Math.atan2(tip.y-hand.y,tip.x-hand.x);const facing=actor.view.scale.x>=0?1:-1;
    show('cleave',t-.235,hand,length/(4.2/12*512),angle-.3*facing,facing);
    if(contactPoint){show('contact',t-.34,contactPoint,scale*.9);show('ground-wave',t-.34,groundPoint,scale*.75);show('debris',t-.34,groundPoint,scale*.68,0,1,facing);}
   },
   audit(){return {time:currentTime,frames:{...currentFrames},active:Object.values(sprites).filter(s=>s.visible).length,contact:contactPoint?{x:contactPoint.x,y:contactPoint.y}:null,ground:groundPoint?{x:groundPoint.x,y:groundPoint.y}:null,disposed};},
   destroy(){if(disposed)return;disposed=true;for(const sprite of Object.values(sprites)){sprite.removeFromParent();sprite.destroy();}if(owner.session===session)owner.session=null;owner.completed++;}
  };this.session=session;return session;
 }
 setEnabled(value){this.enabled=Boolean(value);if(this.session)this.session.render(this.session.audit().time);}
 audit(){return {enabled:this.enabled,active:this.session?.audit()||null,completed:this.completed,decodedBytes:this.assets.manifest.decodedBytes};}
 destroy(){this.session?.destroy();}
}
