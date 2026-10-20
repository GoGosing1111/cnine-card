import {AlphaFilter,Container,Sprite} from 'pixi.js';

const TAU=Math.PI*2;
export const IDLE_AURA_DURATION=6.4;

// Atlas frames are originals from ImageGen. Blend adjacent states on the
// existing GSAP clock; the figure itself stays perfectly still and sharp.
export class PrimeIdleAura{
  constructor(actor,assets,manifest,reducedMotion=false){
    Object.assign(this,{assets,manifest,reducedMotion});
    this.layer=new Container({label:'PrimeIdleShatteredMoonAura',eventMode:'none'});
    this.layer.zIndex=6;
    this.flame=this.pair(manifest.revision.idleAura.blackflame);
    this.moon=this.pair(manifest.revision.idleAura.moon);
    actor.view.addChild(this.layer);
  }
  pair(key){
    const group=new Container(),filter=new AlphaFilter({alpha:1,resolution:'inherit'});
    group.filters=[filter];this.layer.addChild(group);
    const sprites=[new Sprite(),new Sprite()];
    for(const sprite of sprites){sprite.anchor.set(.5);sprite.blendMode='add';group.addChild(sprite);}
    return {key,sprites,filter,frame:0,next:1,blend:0};
  }
  blend(pair,time,duration,at,height,alpha,rotation=0){
    const sheet=this.manifest.sheets[pair.key],phase=((time%duration)+duration)%duration/duration*sheet.frameCount;
    pair.frame=Math.floor(phase);pair.next=(pair.frame+1)%sheet.frameCount;
    pair.blend=phase-pair.frame;
    for(const [j,sprite]of pair.sprites.entries()){
      const index=j?pair.next:pair.frame,f=sheet.frames[index],[x0,y0,x1,y1]=f.bounds;
      sprite.texture=this.assets[pair.key][index];
      sprite.anchor.set((x0+x1+1)/2/f.rect.width,(y0+y1+1)/2/f.rect.height);
      sprite.scale.set(height/sheet.artHeight);
      sprite.position.set(at.x,at.y);sprite.rotation=rotation;
      // Sum weighted premultiplied frames on a transparent offscreen group,
      // then composite it normally so the black material stays solid.
      sprite.alpha=alpha*(j?pair.blend:1-pair.blend);
    }
  }
  render(time,height,x,visibility=1){
    if(this.reducedMotion)time=0;
    const phase=time/IDLE_AURA_DURATION*TAU;
    this.pulse=.5-.5*Math.cos(phase);
    this.layer.visible=visibility>0;this.layer.alpha=visibility;
    this.blend(this.moon,time,IDLE_AURA_DURATION,
      {x,y:-height*.50+Math.sin(phase)*height*.008},
      height*1.02,.91+this.pulse*.09);
    this.blend(this.flame,time,IDLE_AURA_DURATION/2,
      {x,y:-height*.50},height,.78+this.pulse*.12);
  }
  diagnostics(){return {visible:this.layer.visible,alpha:this.layer.alpha,pulse:this.pulse,
    moonAsset:this.moon.key,moonX:this.moon.sprites[0].x,moonRotation:this.moon.sprites[0].rotation,
    moonFrame:this.moon.frame,moonNext:this.moon.next,moonBlend:this.moon.blend,
    flameFrame:this.flame.frame,flameNext:this.flame.next,flameBlend:this.flame.blend,
    renderedSprites:this.moon.sprites.length+this.flame.sprites.length,reducedMotion:this.reducedMotion};}
  destroy(){this.layer.destroy({children:true,texture:false});this.moon.filter.destroy();this.flame.filter.destroy();}
}
