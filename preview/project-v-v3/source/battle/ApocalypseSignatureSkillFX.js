import {AnimatedSprite,Assets,Container,Graphics} from 'pixi.js';
import {APOCALYPSE_SIGNATURE_SKILLS} from '../../../../shared/apocalypse-boss-skills-v2048.mjs';

const ROOT='/assets/ui/project-v/fx/apocalypse-signature-v2048';
const profiles=new Map(Object.values(APOCALYPSE_SIGNATURE_SKILLS).map(skill=>[skill.code,Object.freeze({...skill,frameCount:12,collisionFrame:6,fps:18,atlasPath:`${ROOT}/${skill.asset}-impact-atlas-v2.json?v=1`,framePrefix:`${skill.asset}_`})]));
const cache=new Map();
let generation=0;

// Keep the entire authored frame inside both the tall mobile and shallow
// desktop battlefields without moving the target-foot impact coordinate.
export function fitSignatureScale({x,y,scale,width,height,viewport}){
  if(!viewport||!width||!height)return scale;
  return Math.max(.1,Math.min(scale,(x-24)/(width*.5),(viewport.width-x-24)/(width*.5),(y-36)/(height*.72),(viewport.height-y-24)/(height*.28)));
}

export class ApocalypseSignatureSkillFX{
  static forSkill(code){
    const profile=profiles.get(code);if(!profile)return null;
    return {profile,preload:()=>this.preload(code),create:options=>this.create(code,options)};
  }
  static async preload(code){
    const profile=profiles.get(code);if(!profile)return [];
    const prior=cache.get(code);if(prior?.frames)return prior.frames;if(prior?.loading)return prior.loading;
    const epoch=generation,row={frames:null,failed:false,loading:null};cache.set(code,row);
    row.loading=Assets.load(profile.atlasPath).then(resource=>{
      const frames=Object.entries(resource?.textures||{}).filter(([name])=>name.startsWith(profile.framePrefix)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([,texture])=>texture);
      if(frames.length!==profile.frameCount)throw new Error(`SIGNATURE_ATLAS_FRAME_COUNT:${code}:${frames.length}`);
      if(epoch!==generation||cache.get(code)!==row)return [];
      row.frames=frames;return frames;
    }).catch(error=>{row.failed=true;console.error('[V3 signature skill]',code,error);return []}).finally(()=>{row.loading=null});
    return row.loading;
  }
  static create(code,{x=0,y=0,scale=1,origin=null,reducedMotion=false,viewport=null}={}){
    const spec=profiles.get(code),frames=cache.get(code)?.frames;
    if(!spec||!frames)return new ApocalypseSignatureSkillFX(null,spec);
    const display=new Container();display.label=`V3_APOCALYPSE_SIGNATURE_${code}`;display.eventMode='none';
    display.position.set(x,y);
    const ground=new Graphics().ellipse(0,0,165*scale,36*scale).stroke({width:3,color:spec.color,alpha:.82}).ellipse(0,0,138*scale,29*scale).stroke({width:1,color:spec.color,alpha:.42});
    ground.alpha=0;display.addChild(ground);
    const dragon=new AnimatedSprite({textures:frames,autoUpdate:false});dragon.label=`${code}_AUTHORED_DRAGON`;
    dragon.anchor.set(.5,.72);dragon.loop=false;dragon.eventMode='none';dragon.blendMode='normal';dragon.visible=false;
    const fittedScale=fitSignatureScale({x,y,scale:spec.scale*scale,width:frames[0].width,height:frames[0].height,viewport});
    dragon.scale.set(fittedScale);display.addChild(dragon);
    const trail=new AnimatedSprite({textures:frames,autoUpdate:false});trail.anchor.copyFrom(dragon.anchor);trail.loop=false;trail.eventMode='none';trail.visible=false;trail.scale.copyFrom(dragon.scale);display.addChildAt(trail,1);
    const instance=new ApocalypseSignatureSkillFX(display,spec);
    Object.assign(instance,{dragon,trail,ground,scale,reducedMotion,origin:origin?{x:origin.x-x,y:origin.y-y}:null});
    return instance;
  }
  static async release(){
    generation++;const paths=[...cache.keys()].map(code=>profiles.get(code).atlasPath);cache.clear();
    await Promise.all(paths.map(path=>Assets.unload(path).catch(()=>{})));
  }
  static diagnostics(){return [...profiles].map(([code,spec])=>({code,ready:!!cache.get(code)?.frames,failed:!!cache.get(code)?.failed,frameCount:spec.frameCount,collisionFrame:spec.collisionFrame,impactAtMs:spec.impactAt*1000,renderer:'PixiJS AnimatedSprite + GSAP',proceduralFallback:false}))}
  constructor(display,spec){this.display=display;this.spec=spec;this.released=false}
  attach(layer){if(this.display&&!this.released)layer.addChild(this.display);return this}
  play(timeline,{impactAt=this.spec.impactAt}={}){
    if(!this.display||this.released)return this;
    const {dragon,trail,ground,spec,origin,reducedMotion}=this;
    const cursor={frame:0},preStart=.12,preDuration=impactAt-preStart,postDuration=5/spec.fps;
    const start=spec.trajectory==='CHARGE'&&origin&&!reducedMotion?origin:{x:0,y:reducedMotion?0:55};
    dragon.position.set(start.x,start.y);trail.position.copyFrom(dragon.position);
    const render=()=>{if(this.released)return;const index=Math.min(11,Math.floor(cursor.frame));dragon.gotoAndStop(index);trail.gotoAndStop(Math.max(0,index-1));};
    timeline.to(ground,{alpha:.8,duration:.2},0);
    timeline.fromTo(ground.scale,{x:.4,y:.4},{x:1,y:1,duration:impactAt,ease:'power2.out'},0);
    timeline.call(()=>{if(this.released)return;dragon.visible=true;dragon.alpha=1;trail.visible=!reducedMotion;trail.alpha=.18;render()},[],preStart);
    timeline.to(cursor,{frame:6,duration:preDuration,ease:'none',onUpdate:render},preStart);
    timeline.to(dragon.position,{x:0,y:0,duration:preDuration,ease:spec.trajectory==='CHARGE'?'power3.in':'power2.out'},preStart);
    timeline.to(trail.position,{x:reducedMotion?0:32,y:0,duration:preDuration,ease:'power2.in'},preStart);
    timeline.to(cursor,{frame:11,duration:postDuration,ease:'none',onUpdate:render},impactAt);
    timeline.to(trail,{alpha:0,duration:.06},impactAt);
    timeline.to(ground.scale,{x:1.6,y:1.6,duration:.24,ease:'power2.out'},impactAt);
    timeline.to(ground,{alpha:0,duration:.22},impactAt);
    timeline.to(dragon,{alpha:0,duration:.09},impactAt+postDuration-.05);
    timeline.call(()=>this.release(),[],impactAt+postDuration+.06);
    return this;
  }
  release(){if(this.released)return;this.released=true;if(!this.display)return;this.display.removeFromParent();this.display.destroy({children:true});this.display=null}
}
