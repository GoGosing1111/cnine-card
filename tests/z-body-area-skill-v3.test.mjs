import test from 'node:test';
import assert from 'node:assert/strict';
import {createPveBattleV2,simulateBattleV2Preview,buildBattleSuitFighter,buildFighter,buildMonsterFighter} from '../functions/_battle_v2_preview.js';
import {Z_BODY_AREA_SKILL as SKILL,Z_BODY_AREA_REVIEW as REVIEW,Z_BODY_AREA_RELEASE_ENABLED} from '../shared/z-body-area-skill.mjs';
import {normalizeSkillChipCodes} from '../shared/battle-suit-skill-chips.mjs';

const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:String(i+1),title:'test',power_type,power:400000}));
const suit={code:'BATTLE_SUIT_Z_BODY',pvePower:300000};
const monster={id:68,battle_power:300000,is_boss:1,pve_hp_percent:1200,pve_attack_percent:100,pve_shield_percent:300};
const run=(options={})=>createPveBattleV2({cards,battleSuit:suit,monster,seed:2011,...options});
const cast=result=>result.timeline.find(e=>e.chipCode===SKILL.code&&e.type==='SKILL_CHIP_CAST');

test('approved production gate enables Z intrinsically without a chip or JSON opt-in',()=>{
  assert.equal(Z_BODY_AREA_RELEASE_ENABLED,true);
  assert.ok(cast(run().result));
  assert.deepEqual(run({zAreaReview:false}),run());
  assert.deepEqual(normalizeSkillChipCodes([SKILL.code]),[]);
  for(const code of ['BATTLE_SUIT_H_BODY','BATTLE_SUIT_S_BODY']){
    assert.equal(cast(run({[REVIEW]:true,battleSuit:{...suit,code}}).result),undefined);
  }
});
test('each target receives the helicopter total from the same authoritative formula',()=>{
  const z=run({[REVIEW]:true}),heli=run({battleSuit:{...suit,skillChips:[SKILL.damageReference]}});
  const a=cast(z.result),b=heli.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST');
  assert.equal(a.intervalMs,b.intervalMs);assert.equal(a.baseDamage,b.baseDamage);
  assert.equal(a.calculatedDamage,b.calculatedDamage);assert.equal(a.damageMultiplier,5);
  const hits=z.result.timeline.filter(e=>e.castId===a.castId&&e.type==='SKILL_CHIP_HIT');
  assert.equal(hits.length,5);
  assert.equal(hits.reduce((s,e)=>s+e.damage+e.absorbed,0),a.calculatedDamage);
  for(const hit of hits)assert.equal(hit.combatAtMs,a.combatAtMs+SKILL.impactOffsetsMs[hit.hitIndex]);
  const d=z.result.damageBreakdown;
  assert.equal(d.skillChips,0);assert.ok(d.battleSuitSkills>0);
  assert.equal(d.total,d.cards+d.battleSuit+d.battleSuitSkills+d.ultimate);
  assert.deepEqual(z,run({[REVIEW]:true}),'repeat simulation is deterministic');
});
function teamTest({pvp=false,dead=false}={}){
  const a=cards.map((card,i)=>({...buildFighter(card,i,'A',null,pvp?'PVP':'PVE'),hp:1e10,maxHp:1e10}));
  const b=Array.from({length:5},(_,i)=>({...buildMonsterFighter({...monster,id:i+1}),id:'B:'+i+':MONSTER:'+(i+1),slot:i,row:i<2?'FRONT':'BACK',hp:1e10,maxHp:1e10,attack:1,isMonster:!pvp,alive:!(dead&&i===4)}));
  return simulateBattleV2Preview({teamA:[...a,buildBattleSuitFighter(suit)],teamB:b,maxActions:100,seed:2011,[REVIEW]:true});
}
test('all living front and rear enemies receive separate five-hit damage, without target-count dilution',()=>{
  const result=teamTest(),event=cast(result);
  assert.equal(event.targetIds.length,5);assert.equal(event.targeting,'ALL_LIVING_ENEMIES');
  for(const row of event.targets){
    const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===event.castId&&e.targetId===row.targetId);
    assert.equal(hits.length,5);
    assert.equal(hits.reduce((s,e)=>s+e.damage+e.absorbed,0),row.calculatedDamage);
    assert.equal(row.calculatedDamage,row.baseDamage*5);
  }
  assert.equal(event.calculatedDamage,event.targets.reduce((s,t)=>s+t.calculatedDamage,0));
  assert.equal(cast(teamTest({dead:true})).targetIds.length,4);
  assert.equal(cast(teamTest({pvp:true})),undefined);
});
test('missing or zero-power suit and an opening kill cannot generate an intrinsic cast',()=>{
  for(const battleSuit of [null,{...suit,pvePower:0}])assert.equal(cast(run({battleSuit,[REVIEW]:true}).result),undefined);
  assert.equal(cast(run({ultimateDamage:1e12,[REVIEW]:true}).result),undefined);
});
