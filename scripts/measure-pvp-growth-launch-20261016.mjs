import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {mercenaryGrowthLaunchPolicy} from '../shared/mercenary-growth-launch-20261016.mjs';
import {attachMercenaryLevel,mercenaryGrowthLevelTable} from '../shared/mercenary-level-v1.mjs';
import {PVP_POWER_BALANCE,pvpPowerBonuses,PVP_POWER_BALANCE_REVIEW} from '../shared/pvp-power-balance-v1.mjs';
import {growthState,growthLimitedSnapshot} from './measure-mercenary-growth-v2-20261015.mjs';
import {sssReferences} from './measure-ss-limited-balance-20261008.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards,tierDecks} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

const policy=mercenaryGrowthLaunchPolicy(),rows=[];
const levels=[[1,1],[6,1],[11,1],[16,1],[20,1],[20,6],[20,11],[20,20]],ratios=[1,1.25,1.5,2,4],codes=['V-996','V-999','V-988','V-989','V-987'];
const seeds={start:1061601,count:8,step:7919};
// Growth comparison covers the complete matrix. Extra power comparisons focus
// on balanced decks and level 1 / level 20 to separate the two benefits.
for(const regular of sssReferences)for(const code of codes)for(const [level,otherLevel]of levels){
 for(const [deck,types]of Object.entries(tierDecks))for(const ratio of (deck==='balanced'&&otherLevel===1&&[1,20].includes(level)?ratios:[1])){
  const row={code:regular.code,name:regular.name,limited:code,level,limitedLevel:otherLevel,deck,perCardPower:20000000,cardPowerRatio:ratio,wins:0,draws:0,total:0,formationPowerRatio:null,damageBonus:null,tempoBonus:null};
  const own=attachMercenaryLevel(regular,policy,growthState(level)),enemy=attachMercenaryLevel(growthLimitedSnapshot(code),policy,growthState(otherLevel));
  for(const side of ['A','B'])for(let i=0;i<seeds.count;i++){
   const high=tierCards(Math.round(row.perCardPower*ratio),types),low=tierCards(row.perCardPower,types);
   const b=createPvpBattleV2({attackerCards:side==='A'?high:low,defenderCards:side==='B'?high:low,attackerMercenary:side==='A'?own:enemy,defenderMercenary:side==='B'?own:enemy,seed:seeds.start+i*seeds.step});
   row.total++;if(b.result.winner===side)row.wins++;if(!['A','B'].includes(b.result.winner))row.draws++;
   const p=b.result.pvpPowerBalance[side][0];row.formationPowerRatio=p.ratio;row.damageBonus=p.damageMultiplier-1;row.tempoBonus=p.tempoMultiplier-1;
  }
  row.winRate=row.wins/row.total;rows.push(row);
 }
}
const aggregates=levels.map(([level,limitedLevel])=>{const subset=rows.filter(r=>r.level===level&&r.limitedLevel===limitedLevel&&r.cardPowerRatio===1),wins=subset.reduce((n,r)=>n+r.wins,0),total=subset.reduce((n,r)=>n+r.total,0);return {level,limitedLevel,wins,total,winRate:wins/total};});
const report={scope:'FIXED_SYNTHETIC_MATCHUPS_NOT_LIVE_POPULATION_WIN_RATE',generatedAt:new Date().toISOString(),policy,powerPolicy:PVP_POWER_BALANCE,seeds,table:mercenaryGrowthLevelTable(policy.growth),bonuses:[1,1.1,1.25,1.5,2,3,4,10].map(ratio=>pvpPowerBonuses(ratio,1)),total:rows.reduce((n,r)=>n+r.total,0),aggregates,rows,
 sourceHashes:Object.fromEntries(['shared/pvp-power-balance-v1.mjs','shared/mercenary-level-v1.mjs','shared/mercenary-growth-launch-20261016.mjs','shared/mercenary-growth-review-v2.mjs','functions/_battle_v2_preview.js','functions/_mercenary_combat.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))};
const out='docs/qa/pvp-growth-launch-20261016';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,aggregates}));
