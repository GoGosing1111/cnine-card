import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {mercenaryLevelDraft,attachMercenaryLevel} from '../shared/mercenary-level-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {sssReferences} from './measure-ss-limited-balance-20261008.mjs';
import {tierCards,tierDecks} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

export function measureMercenaryLevelCatchup(){
 // Isolated feasibility numbers only. No account, CMS, database or release writes.
 const policy=mercenaryLevelDraft();policy.xpPerCard=Object.fromEntries(Object.keys(policy.xpPerCard).map(rank=>[rank,100]));policy.levels.forEach(row=>row.requiredXp=1000);policy.milestones.forEach(row=>Object.assign(row,{successChancePpm:500000,bonus:{type:'COMBAT_STATS_PERCENT',value:500}}));
 const regular=sssReferences.find(c=>c.code==='V-049'),seeds=Array.from({length:12},(_,i)=>104729+i*7919),rows=[];
 for(const code of ['V-996','V-999'])for(const [regularLevel,mask,limitedLevel,limitedMask]of [[1,0,1,0],[11,3,1,0],[20,15,1,0],[20,15,20,15]]){
  const ordinary=attachMercenaryLevel(regular,policy,{level:regularLevel,experience:0,breakthroughMask:mask,revision:1}),limited=attachMercenaryLevel(limitedDeploymentSnapshot(code),policy,{level:limitedLevel,experience:0,breakthroughMask:limitedMask,revision:1});
  let wins=0,total=0,draws=0;const sides={A:0,B:0};
  for(const power of [180000,1000000])for(const deck of ['balanced','defense'])for(const side of ['A','B'])for(const seed of seeds){
   const cards=tierCards(power,tierDecks[deck]),result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?ordinary:limited,defenderMercenary:side==='B'?ordinary:limited,seed}).result;
   total++;if(result.winner===side){wins++;sides[side]++;}if(!['A','B'].includes(result.winner))draws++;
  }
  rows.push({regular:'V-049',regularLevel,limited:code,limitedLevel,wins,total,draws,winRate:wins/total,winsBySide:sides});
 }
 return {scope:'ISOLATED_PREPARATION_FEASIBILITY_NOT_APPROVED_ECONOMY_OR_LIVE_WIN_RATE',policy,regular:regular.name,seeds,cardPowers:[180000,1000000],decks:['balanced','defense'],releaseEnabled:false,productionPolicyWritten:false,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=measureMercenaryLevelCatchup(),out=process.argv[2];if(out)writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.rows));}
