import {Assets,Sprite,Texture,Rectangle,Point} from 'pixi.js';
import {SwordTrail} from './SwordTrail.mjs';
export class WhitecoatEffects {
 static async load(){
  const base='/preview/v35-whitecoat-swordsman-20261102/effects/flourish-v2/runtime/',manifest=await(await fetch(base+'fx-manifest.json')).json(),textures={};
  const oldBase='/preview/v35-effects-production-20261102/runtime/',old=await(await fetch(oldBase+'fx-manifest.json')).json();
  manifest.effects.debris={...old.effects.debris,externalBase:oldBase};
  manifest.decodedBytes=Object.values(manifest.effects).reduce((sum,s)=>sum+s.atlasSize.reduce((a,v)=>a*v,4),0);
  // Battle-scale filaments need mipmaps to avoid glittering single-pixel noise.
  const trailTexture=await Assets.load({src:'/preview/v35-whitecoat-swordsman-20261102/effects/sword-trail/sword-ribbon-source.png',data:{autoGenerateMipmaps:true,scaleMode:'linear'}});
  let w=trailTexture.width,h=trailTexture.height;for(;;){manifest.decodedBytes+=w*h*4;if(w===1&&h===1)break;w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}
  await Promise.all(Object.entries(manifest.effects).map(async([id,s])=>{const tex=await Assets.load((s.externalBase||base)+s.atlas);textures[id]=s.frames.map(f=>new Texture({source:tex.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));}));return {manifest,textures,trailTexture};
 }
 constructor(engine,assets){Object.assign(this,{engine,assets,enabled:true,session:null,completed:0});}
 begin(adapter,target,mode,{rootAt}){
  this.session?.destroy();const owner=this,layer=this.engine.effectLayer,actor=adapter.actor,specs=this.assets.manifest.effects,sprites={},frames={};
  const trail=new SwordTrail(layer,adapter,this.assets.trailTexture,mode,rootAt);
  for(const [id,s] of Object.entries(specs)){const sprite=new Sprite(this.assets.textures[id][0]);sprite.label='V35_WHITECOAT_FX_'+id;sprite.anchor.set(s.pivot[0]/s.frames[0].w,s.pivot[1]/s.frames[0].h);sprite.blendMode=s.blend;sprite.visible=false;layer.addChild(sprite);sprites[id]=sprite;}
  const basis=()=>{const a=layer.toLocal(actor.root.toGlobal(new Point(0,0))),b=layer.toLocal(actor.root.toGlobal(new Point(1,0)));return Math.hypot(b.x-a.x,b.y-a.y);};
  let disposed=false,time=0,contact=null,contactAngle=0,floor=null;const skill=mode==='skill_iai',at=skill?.30:.32;
  const show=(id,elapsed,p,scale,rotation=0,mx=1,my=1)=>{const s=specs[id],sprite=sprites[id],i=Math.floor(elapsed*s.fps*s.playbackRate+1e-7);sprite.visible=owner.enabled&&elapsed>=0&&i>=0&&i<s.frames.length;frames[id]=sprite.visible?i:-1;if(!sprite.visible)return;sprite.texture=owner.assets.textures[id][i];sprite.position.copyFrom(p);sprite.scale.set(scale*mx/s.rasterScale[0],scale*my/s.rasterScale[1]);sprite.rotation=rotation;};
  const session={
   impact(){if(disposed||contact)return;const hit=trail.anchor(skill?'draw-cut':'descending-cut');contact=hit.tip;contactAngle=hit.angle;const g=layer.toLocal(target.root.toGlobal(new Point(0,0)));floor=new Point(contact.x,g.y);},
   render(t){if(disposed)return;time=t;const s=basis(),f=actor.view.scale.x>=0?1:-1;
    trail.render(t,owner.enabled);
    if(skill&&floor){show('debris',t-.54,floor,s*.50,0,f);const sweep=trail.anchor('rising-cut',.5);show('rising-release',t-.54,new Point(sweep.hand.x+(sweep.tip.x-sweep.hand.x)*.8,sweep.hand.y+(sweep.tip.y-sweep.hand.y)*.8),s*1.65,0,f);}
    if(contact)show('impact-burst',t-at,contact,s*(skill?1.35:1.20),contactAngle);
   },
   audit(){const sweep=trail.audit();return {mode,time,frames:{...frames},active:Object.values(sprites).filter(s=>s.visible).length+sweep.active,trail:sweep,contact,disposed};},
   destroy(){if(disposed)return;disposed=true;trail.destroy();for(const sprite of Object.values(sprites)){sprite.removeFromParent();sprite.destroy();}if(owner.session===session)owner.session=null;owner.completed++;}
  };this.session=session;return session;
 }
 setEnabled(v){this.enabled=Boolean(v);if(this.session)this.session.render(this.session.audit().time);}
 audit(){return {enabled:this.enabled,active:this.session?.audit()||null,completed:this.completed,decodedBytes:this.assets.manifest.decodedBytes};}
 destroy(){this.session?.destroy();}
}
