import {mkdirSync,writeFileSync} from 'node:fs';
import {matchup,tierDecks} from '../tests/helpers/pvp-power-reform-20261015.mjs';
import {PVP_POWER_BALANCE,pvpPowerBonuses} from '../shared/pvp-power-balance-v1.mjs';
const cases=[],pairs=[['V-049','V-049'],['V-055','V-055'],['V-056','V-055'],['V-049','V-996'],['V-055','V-996'],['V-996','V-989']];
let battles=0;
for(const [code,opponent]of pairs)for(const deck of Object.keys(tierDecks))for(const ratio of [1,1.1,1.25,1.5,2,3]){
 const args={code,opponent,deck,enemyDeck:deck,ratio,seeds:16};
 const legacy=matchup({...args,review:false}),bonusOnly=matchup(args);battles+=legacy.battles+bonusOnly.battles;
 cases.push({code,opponent,deck,ratio,legacy,bonusOnly,winRateDelta:bonusOnly.winRate-legacy.winRate});
}
const report={version:PVP_POWER_BALANCE.version,status:'BONUS_ONLY_REVIEW_NOT_RELEASED',supersedes:'pvp-deck-growth-20261015-v1',battles,
 method:'Only damage/tempo bonus differs. Existing mercenary power, links, immunity, action credit and tier rules are retained. Synthetic equal-per-card inputs, four type formations, 16 seeds and both sides per condition. No promise of growth-only limited wins; prepared mercenary levels remain a separate OFF policy.',
 powerPolicy:PVP_POWER_BALANCE,bonuses:[1,1.1,1.25,1.5,2,3].map(ratio=>({ratio,...pvpPowerBonuses(ratio*1e8,1e8)})),cases};
const out='docs/qa/pvp-power-bonus-only-20261015';mkdirSync(out,{recursive:true});writeFileSync(out+'/comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles,conditions:cases.length,bonuses:report.bonuses,balancedExamples:cases.filter(r=>r.deck==='balanced'&&[1,1.25,2].includes(r.ratio))},null,2));
