import fixture from '../fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {battleConfig} from '../../functions/_mercenary_account.js';
import {limitedDeploymentSnapshot} from '../../shared/mercenary-limited-deployment-v1.mjs';
import {PVP_POWER_BALANCE_REVIEW} from '../../shared/pvp-power-balance-v1.mjs';
import {createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
import {tierCards,tierDecks} from './mercenary-operating-roster-v2144.mjs';
export {tierCards,tierDecks,PVP_POWER_BALANCE_REVIEW};
export const reviewOptions=Object.freeze({[PVP_POWER_BALANCE_REVIEW]:true});
export const snapshot=code=>code?{...(limitedDeploymentSnapshot(code)||fixture.roster.find(c=>c.code===code)||battleConfig(MERCENARY_CMS_SEED.document,code,1)),combat:fixture.combat}:null;
export function matchup({code='V-049',opponent='V-996',ratio=1,power=2e7,deck='balanced',enemyDeck='balanced',seeds=32,review=true}={}){
 let wins=0,draws=0,regularActions=0,mercenaryActions=0,totalDamage=0;
 for(const side of ['A','B'])for(let n=1;n<=seeds;n++){
  const high=tierCards(Math.round(power*ratio),tierDecks[deck]),low=tierCards(power,tierDecks[enemyDeck]);
  const battle=createPvpBattleV2({attackerCards:side==='A'?high:low,defenderCards:side==='A'?low:high,
   attackerMercenary:snapshot(side==='A'?code:opponent),defenderMercenary:snapshot(side==='A'?opponent:code),
   seed:n*7919,...(review?reviewOptions:{})});
  wins+=battle.result.winner===side;draws+=battle.result.winner==='DRAW';
  const rows=battle.result.timeline.filter(e=>e.actorId?.startsWith(side+':'));
  regularActions+=rows.filter(e=>e.type==='TURN'&&!e.actorId.includes(':MERCENARY:')).length;
  mercenaryActions+=rows.filter(e=>e.type==='TURN'&&e.actorId.includes(':MERCENARY:')).length;
  totalDamage+=rows.reduce((sum,e)=>sum+(e.impacts||[e]).reduce((s,hit)=>s+Math.max(0,Number(hit.damage)||0)+Math.max(0,Number(hit.absorbed)||0),0),0);
 }
 return {code,opponent,ratio,power,deck,enemyDeck,review,wins,draws,battles:seeds*2,winRate:wins/(seeds*2),regularBasicActions:regularActions/(seeds*2),mercenaryBasicActions:mercenaryActions/(seeds*2),totalDamage:totalDamage/(seeds*2)};
}
