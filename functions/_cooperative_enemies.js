import {buildMonsterFighter,publicFighter} from './_battle_v2_preview.js';
import {COOP_ENCOUNTER,COOP_STAGES} from '../shared/cooperative-battleground-v1.mjs';
import {validateCoopRoster,coopSpecies,coopEnemyTraits} from '../shared/cooperative-roster-v3.mjs';
const BASE='/assets/ui/cooperative-arke-v1/';
// A room captures its CMS budgets. Ally HP, shields, cooldowns and surviving units are
// carried by the common reinforcement simulator, never rebuilt between waves.
export function cooperativeEnemies(config,profiles=null,stages=COOP_STAGES,roster=null){
 if(roster)return randomEnemies(config,profiles,stages,validateCoopRoster(roster));
 const specs=[
  {key:'STALKER_A',name:'용철 추적자',wave:1,slot:0,power:.12,hp:100,attack:80,style:'MELEE',sprite:'forge-stalker-v1.png',height:240},
  {key:'STALKER_B',name:'용철 추적자',wave:1,slot:1,power:.12,hp:100,attack:80,style:'MELEE',sprite:'forge-stalker-v1.png',height:240},
  {key:'WATCHER',name:'불씨 감시기',wave:1,slot:2,power:.1,hp:100,attack:70,count:2,style:'RANGED',sprite:'ember-watcher-v1.png',height:220},
  {key:'WARDEN',name:'노심 수문장',wave:2,slot:1,power:.42,hp:240,attack:90,count:2,shield:30,style:'MELEE',sprite:'core-warden-v1.png',height:300,boss:true},
  {key:'ARKE',name:COOP_ENCOUNTER.name,wave:3,slot:1,power:1,hp:config.hpPercent*.76,attack:config.attackPercent,count:config.attackCount,style:'MELEE',sprite:'arke-battle-sprite-v1.png',height:428,boss:true,finalBoss:true}
 ];
 const monsters=specs.map(s=>{const saved=profiles?.find(p=>p.key===s.key);return {id:s.finalBoss?COOP_ENCOUNTER.id:'COOP_'+s.key,name:s.name,isBoss:!!s.boss,
  battle_power:Math.round(config.power*s.power),pve_hp_percent:s.hp,pve_attack_percent:s.attack,pve_defense_percent:config.defensePercent,
  pve_shield_percent:s.shield||0,pve_attack_count:s.count||1,pve_forced_action_every:config.forcedEvery,attackStyle:s.style,
  image:s.finalBoss?COOP_ENCOUNTER.sourceArt:BASE+s.sprite,battleSprite:BASE+s.sprite,
  projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'COOP_'+s.key,primaryUrl:BASE+s.sprite,pngFallbackUrl:BASE+s.sprite,footAnchor:{x:.5,y:s.finalBoss?.94:.9},scaleMultiplier:1,objectFit:'contain',objectPosition:'50% 100%'},
  ...(saved?{battle_power:saved.power,pve_hp_percent:saved.hpPercent,pve_attack_percent:saved.attackPercent,pve_defense_percent:saved.defensePercent,pve_shield_percent:saved.shieldPercent,pve_attack_count:saved.attackCount}:{} )};});
 const fighters=monsters.map((m,i)=>({...buildMonsterFighter(m),id:`B:${specs[i].slot}:COOP:${specs[i].key}`,slot:specs[i].slot,
  encounterWave:specs[i].wave,encounterAfterClear:specs[i].wave>1,finalBoss:!!specs[i].finalBoss,battleSprite:m.battleSprite,
  projectVMonsterArt:m.projectVMonsterArt,displayHeight:specs[i].height}));
 return {monster:monsters.at(-1),initial:fighters.slice(0,3),pending:fighters.slice(3),encounter:{
  schemaVersion:1,stages:stages.map((s,i)=>({...s,target:COOP_STAGES[i].target})),initialIds:fighters.slice(0,3).map(f=>f.id),instances:fighters.map(publicFighter)}};
}

function randomEnemies(config,profiles,stages,roster){
 // CMS slots are stage budgets, independent of the randomly selected species.
 const keys=['STALKER_A','STALKER_B','WATCHER','WARDEN','ARKE'];
 const legacy=cooperativeEnemies(config,profiles,stages);
 const species=[...roster.mobs,roster.elite,roster.boss].map(coopSpecies);
 const instances=species.map((spec,i)=>{
  const wave=i<3?1:i-1,base=legacy.encounter.instances[i],saved=profiles?.find(p=>p.key===keys[i]);
  const power=saved?.power??base.power;
  const monster={id:'COOP_'+spec.id,name:spec.name,isBoss:wave>1,battle_power:power,
   pve_hp_percent:(saved?.hpPercent??[100,100,100,240,config.hpPercent*.76][i])*spec.hp,
   pve_attack_percent:(saved?.attackPercent??[80,80,70,90,config.attackPercent][i])*spec.attack,
   pve_defense_percent:saved?.defensePercent??config.defensePercent,
   pve_shield_percent:(saved?.shieldPercent||0)+spec.shield,
   pve_attack_count:saved?.attackCount??(wave>1?config.attackCount:1),
   pve_forced_action_every:config.forcedEvery,attackStyle:spec.style,image:spec.art,battleSprite:spec.art,
   projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'COOP_'+spec.id,primaryUrl:spec.art,pngFallbackUrl:spec.art,footAnchor:{x:.5,y:.95},scaleMultiplier:1,objectFit:'contain',objectPosition:'50% 100%'}};
  const fighter=buildMonsterFighter(monster);
  return {...fighter,id:`B:${i<3?i:1}:COOP3:${wave}:${spec.id}`,slot:i<3?i:1,
   encounterWave:wave,encounterAfterClear:wave>1,finalBoss:wave===3,battleSprite:spec.art,
   projectVMonsterArt:monster.projectVMonsterArt,displayHeight:wave===2?Math.round(spec.height*.8):spec.height,
   coopSpeciesId:spec.id,coopTraits:coopEnemyTraits(spec,wave,config.id),coopBaseDefense:fighter.defense};
 });
 const boss=species.at(-1);
 return {monster:{id:'COOP_'+boss.id,name:boss.name,isBoss:true,image:boss.art,battleSprite:boss.art,projectVMonsterArt:instances.at(-1).projectVMonsterArt},
  initial:instances.slice(0,3),pending:instances.slice(3),encounter:{schemaVersion:3,roster,
   stages:stages.map((s,i)=>({...s,target:i===0?species.slice(0,3).map(s=>s.name).join(' · '):species[i+2].name,hint:i===0?'서로 다른 몬스터 3종을 격파하세요.':species[i+2].hint})),
   initialIds:instances.slice(0,3).map(f=>f.id),instances:instances.map(publicFighter)}};
}
