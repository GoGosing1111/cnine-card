import {AnimatedSprite,Assets,Container} from 'pixi.js';
// Owns no application, ticker or clock. The existing BattleEngine timeline owns playback.
export class ApocalypseLegionFX{
 static cache=new Map();
 static unloading=new Map();
 static skills=new Map();
 static async preload(skill){
  if(this.cache.has(skill.code))return this.cache.get(skill.code);
  this.skills.set(skill.code,skill);
  const pending=Promise.resolve(this.unloading.get(skill.code)).then(()=>Assets.load(skill.atlas)).then(sheet=>{
   const frames=Array.from({length:12},(_,i)=>sheet.textures[`${skill.asset}_${String(i).padStart(2,'0')}`]);
   if(frames.some(f=>!f))throw Error('INCOMPLETE_SKILL_ATLAS:'+skill.code);
   if(this.cache.get(skill.code)!==pending)return null;
   return frames;
  }).catch(error=>{if(this.cache.get(skill.code)===pending)this.cache.delete(skill.code);throw error;});
  this.cache.set(skill.code,pending);return pending;
 }
 static retain(skills=[]){
  const keep=new Set(skills.map(s=>s.code));
  for(const [code,pending] of this.cache){
   if(keep.has(code))continue;
   const skill=this.skills.get(code);this.cache.delete(code);this.skills.delete(code);
   const unloading=pending.catch(()=>null).then(()=>Assets.unload(skill.atlas).catch(()=>{}));
   this.unloading.set(code,unloading);
   void unloading.finally(()=>{if(this.unloading.get(code)===unloading)this.unloading.delete(code);});
  }
 }
 constructor(skill,frames,points,{viewport,reducedMotion=false}={}){
  this.skill=skill;this.cursor={frame:0};this.display=new Container();this.display.label='APOCALYPSE_FX_'+skill.code;this.released=false;this.sprites=[];
  for(const point of points){
   const sprite=new AnimatedSprite({textures:frames,autoUpdate:false});sprite.anchor.set(skill.anchor.x,skill.anchor.y);sprite.loop=false;sprite.eventMode='none';sprite.visible=false;
   const desired=(skill.kind==='ultimate'?520:270)/(frames[0].height||362);
   const edge=16,fit=viewport?Math.max(.08,Math.min(desired,(point.x-edge)/(frames[0].width*.5),(viewport.width-point.x-edge)/(frames[0].width*.5),(point.y-edge)/(frames[0].height*.9),(viewport.height-point.y-edge)/(frames[0].height*.1))):desired;
   sprite.position.set(point.x,point.y);sprite.scale.set(fit);this.display.addChild(sprite);this.sprites.push(sprite);
  }
  this.reducedMotion=reducedMotion;
 }
 attach(layer){layer.addChild(this.display);return this;}
 render(){if(this.released)return;const n=Math.min(11,Math.floor(this.cursor.frame+1e-7));for(const s of this.sprites){s.gotoAndStop(n);s.visible=true;}}
 play(tl,{onImpact=()=>{},onSample=()=>{}}={}){
  const s=this.skill;
  tl.to(this.cursor,{frame:6,duration:s.impactAt,ease:'none',onUpdate:()=>{this.render();onSample(this.cursor.frame);}},0);
  tl.call(onImpact,[],s.impactAt);
  tl.to(this.cursor,{frame:11,duration:s.duration-s.impactAt-.16,ease:'none',onUpdate:()=>{this.render();onSample(this.cursor.frame);}},s.impactAt);
  tl.to(this.display,{alpha:0,duration:.16},s.duration-.16);
  return this;
 }
 release(){if(this.released)return;this.released=true;this.display.removeFromParent();this.display.destroy({children:true});this.sprites=[];}
}
