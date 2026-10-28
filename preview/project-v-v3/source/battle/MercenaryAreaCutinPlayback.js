import {Container,Graphics,Sprite} from 'pixi.js';
import {AREA_CUTIN_PROFILES,AREA_CUTIN_DURATION,resolveAreaCutin,areaCutinBattleKey,claimAreaCutin} from '../../../../shared/mercenary-area-cutins-v1.mjs';
import {JinmuDialogue} from './JinmuDialogue.js';
const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};

// User selected the horizontal face/eye strip only on 2026-10-28. The full
// portrait, name/skill title card and in-canvas dialogue are intentionally absent.
export class MercenaryAreaCutinFX{
 constructor(engine,actor,profile){
  this.engine=engine;this.profile=profile;this.texture=actor.cutInTexture||actor.texture;
  this.clock={time:0};this.released=false;
  this.display=new Container({label:'SSS_AREA_EYE_CUTIN',eventMode:'none',zIndex:10000});
  this.shade=new Graphics();this.eye=new Sprite(this.texture);this.mask=new Graphics();
  this.display.addChild(this.shade,this.eye,this.mask);this.eye.mask=this.mask;
  engine.effectLayer.addChild(this.display);this.render(0);
 }
 render(t){
  if(this.released)return;this.clock.time=t;
  const e=this.engine,w=e.app.screen.width,fullHeight=e.app.screen.height;
  const top=e.formationCoop?0:Math.min(e.dialogueTopInset||0,fullHeight*.65),h=fullHeight-top;
  const origin=e.effectLayer.toLocal({x:0,y:top}),edge=e.effectLayer.toLocal({x:w,y:fullHeight});
  this.display.position.set(origin.x,origin.y);this.display.scale.set((edge.x-origin.x)/w,(edge.y-origin.y)/h);
  const fade=smooth(t/.12)*(1-smooth((t-.88)/.27)),open=smooth(t/.18),band=Math.min(205,Math.max(92,h*.23));
  const mid=h*.40,slope=Math.min(28,h*.04),half=band*.5*(e.reducedMotion?1:open);
  this.display.visible=t<AREA_CUTIN_DURATION;this.display.alpha=fade;
  this.shade.clear().rect(0,0,w,h).fill({color:0x03050a,alpha:.73});
  const scale=Math.max(w*1.1/this.texture.width,band/(this.texture.height*.24));
  this.eye.scale.set(scale);this.eye.x=w*.5-this.texture.width*this.profile.face[0]*scale+(e.reducedMotion?0:(1-open)*w*.08);
  this.eye.y=mid-this.texture.height*this.profile.face[1]*scale;
  this.mask.clear().poly([w*.02,mid-half+slope/2,w*.98,mid-half-slope/2,w*.98,mid+half-slope/2,w*.02,mid+half+slope/2]).fill(0xffffff);
 }
 play(tl){tl.to(this.clock,{time:AREA_CUTIN_DURATION,duration:AREA_CUTIN_DURATION,ease:'none',onUpdate:()=>this.render(this.clock.time)},0);}
 release(){if(this.released)return;this.released=true;this.display.removeFromParent();this.display.destroy({children:true});}
}

function stateFor(engine){
 const key=areaCutinBattleKey(engine.battleData);
 let state=engine.mercenaryAreaPresentation;
 if(!state||state.key!==key){
  if(state)for(const entry of state.actors.values())entry.dialogue.destroy();
  state=engine.mercenaryAreaPresentation={key,shown:new Set(),actors:new Map(),tail:Promise.resolve()};
 }
 return state;
}
export function prepareMercenaryAreaPresentation(engine,actor){
 const profile=AREA_CUTIN_PROFILES.find(p=>p.code===actor?.cardId);if(!profile)return null;
 const state=stateFor(engine);let entry=state.actors.get(actor);
 if(!entry){entry={profile,dialogue:new JinmuDialogue(engine,profile.dialogue)};state.actors.set(actor,entry);}
 return entry;
}
export function cancelMercenaryAreaPresentation(engine){
 engine.activeMercenaryAreaCutin?.release();engine.activeMercenaryAreaCutin=null;
 for(const entry of engine.mercenaryAreaPresentation?.actors.values()||[])entry.dialogue.end();
}
export function clearMercenaryAreaPresentation(engine){
 cancelMercenaryAreaPresentation(engine);
 for(const entry of engine.mercenaryAreaPresentation?.actors.values()||[])entry.dialogue.destroy();
 engine.mercenaryAreaPresentation?.actors.clear();
}
export async function withMercenaryAreaPresentation(engine,event,actor,play){
 const selection=resolveAreaCutin(event,actor);
 const targets=event.hits?.map(h=>engine.combatantById(h.targetId)).filter(t=>t&&!t.root.destroyed&&t.team!==actor?.team)||[];
 if(!selection||!targets.length)return play();
 const state=stateFor(engine),entry=prepareMercenaryAreaPresentation(engine,actor);
 const epoch=engine.playbackEpoch,mercenaryEpoch=engine.mercenaryEpoch;
 const valid=()=>!engine.disposed&&!engine.mercenaryDisposed&&engine.playbackEpoch===epoch&&engine.mercenaryEpoch===mercenaryEpoch&&state.key===areaCutinBattleKey(engine.battleData)&&!actor.root.destroyed;
 const first=claimAreaCutin(state,actor);let continued=true;
 try{
  if(first&&engine.visible){
   // Serialize only brief cut-ins if different owners cast simultaneously.
   // Each actor still delegates one original server event to its own playback.
   const run=state.tail.then(async()=>{
    if(!valid()||!engine.visible)return false;
    entry.dialogue.begin(selection.skill.line,selection.skill.name);
    const texture=actor.cutInTexture||actor.texture;
    if(!texture||texture.destroyed||texture.width<=1)return true;
    let fx;
    try{
     fx=new MercenaryAreaCutinFX(engine,actor,selection.profile);engine.activeMercenaryAreaCutin=fx;
     engine.lastMercenaryAreaCutin={code:actor.cardId,actorId:actor.id,skillId:selection.skill.id,count:1,damageApplications:0,status:'PLAYING'};
     const result=await engine.timeline(tl=>fx.play(tl),()=>{fx.release();if(engine.activeMercenaryAreaCutin===fx)engine.activeMercenaryAreaCutin=null;},1);
     engine.lastMercenaryAreaCutin.status=result?'COMPLETE':'CANCELLED';return result;
    }catch(error){fx?.release();if(engine.activeMercenaryAreaCutin===fx)engine.activeMercenaryAreaCutin=null;console.warn('[SSS cut-in] Optional visual skipped',error);return true;}
   });
   state.tail=run.catch(()=>false);continued=await run;
  }else entry.dialogue.begin(selection.skill.line,selection.skill.name);
  if(!continued||!valid())return false;
  return await play();
 }finally{entry.dialogue.end();}
}
