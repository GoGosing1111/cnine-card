import assert from 'node:assert/strict';
import test from 'node:test';
import {buildFighter,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';

const grail={id:10,code:'V2_SHIELD_SIPHON',name:'강탈의 성배',slotNo:1,effectType:'SHIELD_SIPHON',effectValue:15,triggerChance:100,maxActivations:2};

function firstSteal(mode,shield=10000000){
  const actor=buildFighter({id:'QUARTER-A',power:100000,power_type:'NONE'},0,'A',null,mode==='PVP'?'PVP':'PVE');
  const target=mode==='PVP'
    ?buildFighter({id:'QUARTER-B',power:5500000,power_type:'NONE'},0,'B',null,'PVP')
    :buildMonsterFighter({id:74,name:'센쥬 하시라마',is_boss:1,battle_power:5500000,pve_difficulty:mode==='APOCALYPSE'?'APOCALYPSE':'NORMAL',pve_hp_percent:350,pve_attack_percent:475,pve_defense_percent:375,pve_speed_percent:375,pve_shield_percent:70});
  Object.assign(actor,{gauge:99,speed:10000});
  Object.assign(target,{gauge:0,speed:1,shield,maxShield:shield});
  const result=simulateBattleV2Preview({teamA:[actor],teamB:[target],magicA:[grail],seed:7919,maxActions:1});
  const event=result.timeline.find(e=>e.type==='MAGIC_CARD'&&e.effectType==='SHIELD_SIPHON');
  assert.ok(event,'fixture must activate the grail after the first player attack');
  assert.equal(result.final.A[0].shield,event.actorShieldAfter,'the server applies the granted shield shown in the timeline');
  assert.equal(result.final.B[0].shield,event.targetShieldAfter,'the same amount leaves the target shield');
  return {event,shieldBefore:event.targetShieldAfter+event.shieldStolen};
}

for(const mode of ['PVP','NORMAL']){
  test(`${mode}: grail transfers 15% of the remaining shield instead of 60%`,()=>{
    const {event,shieldBefore}=firstSteal(mode);
    assert.equal(event.shieldStolen,Math.round(shieldBefore*0.15));
    assert.ok(Math.abs(event.shieldStolen-Math.round(shieldBefore*0.60)/4)<=1);
    assert.equal(event.value,15,'the battle effect displays the operating percentage');
  });
}

test('Hashirama with an underpowered card: capped grail transfer falls from 342866 to 85717',()=>{
  const {event,shieldBefore}=firstSteal('APOCALYPSE');
  assert.ok(shieldBefore*0.15>342866,'lowering only 60% to 15% would still hit the old cap');
  assert.equal(event.shieldStolen,85717,'both the boss cap and the configured percentage must be quartered');
});

test('apocalypse with a depleted shield uses 15% without a second quarter multiplier',()=>{
  const {event,shieldBefore}=firstSteal('APOCALYPSE',400000);
  assert.ok(shieldBefore*0.15<85717,'fixture is below the reduced cap');
  assert.equal(event.shieldStolen,Math.round(shieldBefore*0.15));
  assert.ok(Math.abs(event.shieldStolen-Math.round(shieldBefore*0.60)/4)<=1);
});
