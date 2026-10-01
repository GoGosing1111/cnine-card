import {loadBerkanAssets} from '../../mercenary-berkan-sss-v1/source/BerkanFX.js';
import {BerkanAreaFX} from '../../mercenary-berkan-area-v1/source/BerkanAreaFX.js';
import {makePlan} from '../../mercenary-berkan-area-v1/skill.mjs';

// The offline skill catalog uses the same approved area frames and player as
// live PVE. The 100-HP rehearsal log, never this renderer, owns preview HP.
export async function loadAreaRehearsalAssets(){
  const [base,area]=await Promise.all(['/preview/mercenary-berkan-sss-v1/manifest.json','/preview/mercenary-berkan-area-v1/manifest.json'].map(async url=>{
    const response=await fetch(url);if(!response.ok)throw Error('AREA_REHEARSAL_ASSET');return response.json();
  }));
  const manifest={...base,effects:{...base.effects,arrowRainArea:area.arrowRainArea}};
  return {manifest,assets:await loadBerkanAssets(manifest)};
}
export function releaseAreaRehearsalAssets(resources){
  if(resources)for(const group of Object.values(resources.assets))for(const frames of Object.values(group))for(const frame of frames)frame.destroy(false);
}
export class AreaSkillRehearsalFX{
  constructor(engine,actors,skill,plan,resources,onUpdate=()=>{}){
    Object.assign(this,{engine,actors,skill,plan,onUpdate,destroyed:false});
    const stop=plan.events.find(e=>e.kind==='CANCEL')?.at??null;
    this.effect=new BerkanAreaFX(engine,actors.get('M'),plan.targets.map(id=>actors.get(id)).filter(Boolean),resources.assets,resources.manifest,
      makePlan({cancelAt:stop}),()=>{if(this.effect)this.onUpdate(this.time,this);},{useAuthoredPose:false});
    this.effect.layer.label=`MercenarySkill:${skill.id}`;
  }
  get time(){return this.effect?.time||0;}
  get playing(){return this.effect?.playing||false;}
  get speed(){return this.effect.speed;}
  play(){this.effect.play();}
  pause(){this.effect.pause();}
  seek(time){this.effect.seek(time);}
  render(time){this.effect.render(time);}
  setSpeed(speed){this.effect.setSpeed(speed);}
  cancel(){this.effect.cancel();}
  // Formation changes move roots; the approved renderer resolves coordinates
  // from those roots every frame, so no stored world positions need rewriting.
  syncFormation(){}
  diagnostics(){
    const d=this.effect.diagnostics();return {...d,skillId:this.skill.id,playing:this.playing,speed:this.speed,
      visibleSprites:d.usedSprites,ownedTimelines:this.effect.timeline?1:0,
      registeredTimelines:this.effect.registration&&this.engine.simpleTimelines.has(this.effect.registration)?1:0,
      clockOwner:'V3_REGISTERED_GSAP',primaryAnimation:'INDIVIDUAL_AUTHORED_SEQUENCE_V2',totalAuthoredFrames:16,poolOverflow:0,
      damageAuthority:this.plan.damageAuthority,destroyed:this.destroyed};
  }
  destroy(){if(this.destroyed)return;this.effect.destroy();this.destroyed=true;}
}
