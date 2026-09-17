import {ZBodyDashFX} from './ZBodyDashFX.mjs';
import {DASH_V2_SEQUENCE,fastDashBatch} from './DashProfile.mjs';
import {Z_SWORD,swordContactStop} from '../../project-v-v3/source/battle/ZBodySwordModel.mjs';
import assets from '../assets.json' with {type:'json'};
// The preview inherits the production controller and shares its Pixi layers,
// GSAP clock, cancellation, target validation and server-receipt callbacks.
export const withDashV2=Base=>class ZBodyDashV2 extends Base{
  static async load(){const [original,fx]=await Promise.all([super.load(),ZBodyDashFX.load()]);return{...original,...fx};}
  constructor(...args){super(...args);this.dashProfile='v2';this.dashFX=new ZBodyDashFX(this.engine,this.unit,this.textures);}
  usesAsset(url){return super.usesAsset(url)||Object.values(assets.atlases).some(a=>a.url===url);}
  hideEffects(){super.hideEffects();this.dashFX?.hide();}
  async play(batch,onImpact){
    const fast=batch.mode==='dash'&&this.dashProfile!=='legacy';
    const result=super.play(fast?fastDashBatch(batch):batch,onImpact);
    if(fast&&this.timeline){
      const victim=batch.entries[0]?.target;
      const render=()=>{
        const feet={x:victim.root.baseX??victim.root.x,y:victim.root.baseY??victim.root.y};
        const target={x:feet.x,y:feet.y-100};
        this.dashFX.render(this.timeMs,{start:{x:this.unit.root.baseX,y:this.unit.root.baseY},
          stop:swordContactStop(target,Z_SWORD.bodyScale*this.unit.root.scale.x),target});
      };
      this.timeline.eventCallback('onUpdate',render);render();
    }
    return result;
  }
  diagnostics(){return{...super.diagnostics(),dashProfile:this.dashProfile,contactMs:this.dashProfile==='legacy'?810:DASH_V2_SEQUENCE.contactAtMs,
    dashDurationMs:this.dashProfile==='legacy'?1695:DASH_V2_SEQUENCE.durationMs,dashEffectsVisible:Boolean(this.dashFX?.front.visible),dashEffectMs:Math.round(this.dashFX?.lastMs||0)};}
  destroy(){this.cancel();this.dashFX?.destroy();this.dashFX=null;super.destroy();}
};
