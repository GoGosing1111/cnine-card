import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {candidate} from './measure-berkan-balance.mjs';
import {tierCards,tierDecks,fixture} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {BERKAN_PVP_BASIC_DAMAGE_SCALE,BERKAN_TEMPO,BERKAN_BALANCE,BERKAN_CAP_SCALE} from '../shared/mercenary-berkan-v1.mjs';

// Equal ordinary decks, independent starting-side swaps and fixed RNG input.
// This reports controlled engine comparisons, not live-account win rates.
export function measureBerkanPvpDamage({count=2048,start=10001,powers=[1e6,2e7,1e8,2e9],decks=tierDecks,onProgress=()=>{}}={}){
 const rows=[],groups=[],berkan=candidate('V-055');
 for(const code of ['V-049','V-046']){
  const opponent=candidate(code);let wins=0,total=0,draws=0;const sides={A:{wins:0,total:0},B:{wins:0,total:0}};
  for(const power of powers)for(const [deck,types]of Object.entries(decks)){
   let groupWins=0,groupDraws=0;
   for(const side of ['A','B'])for(let i=start;i<start+count;i++){
    const cards=tierCards(power,types),battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?berkan:opponent,defenderMercenary:side==='B'?berkan:opponent,seed:i*7919,singleHealerBonus:fixture.singleHealerBonus});
    const won=battle.result.winner===side,draw=!['A','B'].includes(battle.result.winner);
    wins+=Number(won);groupWins+=Number(won);total++;draws+=Number(draw);groupDraws+=Number(draw);sides[side].wins+=Number(won);sides[side].total++;
   }
   rows.push({opponent:code,power,deck,wins:groupWins,draws:groupDraws,total:count*2,winRate:groupWins/(count*2)});
  }
  const group={opponent:code,name:opponent.name,total,wins,draws,winRate:wins/total,sides};groups.push(group);onProgress(group);
 }
 return {date:'2026-09-30',scope:'CANONICAL_EQUAL_DECK_BOTH_SIDES_NOT_LIVE_WINRATE',count,start,seedMultiplier:7919,powers,decks,policy:{pvpBasicDamageScale:BERKAN_PVP_BASIC_DAMAGE_SCALE,tempo:BERKAN_TEMPO,skill:BERKAN_BALANCE,skillCap:BERKAN_CAP_SCALE},groups,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const report=measureBerkanPvpDamage({count:Number(value('--count',2048)),start:Number(value('--start',10001)),onProgress:group=>console.log(JSON.stringify(group))});
 const output=value('--out',null);if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({policy:report.policy,total:report.groups.reduce((sum,g)=>sum+g.total,0)}));
}
