import {mkdirSync,writeFileSync} from 'node:fs';
import {matchup,tierDecks} from '../tests/helpers/pvp-power-reform-20261015.mjs';
import {PVP_POWER_BALANCE,pvpPowerBonuses} from '../shared/pvp-power-balance-v1.mjs';
import {MERCENARY_PVP_BALANCE} from '../shared/mercenary-pvp-balance-v1.mjs';

const growth=[],composition=[],limited=[],baseline=[],problems=[],growthDips=[],followups=[];
const pairs=[['V-049','V-049'],['V-055','V-055'],['V-056','V-055'],['V-049','V-996'],['V-055','V-996'],['V-056','V-989'],['V-049','V-990'],['V-055','V-992']];
let battles=0;
const run=options=>{const row=matchup(options);battles+=row.battles;return row;};
for(const [code,opponent] of pairs)for(const deck of Object.keys(tierDecks)){
 let previous=null;
 for(const ratio of [1,1.05,1.1,1.25,1.5,2]){
  const row=run({code,opponent,deck,enemyDeck:deck,ratio,seeds:32});growth.push(row);
  if(previous&&row.winRate<previous.winRate)growthDips.push({kind:'growth-win-dip',before:previous,after:row});
  previous=row;
 }
}
for(const [code,opponent] of [['V-049','V-996'],['V-055','V-996'],['V-056','V-989'],['V-996','V-996'],['V-990','V-055']])
 for(const ratio of [.9,1,1.1])for(const deck of Object.keys(tierDecks))for(const enemyDeck of Object.keys(tierDecks))
  composition.push(run({code,opponent,ratio,deck,enemyDeck,seeds:24}));
for(const code of ['V-990','V-991','V-992','V-993','V-994','V-997','V-998','V-996','V-999','V-989','V-988','V-987'])
 for(const opponent of ['V-046','V-049','V-055','V-056'])for(const deck of Object.keys(tierDecks))
  limited.push(run({code,opponent,deck,enemyDeck:deck,seeds:16}));
for(const power of [10000,2000000000])for(const [code,opponent] of [['V-049','V-996'],['V-055','V-996'],['V-056','V-989']]){
 let previous=null;
 for(const ratio of [1,1.1,1.25,1.5,2]){
  const row=run({code,opponent,power,ratio,seeds:32});growth.push(row);
  if(previous&&row.winRate<previous.winRate)growthDips.push({kind:'growth-scale-dip',before:previous,after:row});
  previous=row;
 }
}
for(const code of ['V-049','V-055'])for(const ratio of [1,1.25,1.5,2,3,5,10])baseline.push(run({code,ratio,seeds:16,review:false}));
// Record every observed dip rather than concealing small ones behind a tolerance.
// Combat ordering can change after growth. Recheck both ratios with 1,024
// battles each; a decline above 5 percentage points remains a blocking result.
for(const dip of growthDips){
 const before=run({...dip.before,seeds:512}),after=run({...dip.after,seeds:512});
 const check={kind:dip.kind,before,after,delta:after.winRate-before.winRate};followups.push(check);
 if(check.delta<-.05)problems.push(check);
}
const aggregate=rows=>({battles:rows.reduce((n,r)=>n+r.battles,0),wins:rows.reduce((n,r)=>n+r.wins,0),winRate:rows.reduce((n,r)=>n+r.wins,0)/rows.reduce((n,r)=>n+r.battles,0)});
const limitedSummary=[...new Set(limited.map(r=>r.code))].map(code=>({code,...aggregate(limited.filter(r=>r.code===code))}));
const upsets=composition.filter(r=>r.ratio<1&&r.wins>0).sort((a,b)=>b.winRate-a.winRate);
const report={version:PVP_POWER_BALANCE.version,status:'REVIEW_ONLY_NOT_RELEASED',powerPolicy:PVP_POWER_BALANCE,mercenaryPolicy:MERCENARY_PVP_BALANCE,
 method:'Server engine; synthetic fixed equal-per-card powers; four card-type formations; fixed seed range n*7919; both A/B sides. Not live-account win rates or exhaustive proofs.',
 battles,bonuses:[1,1.1,1.25,1.5,2,3].map(r=>({ratio:r,...pvpPowerBonuses(r*1e8,1e8)})),problems,growthDips,followups,limitedSummary,upsets:upsets.slice(0,12),growth,composition,limited,baseline};
mkdirSync('docs/qa/pvp-power-reform-20261015',{recursive:true});
writeFileSync('docs/qa/pvp-power-reform-20261015/comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles,problems,followups,limitedSummary,upsetCases:upsets.length,topUpsets:report.upsets.slice(0,4)},null,2));
if(problems.length)process.exitCode=1;
