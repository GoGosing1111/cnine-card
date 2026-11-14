import {Assets,Container,Sprite,Text,Texture,Rectangle} from 'pixi.js';
import {petTraitVisual} from '../../../../shared/pet-trait-visuals-v2.mjs';
export async function preparePetTraitFrames(traitId){
 const visual=petTraitVisual(traitId);if(!visual)throw new Error('Unknown pet trait');
 const atlas=await Assets.load(visual.atlas),width=atlas.width/visual.columns,height=atlas.height/visual.rows;
 const frames=Array.from({length:visual.frames},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%visual.columns*width,Math.floor(i/visual.columns)*height,width,height)}));
 return {visual,frames,dispose(){for(const frame of frames)frame.destroy(false);}};
}
// Sprite images only. The host V3 clock owns playback, speed, pause and cancellation.
export function playPetTraitOpeningFX(engine,row,event,{restored=false}={}){
 const trait=event.petTrait,resource=row.traitResource;
 if(!trait?.active||!resource||resource.visual.id!==trait.id||!engine.effectLayer)return false;
 const key=event.eventKey;if(typeof key!=='string'||!key)return false;
 row.traitEventKeys??=new Set();if(row.traitEventKeys.has(key))return false;
 row.traitEventKeys.add(key);if(restored)return true;
 row.traitCleanup?.();
 const root=new Container({label:'PET_TRAIT_'+trait.id,eventMode:'none'});root.zIndex=43;engine.effectLayer.addChild(root);
 const targets=(trait.targetIds||[]).map(id=>engine.combatantById(id)).filter(a=>a?.root&&!a.root.destroyed);
 const make=(size)=>{const sprite=new Sprite(resource.frames[0]);sprite.anchor.set(.5);sprite.width=sprite.height=size;root.addChild(sprite);return sprite;};
 const source=make(132),copies=targets.map(target=>({target,sprite:make(trait.grade==='SSS'?190:154)}));
 const label=new Text({text:trait.name+' '+trait.grade,style:{fontFamily:'PetSans, sans-serif',fontSize:20,fontWeight:'800',fill:0xf4f7ed,stroke:{color:0x0a1424,width:4}}});label.anchor.set(.5,1);root.addChild(label);
 const duration=engine.reducedMotion?.value??engine.reducedMotion?0.8:resource.visual.durationMs/1000,progress={t:0};
 const clamp=n=>Math.max(0,Math.min(1,n));
 const sample=(sprite,p)=>{sprite.texture=resource.frames[Math.min(resource.frames.length-1,Math.floor(clamp(p)*resource.frames.length))];sprite.alpha=clamp(p*10)*clamp((1-p)*6);};
 const update=()=>{
  if(root.destroyed||row.root.destroyed)return;
  engine.onPetTraitFrame?.();
  const p=progress.t/duration,origin=engine.effectLayer.toLocal(row.sprite.toGlobal({x:0,y:-row.sprite.texture.height*.5}));
  source.position.copyFrom(origin);sample(source,p/.8);label.position.set(origin.x,origin.y-74);label.alpha=clamp(p*8)*clamp((1-p)*5);
  for(const item of copies){if(item.target.root.destroyed){item.sprite.visible=false;continue;}const point=engine.effectLayer.toLocal(item.target.root.toGlobal({x:0,y:-Math.max(80,item.target.fullBodyHeight||130)*.45}));item.sprite.position.copyFrom(point);sample(item.sprite,(p-.18)/.82);}
 };
 const cleanup=()=>{if(!root.destroyed)root.destroy({children:true});if(row.traitCleanup===cleanup)row.traitCleanup=null;};
 row.traitCleanup=cleanup;
 void engine.timeline(t=>t.to(progress,{t:duration,duration,ease:'none',onUpdate:update}),cleanup,1);
 update();return true;
}
