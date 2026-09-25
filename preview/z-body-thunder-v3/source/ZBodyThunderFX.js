import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import assets from '../assets.json' with {type:'json'};
import {Z_SWORD,swordPose} from '../../project-v-v3/source/battle/ZBodySwordModel.mjs';
import {Z_BODY_AREA_SKILL as SKILL} from '../../../shared/z-body-area-skill.mjs';

export const THUNDER_FRAMES=Object.freeze({
  blade:Object.freeze([70,70,70,90,60,80,100,120,150,180,220,300]),
  ground:Object.freeze([110,110,120,65,85,100,140,180,210,240,260,280])
});
export const THUNDER_CONTACT=Object.freeze({blade:300,ground:340});
export function thunderFrame(key,age){
  if(age<0)return null;
  const times=THUNDER_FRAMES[key];let at=0,index=0;
  while(index<times.length&&age>=at+times[index])at+=times[index++];
  if(index===times.length)return null;
  const blend=Math.max(0,Math.min(1,((age-at)/times[index]-.72)/.28));
  return {index,next:Math.min(index+1,times.length-1),blend};
}
// Samples the existing GSAP battle clock. No ticker, autonomous tween, damage
// calculation or timer exists in this renderer.
export class ZBodyThunderFX{
  static async preload(){
    const textures={};
    for(const [key,spec] of Object.entries(assets.atlases)){
      const sheet=await Assets.load(spec.url);
      textures[key]=spec.frames.map((_,i)=>new Texture({source:sheet.source,frame:new Rectangle(i%4*spec.frameWidth,Math.floor(i/4)*spec.frameHeight,spec.frameWidth,spec.frameHeight)}));
    }
    return textures;
  }
  constructor(engine,textures,event,hits){
    Object.assign(this,{engine,textures,event,hits,clock:{time:0},key:SKILL.effectKey,destroyed:false});
    this.sequence={duration:SKILL.effectDurationMs/1000,life:1.6,impacts:SKILL.impactOffsetsMs.map(ms=>ms/1000)};
    this.targets=(event.targetIds||[event.targetId]).map(id=>({id,actor:engine.combatantById(id)})).filter(t=>t.actor?.root&&t.actor.id===t.id&&t.actor.root.visible!==false&&t.actor.battleActive!==false);
    this.points=this.targets.map(({actor})=>({x:actor.root.x,y:actor.root.y}));
    this.confirmed=new Map();this.scheduled=new Map();
    this.ground=new Container({label:'ZThunderAuthoredGroundV3'});
    this.front=new Container({label:'ZThunderAuthoredBladesV3'});
    engine.backgroundLayer.addChild(this.ground);engine.effectLayer.addChild(this.front);
    const pair=(key,parent)=>[0,1].map(()=>{
      const spec=assets.atlases[key],sprite=new Sprite(textures[key][0]);
      sprite.anchor.set(spec.pivot.x/spec.frameWidth,spec.pivot.y/spec.frameHeight);
      sprite.visible=false;parent.addChild(sprite);return sprite;
    });
    this.field=pair('ground',this.ground);
    this.blades=Array.from({length:5},()=>pair('blade',this.front));
    this.sword=engine.accountBattleUnit?.swordAnimation;
    this.done=new Promise(resolve=>{this.release=resolve;});
    if(this.sword){this.sword.cancel();this.sword.unit.stopIdle();this.sword.externalCast=this;this.sword.mode='area';}
    this.render(0);
  }
  scheduleImpact(index,time){if(!this.confirmed.has(index))this.scheduled.set(index,time);}
  confirmImpact(index,time,event){
    const target=this.targets.find(row=>row.id===event?.targetId);
    if(!target||target.actor.id!==target.id||target.actor.root.visible===false)return false;
    if(!this.confirmed.has(index))this.confirmed.set(index,time);
    return true;
  }
  paint(pair,key,age,point,scale){
    const frame=thunderFrame(key,age);
    pair.forEach((sprite,i)=>{
      sprite.visible=Boolean(frame);if(!frame)return;
      sprite.texture=this.textures[key][i?frame.next:frame.index];
      sprite.position.set(point.x,point.y);sprite.scale.set(scale);
      sprite.alpha=i?frame.blend:1-frame.blend;
    });
  }
  age(index,key,time){
    const contact=THUNDER_CONTACT[key],confirmed=this.confirmed.get(index);
    if(confirmed!==undefined)return contact+(time-confirmed)*1000;
    const planned=this.scheduled.get(index)??this.sequence.impacts[index];
    // No explosion before the server confirms contact, including delayed waves.
    return Math.min(contact-.01,(time-planned)*1000+contact);
  }
  render(time){
    if(this.destroyed||!this.points.length)return;
    this.clock.time=time;
    const center={x:this.points.reduce((s,p)=>s+p.x,0)/this.points.length,y:this.points.reduce((s,p)=>s+p.y,0)/this.points.length};
    const offsets=[[-120,-45],[115,-25],[0,0],[-95,85],[110,70]];
    this.points.forEach((p,i)=>{
      if(!this.confirmed.size){
        const t=this.targets[i];if(t.actor.id===t.id&&t.actor.root.visible!==false){p.x=t.actor.root.x;p.y=t.actor.root.y;}
      }
    });
    this.paint(this.field,'ground',this.age(0,'ground',time),center,this.points.length>1?1.6:1.15);
    this.blades.forEach((pair,index)=>{
      const point=this.points.length===1?{x:center.x+offsets[index][0],y:center.y+offsets[index][1]}:this.points[index%this.points.length];
      const valid=this.targets.some(t=>t.actor.id===t.id&&t.actor.root.visible!==false);
      const confirmed=this.confirmed.has(index);
      if(!valid&&!confirmed){pair.forEach(s=>{s.visible=false;});return;}
      this.paint(pair,'blade',this.age(index,'blade',time),point,[.78,.72,.92,.78,.84][index]);
    });
    if(this.sword?.externalCast===this){
      this.sword.pose(swordPose(Z_SWORD.cast.sequence,time*1000).frame);
      this.sword.timeMs=time*1000;
      if(time>=2.9)this.releaseBody();
    }
  }
  releaseBody(){
    if(this.sword?.externalCast===this){this.sword.externalCast=null;this.sword.mode='ready';this.sword.pose('01');this.sword.timeMs=0;}
    this.release?.();this.release=null;
  }
  diagnostics(){return {version:assets.version,authoredFrames:24,confirmedImpacts:[...this.confirmed.keys()],timeMs:Math.round(this.clock.time*1000),targets:this.targets.map(t=>t.id),destroyed:this.destroyed};}
  destroy(){
    if(this.destroyed)return;this.destroyed=true;this.releaseBody();
    this.ground.destroy({children:true});this.front.destroy({children:true});
    // Shared atlas frame textures belong to the preview registry.
  }
}
