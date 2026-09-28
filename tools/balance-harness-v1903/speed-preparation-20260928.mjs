// PREPARATION ONLY. Synthetic matched-power comparisons, no production writes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
import {UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS} from '../../functions/_unique_advancement.js';
import {operatingMercenaries,fixture} from '../../tests/helpers/mercenary-operating-roster-v2144.mjs';

const seeds=Number(process.argv[2]||64);assert.ok(Number.isInteger(seeds)&&seeds>0&&seeds<=500);
const baselineRef='3d9d27829c316fcad2b433137e80838acfccb45f';
const engineUrl=new URL('../../functions/_battle_v2_preview.js',import.meta.url);
const source=execFileSync('git',['show',`${baselineRef}:functions/_battle_v2_preview.js`],{cwd:new URL('../..',import.meta.url),encoding:'utf8',maxBuffer:2e6})
 .replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,left,path,right)=>left+new URL(path,engineUrl).href+right);
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const types={meta:['DEFENSE','DEFENSE','HP','ATTACK','ATTACK'],oneSpeed:['DEFENSE','DEFENSE','HP','ATTACK','SPEED'],variety:['DEFENSE','ATTACK','HP','ATTACK','SPEED'],twoSpeed:['DEFENSE','DEFENSE','HP','SPEED','SPEED']};
const labels={meta:'힐방방공공',oneSpeed:'힐방방공속',variety:'힐방공공속',twoSpeed:'힐방방속속'};
const profiles=[{name:'기본 비교',power:120000,equipment:500000,unique:30,advanced:false},{name:'고전투력·전직 비교',power:20000000,equipment:50000000,unique:100,advanced:true}];
const definitions=Object.values(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS);
const deck=(list,profile)=>list.map((type,index)=>{
 const definition=definitions.find(d=>d.dominantType===type);
 return {id:`card-${index}`,title:`${type}-${index}`,power:profile.power,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][index],breakthroughLevel:profile.advanced?13:0,
  uniqueAbility:{dominantType:type,attackPercent:type==='ATTACK'?profile.unique:0,defensePercent:type==='DEFENSE'?profile.unique:0,hpPercent:type==='HP'?profile.unique:0,speedPercent:type==='SPEED'?profile.unique:0},
  ...(profile.advanced?{uniqueAdvancement:{active:true,classCode:definition.classCode,dominantType:type,modifiers:definition.modifiers,configVersion:'PREPARATION_20260928'}}:{})};
});
const rows=[];
for(const profile of profiles)for(const mercenaryCode of [null,'V-021','V-046']){
 const mercenary=mercenaryCode?operatingMercenaries.find(m=>m.code===mercenaryCode):null;assert.ok(!mercenaryCode||mercenary);
 for(const [composition,list] of Object.entries(types)){
  const wins={before:0,prepared:0},actions={before:0,prepared:0};
  for(let i=0;i<seeds;i++)for(const reverse of [false,true]){
   const seed=20260928+i*7919,ours=deck(list,profile),meta=deck(types.meta,profile),side=reverse?'B':'A';
   const input={attackerCards:reverse?meta:ours,defenderCards:reverse?ours:meta,attackerEquipmentBonus:profile.equipment,defenderEquipmentBonus:profile.equipment,attackerMercenary:mercenary,defenderMercenary:mercenary,seed};
   for(const [label,run] of [['before',before.createPvpBattleV2],['prepared',createPvpBattleV2]]){
    const result=run(input).result;
    wins[label]+=result.winner===side?1:result.winner==='DRAW'?.5:0;actions[label]+=result.actions;
   }
  }
  const games=seeds*2;
  rows.push({profile:profile.name,composition:labels[composition],opponent:labels.meta,mercenary:mercenary?.name||'없음',mercenaryCode,gamesPerVersion:games,beforeWinPercent:Math.round(wins.before/games*1000)/10,preparedWinPercent:Math.round(wins.prepared/games*1000)/10,deltaPoints:Math.round((wins.prepared-wins.before)/games*1000)/10,beforeActions:Math.round(actions.before/games*10)/10,preparedActions:Math.round(actions.prepared/games*10)/10});
 }
}
console.log(JSON.stringify({status:'PREPARED_NOT_DEPLOYED',baselineRef,seedsPerSide:seeds,profiles,mercenaryFixtureCheckedAt:fixture.checkedAt,limitations:'Synthetic equal-power decks; static mercenary fixture and server advancement definitions, not live account pick/win statistics. Matchups are mirrored and only against the reported meta composition.',rows},null,2));
