import {Assets,Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import manifest from '../../../../assets/ui/project-v/account-battle-suits/z-normal-lightning-v3/manifest.json' with {type:'json'};
import {effectSample,DASH_V2_SEQUENCE} from './ZBodyDashProfile.mjs';
import {Z_SWORD,swordPose} from './ZBodySwordModel.mjs';

export const NORMAL_FX={
  surge:{startMs:40,durations:[12,12,16,18,18,18,18,22,24,28,34,42]},
  wake:{startMs:45,durations:[14,14,16,16,18,20,20,22,26,30,36,52]},
  slash:{startMs:191,durations:[12,12,14,16,24,30,32,36,40,44,46,48]},
  impact:{startMs:233,durations:[6,6,24,32,34,38,42,46,45,45,42,45]}
};
export const normalFrame=(key,ms)=>effectSample(NORMAL_FX[key].durations,ms-NORMAL_FX[key].startMs);

// Samples the existing sword GSAP clock. This class never schedules attacks,
// damage, timers, tickers, independent GSAP timelines or Pixi applications.
export class ZBodyNormalFX{
  static async preload(){
    const textures={};
    await Promise.all(Object.entries(manifest.atlases).map(async([key,spec])=>{
      const sheet=await Assets.load(spec.url);
      textures[key]=spec.frames.map((_,i)=>new Texture({source:sheet.source,frame:new Rectangle(i%4*512,Math.floor(i/4)*512,512,512)}));
    }));
    return textures;
  }
  constructor(engine,unit,textures,bodyTextures){
    Object.assign(this,{engine,unit,textures,bodyTextures});
    this.back=new Container({label:'ZNormalV3DashWake'});this.front=new Container({label:'ZNormalV3SwordContact'});
    engine.backgroundLayer.addChild(this.back);engine.effectLayer.addChild(this.front);
    this.ground=this.back.addChild(new Graphics());
    this.ghosts=Array.from({length:5},()=>{const s=this.back.addChild(new Sprite(bodyTextures.attack[0]));s.tint=0x8ddfff;s.blendMode='add';return s;});
    this.pairs={};
    for(const [key,spec] of Object.entries(manifest.atlases)){
      const layer=key==='wake'||key==='surge'?this.back:this.front;
      this.pairs[key]=[0,1].map(()=>{const s=layer.addChild(new Sprite(textures[key][0]));s.anchor.set(spec.pivot.x/512,spec.pivot.y/512);return s;});
    }
    this.hide();
  }
  paint(key,ms,point,scale,rotation=0,opacity=1){
    const sample=normalFrame(key,ms);
    this.pairs[key].forEach((s,i)=>{
      s.visible=Boolean(sample);if(!sample)return;
      s.texture=this.textures[key][i?sample.next:sample.index];s.position.set(point.x,point.y);s.scale.set(scale);s.rotation=rotation;
      s.alpha=sample.alpha*(i?sample.blend:1-sample.blend)*opacity;
    });
  }
  render(ms,{start,stop,target}){
    this.lastMs=ms;this.back.visible=this.front.visible=true;
    const rootScale=this.unit.root.scale.x,bodyScale=Z_SWORD.bodyScale*rootScale;
    const angle=Math.atan2(stop.y-start.y,stop.x-start.x);
    const hip={x:this.unit.root.x+125*rootScale,y:this.unit.root.y-180*rootScale};
    this.paint('surge',ms,hip,rootScale*1.78,angle,.96);
    this.paint('wake',ms,hip,rootScale*1.28,angle,.98);
    this.paint('slash',ms,target,rootScale*1.03,0,.98);
    this.paint('impact',ms,target,rootScale*.65,0,.98);
    this.ghosts.forEach((s,i)=>{
      const age=ms-(i+1)*23,pose=swordPose(DASH_V2_SEQUENCE,age);
      s.visible=age>=55&&age<=190&&ms<280;if(!s.visible)return;
      const index=Z_SWORD.attack.frames.findIndex(f=>f.id===pose.frame),frame=Z_SWORD.attack.frames[index];
      s.texture=this.bodyTextures.attack[index];s.anchor.set(frame.pivot.x/1024,frame.pivot.y/768);s.scale.set(bodyScale);
      s.position.set(start.x+(stop.x-start.x)*pose.travel,start.y+(stop.y-start.y)*pose.travel+pose.hop);
      s.alpha=[.38,.28,.19,.12,.06][i]*Math.max(0,1-(ms-190)/90);
    });
    this.ground.clear();
    if(ms>=55&&ms<230){
      const p=(ms-55)/175;
      this.ground.ellipse(start.x+105*rootScale,start.y-18*rootScale,(22+p*75)*rootScale,(8+p*16)*rootScale)
        .stroke({color:0x8deaff,width:2,alpha:(1-p)*.6});
    }
  }
  hide(){this.back.visible=this.front.visible=false;this.lastMs=0;}
  destroy(){this.back.destroy({children:true});this.front.destroy({children:true});}
}
