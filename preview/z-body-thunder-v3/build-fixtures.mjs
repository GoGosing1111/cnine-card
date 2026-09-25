import {readFile,writeFile} from 'node:fs/promises';
import {createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {Z_BODY_AREA_REVIEW as REVIEW,Z_BODY_AREA_SKILL as SKILL} from '../../shared/z-body-area-skill.mjs';
const original=JSON.parse(await readFile(new URL('../z-body-live-v1/fixture.json',import.meta.url)));
const catalog=JSON.parse(await readFile(new URL('../../assets/ui/project-v/monsters/hunt-tower/manifest-v1.json',import.meta.url)));
const suit={...original.equippedBattleSuit,skillChips:[]};
const rows=catalog.sprites.filter(row=>row.mode==='HUNT').slice(0,6);
const monsters=rows.map(row=>({id:row.monsterId,name:row.name,image:row.sourceArt,battleSprite:row.battleSprite,battle_power:300000,pve_hp_percent:1200,pve_attack_percent:20,pve_shield_percent:100}));
const result={};
for(const [key,count] of [['single',1],['multi',5]]){
  const encounter={initialCount:count,maxActions:80,maxDuration:1,forcedMonsterEvery:12,instances:monsters.slice(0,count+1).map((monster,i)=>({instanceId:'ZREVIEW-'+monster.id,slot:i%count,monster,afterClear:i===count}))};
  const battle=createPveBattleV2({cards:original.cards,battleSuit:{...suit,weapon:original.equippedWeapon},monster:monsters[0],encounter,seed:2011,[REVIEW]:true});
  const cast=battle.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===SKILL.code);
  if(!cast)throw Error('No authoritative Z skill cast');
  const castEvents=battle.result.timeline.filter(e=>e.castId===cast.castId).map((e,i)=>({...e,seq:i,combatAtMs:e.combatAtMs-cast.combatAtMs,combatGroup:i,combatGroupDurationMs:0}));
  result[key]={...original,mode:'HUNT',accountNickname:'Z-BODY 시각 검수',cards:original.cards,
    continuousEncounter:{initialIds:battle.encounter.initialIds,instances:battle.encounter.instances.map(row=>({...row,name:row.title,displayName:row.title,battleSprite:'/'+rows.find(art=>String(art.monsterId)===String(row.cardId).split(':').at(-1)).battleSprite,boss:false})),total:count},
    battleV2:battle,result:battle.result,equippedBattleSuit:suit,
    characterBonus:{...original.characterBonus,equippedBattleSuit:suit},monster:monsters[0],
    review:{scope:'LOCAL_SERVER_SIMULATION_NO_ACCOUNT_API',note:'Real approved card and monster art. Fixed review stats, not live account data.',castEvents,
      expectedHits:castEvents.filter(e=>e.type==='SKILL_CHIP_HIT').length,expectedDamage:castEvents.reduce((n,e)=>n+(e.type==='SKILL_CHIP_HIT'?e.damage+e.absorbed:0),0)}};
}
await writeFile(new URL('fixtures.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([key,p])=>[key,{hits:p.review.expectedHits,damage:p.review.expectedDamage}]))));
