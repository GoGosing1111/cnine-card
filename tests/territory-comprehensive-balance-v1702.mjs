import assert from 'node:assert/strict';
import {balancedSideAssignments,buildFormationSnapshot,magicFormationPercent} from '../functions/_territory_war.js';

const magicCards=[{effectType:'OPENING_ATTACK',effectValue:20,triggerChance:50,maxActivations:1}];
assert.equal(magicFormationPercent(magicCards),10);

const snapshot=buildFormationSnapshot({
  cards:[{power:200},{power:200},{power:200},{power:200},{power:200}],
  uniqueState:{power:1200},
  synergy:{totals:{attackPercent:10}},
  loadoutBonus:{equipmentPvp:250,garagePvp:150,titlePvp:100,pvp:500},
  magicLoadout:{enabled:true,cards:magicCards}
});
assert.equal(snapshot.breakdown.cardBasePower,1000);
assert.equal(snapshot.breakdown.uniqueEffectPower,1200);
assert.equal(snapshot.breakdown.deckSynergyPower,1320);
assert.equal(snapshot.breakdown.characterPower,500);
assert.equal(snapshot.breakdown.magicPower,182);
assert.equal(snapshot.formationPower,2002);
assert.equal(snapshot.loadoutBonus.magicCards.length,1);

const users=Array.from({length:40},(_,index)=>({
  user_id:index+1,
  formation_power:50000+(index%9)*7000+(index%5===0?35000:0),
  balance_previous_side:index%2===0?'A':'B',
  balance_previous_result:index%3===0?'WIN':index%3===1?'LOSE':'DRAW',
  balance_history_weighted_attacks:(index%7)*140+(index<8?1200:0),
  balance_history_participation_weight:index%15,
  balance_history_win_weight:index%4,
  balance_history_loss_weight:(index+2)%4
}));
const result=balancedSideAssignments(users),totalPower=users.reduce((sum,user)=>sum+user.formation_power,0),totalActivity=users.reduce((sum,user)=>sum+user.balance_history_weighted_attacks,0);
assert.equal(result.aCount,20);
assert.equal(result.bCount,20);
assert.ok(Math.abs(result.aPower-result.bPower)/totalPower<0.015,'comprehensive formation power must be closely balanced');
assert.ok(Math.abs(result.aActivity-result.bActivity)/totalActivity<0.03,'five-round weighted activity must be closely balanced');
assert.ok(Math.abs(result.aParticipation-result.bParticipation)<=3,'consistent participation must be split across both teams');

console.log('Territory formation V1702: equipment/title/vehicle, unique effects, synergy, magic cards and five-round activity verified');
