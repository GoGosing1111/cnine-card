import {readFile,writeFile} from 'node:fs/promises';
import {createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {SX_AREA_SKILL as SKILL} from '../../shared/sx-suit-v1.mjs';
const original=JSON.parse(await readFile(new URL('../z-body-live-v1/fixture.json',import.meta.url)));
const catalog=JSON.parse(await readFile(new URL('../../assets/ui/project-v/monsters/hunt-tower/manifest-v1.json',import.meta.url)));
const suit={...original.equippedBattleSuit,code:'BATTLE_SUIT_SX',name:'SX슈트',image:'/preview/battle-suit-sx-v1/assets/sources/sx-standing-approved-20261007.png',battleSprite:'/preview/battle-suit-sx-v1/assets/sources/sx-standing-approved-20261007.png',skillChips:[]};
const rows=catalog.sprites.filter(row=>row.mode==='HUNT').slice(0,6);
const monsters=rows.map(row=>({id:row.monsterId,name:row.name,image:row.sourceArt,battleSprite:row.battleSprite,battle_power:1500000,pve_hp_percent:1200,pve_attack_percent:20,pve_shield_percent:100}));
const result={};
for(const [key,count] of [['single',1],['multi',5]]){
  const encounter={initialCount:count,maxActions:80,maxDuration:1,forcedMonsterEvery:12,instances:monsters.slice(0,count+1).map((monster,i)=>({instanceId:'SXREVIEW-'+monster.id,slot:i%count,monster,afterClear:i===count}))};
  const battle=createPveBattleV2({cards:original.cards,battleSuit:{...suit,weapon:original.equippedWeapon},monster:monsters[0],encounter,seed:2011});
  const cast=battle.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===SKILL.code);
  if(!cast)throw Error('No authoritative SX skill cast');
  const castEvents=battle.result.timeline.filter(e=>e.castId===cast.castId).map((e,i)=>({...e,seq:i,combatAtMs:e.combatAtMs-cast.combatAtMs,combatGroup:i,combatGroupDurationMs:0}));
  if(castEvents.filter(e=>e.type==='SKILL_CHIP_HIT').length!==count*5)throw Error('SX review must exercise all five authoritative impacts per target: '+JSON.stringify({key,hits:castEvents.filter(e=>e.type==='SKILL_CHIP_HIT').length,lastMs:battle.result.timeline.at(-1).combatAtMs,ko:battle.result.timeline.filter(e=>e.type==='KO').map(e=>({id:e.targetId,ms:e.combatAtMs}))}));
  result[key]={...original,mode:'HUNT',accountNickname:'SX슈트 시각 검수',cards:original.cards,
    continuousEncounter:{initialIds:battle.encounter.initialIds,instances:battle.encounter.instances.map(row=>({...row,name:row.title,displayName:row.title,battleSprite:'/'+rows.find(art=>String(art.monsterId)===String(row.cardId).split(':').at(-1)).battleSprite,boss:false})),total:count},
    battleV2:battle,result:battle.result,equippedBattleSuit:suit,
    characterBonus:{...original.characterBonus,equippedBattleSuit:suit},monster:monsters[0],
    review:{scope:'LOCAL_SERVER_SIMULATION_NO_ACCOUNT_API',note:'Real approved card and monster art. Fixed review stats, not live account data.',castEvents,
      expectedHits:castEvents.filter(e=>e.type==='SKILL_CHIP_HIT').length,expectedDamage:castEvents.reduce((n,e)=>n+(e.type==='SKILL_CHIP_HIT'?e.damage+e.absorbed:0),0)}};
}
await writeFile(new URL('fixtures.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([key,p])=>[key,{hits:p.review.expectedHits,damage:p.review.expectedDamage}]))));
