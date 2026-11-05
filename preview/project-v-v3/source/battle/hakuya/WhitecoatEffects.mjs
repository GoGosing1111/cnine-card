import {Assets,Texture,Rectangle} from 'pixi.js';
import {SwordplayEffects} from './swordplay-v5/SwordplayEffects.mjs';
import {HakuyaAura} from './aura-v2/HakuyaAura.mjs';
export class WhitecoatEffects {
 static async load(){
  const base='/assets/ui/project-v/mercenaries/hakuya-shin-20261105/effects/';
  const response=await fetch(base+'fx-manifest.json');if(!response.ok)throw Error('HAKUYA_EFFECT_MANIFEST');
  const manifest=await response.json(),textures={};
  const [trailTexture,aura]=await Promise.all([
   Assets.load({src:base+'sword-ribbon-source.png',data:{autoGenerateMipmaps:true,scaleMode:'linear'}}),HakuyaAura.load(),
   ...Object.entries(manifest.effects).map(async([id,s])=>{const atlas=await Assets.load(base+s.atlas);textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));})
  ]);
  manifest.decodedBytes+=aura.manifest.decodedBytes+Math.ceil(trailTexture.width*trailTexture.height*4*4/3);
  return {manifest,textures,trailTexture,aura};
 }
 constructor(engine,assets){Object.assign(this,{engine,assets,enabled:true,session:null,completed:0});}
 begin(adapter,target,mode,{rootAt,strike}){this.session?.destroy();return this.session=new SwordplayEffects(this,adapter,mode,{rootAt,strike});}
 setEnabled(v){this.enabled=Boolean(v);if(this.session)this.session.render(this.session.audit().time);for(const aura of this.auras||[])aura.render(aura.time);}
 audit(){return {enabled:this.enabled,active:this.session?.audit()||null,completed:this.completed,decodedBytes:this.assets.manifest.decodedBytes};}
 destroy(){this.session?.destroy();}
}
