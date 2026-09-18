import {Text} from 'pixi.js';
import {apocalypseLegionSkill} from '../../../../shared/apocalypse-legion-v1.mjs';
import {ApocalypseLegionFX} from './ApocalypseLegionFX.js';
export function showApocalypseStatus(engine,event){
 const target=engine.combatantById(event.targetId);if(!target)return;
 const text=[event.statuses?.seal?.remaining>0?`봉인 ${event.statuses.seal.remaining}`:'',event.statuses?.curse?.remaining>0?`회복 불가 ${event.statuses.curse.remaining}`:''].filter(Boolean).join(' · ');
 if(!target.apocalypseStatusLabel){target.apocalypseStatusLabel=new Text({text:'',style:{fontFamily:'sans-serif',fontSize:20,fontWeight:'700',fill:0xffb2c4,stroke:{color:0x060813,width:4}}});target.apocalypseStatusLabel.anchor.set(.5,0);target.apocalypseStatusLabel.position.set(110,90);target.hud.addChild(target.apocalypseStatusLabel);}
 target.apocalypseStatusLabel.text=text;target.apocalypseStatusLabel.visible=Boolean(text);
}
export async function playApocalypseLegionSkill(engine,event){
 const skill=apocalypseLegionSkill(event.skillCode);if(!skill)return false;
 const session=engine.battleData,epoch=engine.playbackEpoch,hits=event.hits||[],targets=hits.map(hit=>engine.combatantById(hit.targetId)).filter(Boolean);
 if(!targets.length)return false;
 const apply=()=>{for(const hit of hits){const t=engine.combatantById(hit.targetId);if(!t)continue;if(hit.statuses)showApocalypseStatus(engine,{targetId:hit.targetId,statuses:hit.statuses});if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(t,engine.eventHpPercent(t,hit.targetHpAfter));if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(t,hit.targetShieldAfter);if(hit.damage>0)engine.showAccountBattleUnitDamage(t,{damage:hit.damage+Number(hit.absorbed||0),critical:false,playbackRate:engine.paceScale||1});}};
 let timer;const frames=await Promise.race([ApocalypseLegionFX.preload(skill).catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1800);})]);clearTimeout(timer);
 if(engine.battleData!==session||engine.playbackEpoch!==epoch||engine.disposed)return false;
 engine.queueBanner(skill.name,skill.kind==='curse'?0xd79cff:0xff809a,'아포칼립스');
 if(!frames){apply();return true;}
 const points=skill.kind==='ultimate'?[{x:targets.reduce((n,t)=>n+t.root.x,0)/targets.length,y:targets.reduce((n,t)=>n+t.root.y,0)/targets.length}]:targets.map(t=>({x:t.root.x,y:t.root.y}));
 const fx=new ApocalypseLegionFX(skill,frames,points,{viewport:engine.scene,reducedMotion:engine.reducedMotion}).attach(engine.effectLayer);
 await engine.timeline(tl=>fx.play(tl,{onImpact:apply}),()=>fx.release(),null,{releaseAt:skill.impactAt});return true;
}
