import {Assets,Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import manifest from '../../../../assets/ui/project-v/account-battle-suits/z-dash-v2/manifest.json' with {type:'json'};
import {DASH_V2_SEQUENCE,DASH_V2_FX,effectSample} from './ZBodyDashProfile.mjs';
import {Z_SWORD,swordPose} from './ZBodySwordModel.mjs';
export class ZBodyDashFX{
  static usesAsset(url){return Object.values(manifest.atlases).some(spec=>spec.url===url);}
  static async load(){
    const textures={};
    await Promise.all(Object.entries(manifest.atlases).map(async([key,spec])=>{
      const sheet=await Assets.load(spec.url);
      textures['dash'+key]=spec.frames.map((_,i)=>new Texture({source:sheet.source,frame:new Rectangle(i%4*512,Math.floor(i/4)*512,512,512)}));
    }));
    return textures;
  }
  constructor(engine,unit,textures){
    Object.assign(this,{engine,unit,textures});
    this.back=new Container({label:'ZDashV2WakeAndAfterimages'});
    this.front=new Container({label:'ZDashV2Contact'});
    engine.backgroundLayer.addChild(this.back);engine.effectLayer.addChild(this.front);
    this.streaks=this.back.addChild(new Graphics());
    this.ghosts=Array.from({length:3},()=>{const s=this.back.addChild(new Sprite(textures.attack[0]));s.tint=0x83dcff;s.blendMode='add';return s;});
    const pair=(key,parent)=>[0,1].map(()=>{const s=parent.addChild(new Sprite(textures['dash'+key][0]));const p=manifest.atlases[key].pivot;s.anchor.set(p.x/512,p.y/512);s.blendMode='add';return s;});
    this.wake=pair('wake',this.back);this.cut=pair('cut',this.front);
    this.sparks=this.front.addChild(new Graphics());this.hide();
  }
  paint(pair,key,age,point,scale,rotation=0,alpha=1){
    const sample=effectSample(DASH_V2_FX[key].durations,age);
    pair.forEach((s,i)=>{
      s.visible=Boolean(sample);if(!sample)return;
      s.texture=this.textures['dash'+key][i?sample.next:sample.index];
      s.position.set(point.x,point.y);s.scale.set(scale);s.rotation=rotation;
      s.alpha=sample.alpha*(i?sample.blend:1-sample.blend)*alpha;
    });
  }
  render(ms,{start,stop,target}){
    this.back.visible=this.front.visible=true;this.lastMs=ms;
    const {unit}=this,rootScale=unit.root.scale.x,scale=Z_SWORD.bodyScale*rootScale;
    const angle=Math.atan2(stop.y-start.y,stop.x-start.x);
    const age=ms-DASH_V2_FX.wake.startMs,fade=Math.max(0,1-(ms-245)/100);
    const hip={x:unit.root.x+125*rootScale,y:unit.root.y-180*rootScale};
    this.paint(this.wake,'wake',age,hip,rootScale*.9,angle,.83*fade);
    this.paint(this.cut,'cut',ms-DASH_V2_FX.cut.startMs,target,rootScale*.9,0,.93);
    this.ghosts.forEach((ghost,i)=>{
      const previous=ms-(i+1)*22,state=swordPose(DASH_V2_SEQUENCE,previous);
      ghost.visible=previous>=55&&previous<=190&&ms<295;
      if(!ghost.visible)return;
      const index=Z_SWORD.attack.frames.findIndex(f=>f.id===state.frame),frame=Z_SWORD.attack.frames[index];
      ghost.texture=this.textures.attack[index];ghost.anchor.set(frame.pivot.x/1024,frame.pivot.y/768);ghost.scale.set(scale);
      ghost.position.set(start.x+(stop.x-start.x)*state.travel,start.y+(stop.y-start.y)*state.travel+state.hop);
      ghost.alpha=[.27,.16,.08][i]*fade;
    });
    this.streaks.clear();this.sparks.clear();
    if(ms>=55&&ms<285){
      const progress=(ms-55)/230,opacity=(1-progress)*.65;
      const x=start.x+125*rootScale,y=start.y-50*rootScale;
      this.streaks.ellipse(x,y,rootScale*(24+progress*110),rootScale*(9+progress*28)).stroke({color:0x9cecff,width:3,alpha:opacity});
      for(let n=0;n<7;n++){
        const offset=(n-3)*12*rootScale;
        this.streaks.moveTo(x+offset,y+offset*.3).lineTo(hip.x-40*rootScale+offset,hip.y+90*rootScale+offset*.3).stroke({color:n%3?0x42bffc:0xffd890,width:n%3?1.1:1.8,alpha:.3*opacity});
      }
    }
    const contactAge=ms-DASH_V2_SEQUENCE.contactAtMs;
    if(contactAge>=0&&contactAge<220){
      const p=contactAge/220;
      for(let n=0;n<12;n++){
        const a=n*2.399,r=(30+p*(80+n*9))*rootScale,x=target.x+Math.cos(a)*r,y=target.y+Math.sin(a)*r*.55;
        this.sparks.moveTo(x,y).lineTo(x-Math.cos(a)*14*(1-p),y-Math.sin(a)*8*(1-p)).stroke({color:n%3?0x9aecff:0xffdc8e,width:n%3?1.5:2,alpha:(1-p)*.85});
      }
    }
  }
  hide(){this.back.visible=this.front.visible=false;this.lastMs=0;}
  destroy(){this.back.destroy({children:true});this.front.destroy({children:true});}
}
