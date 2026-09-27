import test from 'node:test';import assert from 'node:assert/strict';
import {createPveBattleV2,simulateBattleV2Preview,buildBattleSuitFighter,buildFighter,buildMonsterFighter} from '../functions/_battle_v2_preview.js';
import {X_BODY_AREA_SKILL as SKILL,X_BODY_AREA_REVIEW as REVIEW,X_BODY_AREA_RELEASE_ENABLED} from '../shared/x-body-area-skill.mjs';
import {normalizeSkillChipCodes} from '../shared/battle-suit-skill-chips.mjs';
const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:String(i+1),title:'test',power_type,power:400000}));
const suit={code:'BATTLE_SUIT_X_BODY',pvePower:300000};
const monster={id:68,battle_power:300000,is_boss:1,pve_hp_percent:1200,pve_attack_percent:100,pve_shield_percent:300};
const run=(options={})=>createPveBattleV2({cards,battleSuit:suit,monster,seed:2011,[REVIEW]:true,...options});
const cast=result=>result.timeline.find(e=>e.chipCode===SKILL.code&&e.type==='SKILL_CHIP_CAST');
test('only the exact X support can cast; JSON cannot enable a review or inject an intrinsic chip',()=>{
 assert.equal(X_BODY_AREA_RELEASE_ENABLED,true);
 assert.ok(cast(run().result));assert.deepEqual(normalizeSkillChipCodes([SKILL.code]),[]);
 assert.equal(Boolean(cast(run({[REVIEW]:false}).result)),X_BODY_AREA_RELEASE_ENABLED);
 assert.deepEqual(run({[REVIEW]:false}),run(),'approved production policy matches the reviewed server simulation');
 assert.deepEqual(run({[REVIEW]:false,xAreaReview:true}),run({[REVIEW]:false}));
 for(const code of['BATTLE_SUIT_H_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_Z_BODY'])assert.equal(cast(run({battleSuit:{...suit,code}}).result),undefined);
 for(const battleSuit of[null,{...suit,pvePower:0}])assert.equal(cast(run({battleSuit}).result),undefined);
});
test('the candidate uses the existing helicopter damage formula and approved dragon collision times',()=>{
 const x=run(),a=cast(x.result),heli=run({battleSuit:{...suit,code:'BATTLE_SUIT_H_BODY',skillChips:[SKILL.damageReference]}});
 const b=heli.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST');
 assert.equal(a.intervalMs,20000);assert.equal(b.intervalMs,15000);
 assert.equal(a.baseDamage,b.baseDamage);assert.equal(a.calculatedDamage,b.calculatedDamage);assert.equal(a.damageMultiplier,5);
 const hits=x.result.timeline.filter(e=>e.castId===a.castId&&e.type==='SKILL_CHIP_HIT');
 assert.equal(hits.length,5);assert.equal(hits.reduce((n,e)=>n+e.damage+e.absorbed,0),a.calculatedDamage);
 for(const hit of hits)assert.equal(hit.combatAtMs,a.combatAtMs+SKILL.impactOffsetsMs[hit.hitIndex]);
 const d=x.result.damageBreakdown;assert.equal(d.skillChips,0);assert.ok(d.battleSuitSkills>0);assert.equal(d.total,d.cards+d.battleSuit+d.battleSuitSkills+d.ultimate);
 assert.deepEqual(x,run());
});
function multi({pvp=false,dead=false,skillChips=[],durationMs=0}={}){
 const a=cards.map((card,i)=>({...buildFighter(card,i,'A',null,pvp?'PVP':'PVE'),hp:1e10,maxHp:1e10}));
 // Keep targets alive through every scheduled impact, including repeated 20s casts.
 const b=Array.from({length:5},(_,i)=>({...buildMonsterFighter({...monster,id:i+1}),id:'B:'+i+':MONSTER:'+(i+1),slot:i,row:i<2?'FRONT':'BACK',hp:1e10,maxHp:1e10,shield:1e14,maxShield:1e14,attack:1,isMonster:!pvp,alive:!(dead&&i===4)}));
 return simulateBattleV2Preview({teamA:[...a,buildBattleSuitFighter({...suit,skillChips})],teamB:b,maxActions:durationMs?1000:100,maxCombatDurationMs:durationMs,seed:2011,[REVIEW]:true});
}
test('X-BODY casts every 20 seconds with an independently equipped 15-second helicopter',()=>{
 const result=multi({skillChips:[SKILL.damageReference],durationMs:65000});
 const times=code=>result.timeline.filter(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===code).map(e=>e.combatAtMs);
 assert.deepEqual(times(SKILL.code),[20000,40000,60000]);
 assert.deepEqual(times(SKILL.damageReference),[15000,30000,45000,60000]);
});
test('living front/back targets each retain the full confirmed area damage; PVP and dead targets are excluded',()=>{
 const result=multi(),event=cast(result);assert.equal(event.targetIds.length,5);assert.equal(event.targeting,'ALL_LIVING_ENEMIES');
 for(const row of event.targets){const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===event.castId&&e.targetId===row.targetId);assert.equal(hits.length,5);assert.equal(hits.reduce((n,e)=>n+e.damage+e.absorbed,0),row.calculatedDamage);}
 assert.equal(cast(multi({dead:true})).targetIds.length,4);assert.equal(cast(multi({pvp:true})),undefined);
 assert.equal(cast(run({ultimateDamage:1e12}).result),undefined);
});
