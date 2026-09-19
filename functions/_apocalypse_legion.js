import {apocalypseLegionBoss,apocalypseLegionUltimate,APOCALYPSE_MINIONS} from '../shared/apocalypse-legion-v1.mjs';
export const apocalypseSealed=actor=>Number(actor?.apocalypseStatus?.seal?.remaining)>0;
export const apocalypseCursed=actor=>Number(actor?.apocalypseStatus?.curse?.remaining)>0;
export const apocalypseHealing=(target,amount)=>apocalypseCursed(target)?0:amount;
export function clearApocalypseStatus(target){const previous=target.apocalypseStatus||{};target.apocalypseStatus={};return previous;}
export function finishApocalypseAction(actor){
 if(!actor?.apocalypseStatus)return null;
 for(const kind of ['seal','curse'])if(actor.apocalypseStatus[kind]&&--actor.apocalypseStatus[kind].remaining<=0)delete actor.apocalypseStatus[kind];
 return structuredClone(actor.apocalypseStatus);
}
export function buildApocalypseLegion(monster,build){
 const boss=String(monster.pve_difficulty).toUpperCase()==='APOCALYPSE'?apocalypseLegionBoss(monster):null;
 if(!boss)return null;
 const leader=build(monster);leader.monsterId=boss.monsterId;leader.apocalypseBossCode=boss.code;leader.apocalypseSkillsEnabled=monster.pve_apocalypse_skill?.enabled!==false;leader.row='BACK';
 leader.apocalypseUltimate=apocalypseLegionUltimate(boss.monsterId,monster.pve_apocalypse_skill?.ultimate);
 leader.sourceArt=boss.sourceArt;leader.battleSprite=boss.battleSprite;leader.projectVMonsterArt={scope:'BATTLE_ENGINE_ONLY',kind:'MONSTER_SD',name:boss.name,primaryUrl:boss.battleSprite,pngFallbackUrl:boss.battleSprite,isBoss:true,approved:true};
 const minions=Array.from({length:6},(_,index)=>{
  const source=APOCALYPSE_MINIONS[Math.floor(index/2)],slot=index+1;
  const fighter=build({id:source.monsterId,name:source.name,image_url:source.sourceArt||'',battle_power:Math.max(1,Math.round(Number(monster.battle_power)*.08)),is_boss:0,pve_difficulty:'APOCALYPSE',pve_hp_percent:100,pve_attack_percent:100,pve_defense_percent:100,pve_speed_percent:100,pve_shield_percent:0,pve_attack_count:1,pve_forced_action_every:0});
  return {...fighter,id:`B:${slot}:ESCORT:${boss.monsterId}:${index}`,monsterId:source.monsterId,slot,row:'FRONT',sourceArt:source.sourceArt||'',battleSprite:'/'+source.battleSprite,projectVMonsterArt:source.projectVMonsterArt,isApocalypseMinion:true};
 });
 return [leader,...minions];
}
// One approved cast on each of the boss's first three actions. No legacy opening ultimate.
export function castApocalypseAction(actor,targets,{damage,knockout,emit}){
 const boss=actor?.apocalypseSkillsEnabled?apocalypseLegionBoss(actor):null,baseSkill=boss?.skills[actor.actions-1];
 const skill=baseSkill?.kind==='ultimate'?{...baseSkill,...apocalypseLegionUltimate(actor,actor.apocalypseUltimate)}:baseSkill;
 if(!skill||actor.hp<=0)return false;
 if(skill.kind==='ultimate'&&!skill.enabled)return false;
 const living=targets.filter(t=>t.alive&&t.hp>0&&!t.untargetable&&!t.isBattleSuit);
 const selected=skill.targetCount==='ALL'?living:[...living].sort((a,b)=>b.attack-a.attack||a.slot-b.slot).slice(0,skill.targetCount);
 const hits=[];
 for(const target of selected){
  if(skill.kind!=='ultimate'){
   target.apocalypseStatus??={};target.apocalypseStatus[skill.kind]={remaining:skill.statusActions,sourceId:actor.id,skillCode:skill.code};
   hits.push({targetId:target.id,status:skill.kind,remainingActions:skill.statusActions,statuses:structuredClone(target.apocalypseStatus),targetHpAfter:target.hp,targetShieldAfter:target.shield});
  }else{
   const gross=Math.max(0,Math.round(actor.attack*skill.attackPercent/100)),pierce=Math.round(gross*skill.shieldPiercePercent/100);
   const normal=Math.max(0,gross-pierce-Math.round(target.defense*.35));
   const base=damage(target,normal),direct=damage(target,pierce,{ignoreShield:true});
   actor.damageDealt+=base.hpDamage+base.absorbed+direct.hpDamage;
   hits.push({targetId:target.id,damage:base.hpDamage+direct.hpDamage,absorbed:base.absorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield});
  }
 }
 emit('APOCALYPSE_SKILL',{actorId:actor.id,skillCode:skill.code,label:skill.name,kind:skill.kind,...(skill.kind==='ultimate'?{attackPercent:skill.attackPercent,shieldPiercePercent:skill.shieldPiercePercent}:{}),hits});
 for(const target of selected)if(target.hp<=0)knockout(target);
 return true;
}
