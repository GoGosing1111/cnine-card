import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
import {PVP_SPEED_REFORM} from '../../shared/pvp-speed-reform-v1.mjs';
import {operatingMercenaries,fixture} from '../../tests/helpers/mercenary-operating-roster-v2144.mjs';
const count=Number(process.argv[2]||64);assert.ok(count>0&&count<=500);
const baseline='aef4d6ab',engine=new URL('../../functions/_battle_v2_preview.js',import.meta.url);
const source=execFileSync('git',['show',baseline+':functions/_battle_v2_preview.js'],{encoding:'utf8',maxBuffer:2e6})
  .replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,p,b)=>a+new URL(p,engine).href+b);
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// SUPERSTAR battle power follows max(FUR, ZENITH) + 10,000, not its CMS base.
const profiles=[{name:'기본 카드',ss:15500,fur:3200,zen:5500,boost:1,furBoost:1,equipment:100000},
  {name:'고급 강화 비교',ss:93200,fur:83200,zen:75625,boost:1.6,furBoost:2,equipment:500000},
  {name:'높은 장비 전력',ss:93200,fur:83200,zen:75625,boost:1.6,furBoost:2,equipment:50000000}];
const effects={SON:{attackPercent:30,defensePercent:30,speedPercent:50,hpPercent:0,dominantType:'SPEED'},
  CR7:{attackPercent:50,defensePercent:30,speedPercent:30,hpPercent:0,dominantType:'ATTACK'}};
const card=(id,power,type,boost,grade)=>{const e={attackPercent:0,defensePercent:0,hpPercent:0,speedPercent:0,dominantType:type};e[{ATTACK:'attackPercent',DEFENSE:'defensePercent',HP:'hpPercent',SPEED:'speedPercent'}[type]]=50*boost;
 return {id,title:id,rarity:grade,power:Math.round(power*(1+e.attackPercent/100)),baseBattlePower:power,uniqueAbility:e};};
function deck(p,name,types=['DEFENSE','DEFENSE','HP','ATTACK']){
  const e=Object.fromEntries(Object.entries(effects[name]).map(([k,v])=>[k,typeof v==='number'?v*p.boost:v]));
  return [...types.map((type,i)=>card('core-'+i,i<2?p.fur:p.zen,type,i<2?p.furBoost:p.boost,i<2?'FUR':'ZENITH')),
    {id:name,title:name,rarity:'SUPERSTAR',power:Math.round(p.ss*(1+e.attackPercent/100)),baseBattlePower:p.ss,uniqueAbility:e}];
}
const mercenaries=[null,operatingMercenaries.find(m=>m.rank==='SS'),operatingMercenaries.find(m=>m.code==='V-021'),operatingMercenaries.find(m=>m.code==='V-046')];
assert.ok(mercenaries.slice(1).every(Boolean));
const rows=[];
const seedBase=Number(process.argv[4]||20261010);
for(const p of profiles)for(const mercenary of mercenaries){
  const scores={before:0,after:0},actions={before:0,after:0};
  for(let i=0;i<count;i++)for(const reverse of [false,true]){
    const ours=deck(p,'SON'),opponent=deck(p,'CR7'),side=reverse?'B':'A';
    const args={attackerCards:reverse?opponent:ours,defenderCards:reverse?ours:opponent,
      attackerEquipmentBonus:p.equipment,defenderEquipmentBonus:p.equipment,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:seedBase+i*7919};
    for(const [label,fn] of [['before',before.createPvpBattleV2],['after',createPvpBattleV2]]){
      const result=fn(args).result;scores[label]+=result.winner===side?1:result.winner==='DRAW'?.5:0;actions[label]+=result.actions;
    }
  }
  rows.push({profile:p.name,mercenary:mercenary?.name||'없음',rank:mercenary?.rank||null,games:count*2,
    beforeWinPercent:Math.round(scores.before/count/2*1000)/10,afterWinPercent:Math.round(scores.after/count/2*1000)/10,
    beforeActions:Math.round(actions.before/count/2*10)/10,afterActions:Math.round(actions.after/count/2*10)/10});
}
const report={baseline,seedBase,config:PVP_SPEED_REFORM,profiles,cardValuesCheckedAt:'2026-09-30T08:07:35.542Z',mercenaryFixture:fixture.checkedAt,
  limitations:'Synthetic equal-investment decks using checked Son/CR7 unique effects. Other cards, equipment and mercenary fixtures are controlled scenarios, not account-wide pick/win statistics. No SUPERSTAR advancement. Both sides reversed.',rows};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
