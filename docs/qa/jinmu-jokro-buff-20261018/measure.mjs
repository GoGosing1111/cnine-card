import fs from 'node:fs';
import assert from 'node:assert/strict';
import fixture from '../../../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../../../shared/mercenary-limited-deployment-v1.mjs';
import {JINMU_COMBAT,JINMU_AREA_SKILL} from '../../../shared/mercenary-jinmu-v1.mjs';
import {JOKRO_COMBAT,JOKRO_AREA_SKILL} from '../../../shared/mercenary-jokro-v1.mjs';
import {KAIRON_COMBAT,KAIRON_AREA_SKILL} from '../../../shared/mercenary-kairon-v1.mjs';
import {createPvpBattleV2,createPveBattleV2} from '../../../functions/_battle_v2_preview.js';
import {tierCards} from '../../../tests/helpers/mercenary-operating-roster-v2144.mjs';

const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const comparisons=[];
for(const [stronger,weaker] of [['V-989','V-988'],['V-979','V-989']]){
 const rows=[];
 for(const power of [2e7,1e9])for(const side of ['A','B']){
  const row={power,side,wins:0,losses:0,draws:0,total:16},cards=tierCards(power);
  for(let i=0;i<row.total;i++){
   const result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(side==='A'?stronger:weaker),defenderMercenary:snapshot(side==='B'?stronger:weaker),seed:(610001+i)*7919}).result;
   if(result.winner===side)row.wins++;else if(['A','B'].includes(result.winner))row.losses++;else row.draws++;
  }
  rows.push(row);
 }
 const wins=rows.reduce((n,r)=>n+r.wins,0),total=rows.reduce((n,r)=>n+r.total,0);
 assert(wins>total/2,`${stronger} should outperform ${weaker} in the fixed equal-deck samples`);
 comparisons.push({stronger,weaker,wins,total,winRate:wins/total,rows});
}
const pve=['V-988','V-989','V-979'].map(code=>{
 const result=createPveBattleV2({cards:tierCards(2e7),mercenary:snapshot(code),monster:{id:1,battle_power:1.6e10},seed:77}).result;
 const event=result.timeline.find(e=>['MERCENARY_KAIRON_AREA','MERCENARY_JINMU_AREA','MERCENARY_JOKRO_AREA'].includes(e.type));
 assert(event,`${code} must cast its PVE area skill`);
 return {code,firstAreaDamage:event.damage,skill:event.type,mercenaryDamage:result.damageBreakdown.mercenary,mercenaryActions:result.mercenaryActions};
});
assert(pve[1].firstAreaDamage>pve[0].firstAreaDamage);
assert(pve[2].firstAreaDamage>pve[1].firstAreaDamage);
const report={dateKST:'2026-10-18',scope:'CANONICAL_SERVER_EQUAL_DECK_SAMPLES_NOT_LIVE_PLAYER_WIN_RATE',policies:{jinmu:JINMU_COMBAT,jokro:JOKRO_COMBAT,kairon:KAIRON_COMBAT},areaSkills:{jinmu:JINMU_AREA_SKILL.balance,jokro:JOKRO_AREA_SKILL.balance,kairon:KAIRON_AREA_SKILL.balance},comparisons,pve,acquisitionChanged:false,speedChanged:false,artChanged:false};
fs.writeFileSync(new URL('./comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({comparisons:comparisons.map(({rows,...r})=>r),pve},null,2));
