import {buildMonsterFighter,publicFighter} from './_battle_v2_preview.js';
import {COOP_ENCOUNTER,COOP_STAGES} from '../shared/cooperative-battleground-v1.mjs';
const BASE='/assets/ui/cooperative-arke-v1/';
// A room captures its CMS budgets. Ally HP, shields, cooldowns and surviving units are
// carried by the common reinforcement simulator, never rebuilt between waves.
export function cooperativeEnemies(config,profiles=null,stages=COOP_STAGES){
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
