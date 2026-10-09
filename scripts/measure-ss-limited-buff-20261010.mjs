import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import fixture from '../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {SS_LIMITED_COMBAT} from '../shared/mercenary-ss-limited-v1.mjs';
import {ssLimitedSnapshot} from './measure-ss-limited-balance-20261008.mjs';
import {measureSSLimitedMatchups} from './measure-ss-limited-matchups-20261010.mjs';
import {measureMercenaryTempo,measureSSLimitedPve} from './measure-ss-limited-tempo-20261009.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

export function measureSSLimitedBuffExtras(){
 const refs=fixture.roster.map(r=>({...r,combat:fixture.combat})),codes=Object.keys(SS_LIMITED_COMBAT),cards=tierCards(2e7);
 const actionComparison=[...codes.map(ssLimitedSnapshot),...refs].flatMap(s=>['PVE','PVP'].map(mode=>measureMercenaryTempo(s,mode)));
 const rows=codes.map(code=>({code,opponents:refs.map(ref=>{
  let wins=0,draws=0,total=0;
  for(const side of ['A','B'])for(const seed of [481781,659987,937711,104729]){
   const result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?ssLimitedSnapshot(code):ref,defenderMercenary:side==='B'?ssLimitedSnapshot(code):ref,seed}).result;
   wins+=Number(result.winner===side);draws+=Number(!['A','B'].includes(result.winner));total++;
  }
  return {code:ref.code,name:ref.name,rank:ref.rank,wins,draws,total,losses:total-wins-draws,winRate:wins/total};
 })}));
 return {actionComparison,rosterComparison:{scope:'ALL_OPERATING_ORDINARY_MERCENARIES_SINGLE_EQUAL_DECK_REFERENCE_ONLY',cmsRevision:fixture.cmsRevision,opponentCount:refs.length,total:codes.length*refs.length*8,rows},pve:measureSSLimitedPve({count:4,start:490001})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const report=measureSSLimitedMatchups({count:Number(value('--count',64)),start:Number(value('--start',470001)),codes:value('--codes',Object.keys(SS_LIMITED_COMBAT).join(',')).split(','),onProgress:r=>console.log(JSON.stringify({code:r.code,total:r.total,rates:r.opponents.map(o=>({code:o.code,rate:o.winRate}))}))});
 if(args.includes('--extra'))Object.assign(report,measureSSLimitedBuffExtras());
 const out=value('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,outside:report.rows.flatMap(r=>r.opponents.filter(o=>!o.withinTarget).map(o=>({code:r.code,opponent:o.code,winRate:o.winRate})))}));
}
