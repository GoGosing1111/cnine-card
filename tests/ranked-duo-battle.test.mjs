import test from 'node:test';
import assert from 'node:assert/strict';
import {createDuoBattleV2,createPvpBattleV2,buildFighter} from '../functions/_battle_v2_preview.js';
import {mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT} from '../shared/mercenary-combat-policy-v1.mjs';
const cards=power=>['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:`card-${i}`,power,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i],power_type}));
const merc=()=>({code:'V-004',rank:'SS',name:'용병',role:'저격',position:'BACK',statMode:'RANK_FIXED',combat:MERCENARY_COMBAT_DRAFT,skills:[]});
const squad=(ownerId,power=100000,withMerc=true)=>({ownerId,ownerName:`유저${ownerId}`,cards:cards(power),equipmentBonus:50000,mercenary:withMerc?merc():null});
const input=()=>({attackerSquads:[squad(1),squad(2,200000)],defenderSquads:[squad(3),squad(4,200000)],seed:42});
test('all four owners deploy into one deterministic battlefield, including identical cards and mercenaries',()=>{
 const data=input(),before=structuredClone(data),battle=createDuoBattleV2(data);
 assert.deepEqual(data,before);assert.deepEqual(createDuoBattleV2(data),battle);
 const fighters=Object.values(battle.teams).flatMap(t=>[...t.cards,...t.mercenaries]);
 assert.equal(fighters.length,24);assert.equal(new Set(fighters.map(c=>c.id)).size,24);
 for(const side of ['A','B']){assert.equal(battle.teams[side].cards.length,10);assert.equal(battle.teams[side].mercenaries.length,2);assert.equal(battle.teams[side].summary.equipmentBonus,100000);}
 for(const id of [1,2,3,4])assert.ok(fighters.some(c=>c.ownerId===id));
 assert.ok(battle.result.timeline.length<6000);
 assert.equal(battle.result.timeline.at(-1).winner,battle.result.winner);
});
test('each mercenary links to its own five cards and keeps a unique cadence',()=>{
 const b=createDuoBattleV2(input()),m=b.teams.A.mercenaries;
 assert.ok(m[1].mercenaryLink.attackFloor>m[0].mercenaryLink.attackFloor*1.5);
 const regular=(id,side='A')=>({ownerId:id,side,hp:10,alive:true});
 const r1=regular(1),r2=regular(2),r3=regular(3,'B'),m1={...r1,isMercenary:true,statMode:'RANK_FIXED'},m2={...r2,isMercenary:true,statMode:'RANK_FIXED'};
 const cadence=mercenaryTurnCadence({A:[r1,r2,m1,m2],B:[r3]});
 cadence.acted(r1);assert.equal(cadence.pending(),m1);cadence.acted(m1);assert.equal(cadence.pending(),null);
 cadence.acted(r2);assert.equal(cadence.pending(),m2);cadence.acted(m2);assert.equal(cadence.pending(),null);
});
test('no mercenary is required, invalid owners/decks are rejected, and equipment is not duplicated',()=>{
 const data={attackerSquads:[squad(1,10000,false),squad(2,10000,false)],defenderSquads:[squad(3,10000,false),squad(4,10000,false)]};
 const battle=createDuoBattleV2(data);assert.equal(battle.teams.A.summary.power,200000);assert.equal(battle.teams.A.mercenaries.length,0);
 data.defenderSquads[0].ownerId=1;assert.throws(()=>createDuoBattleV2(data),/OWNER/);
 data.defenderSquads[0].ownerId=3;data.attackerSquads[0].cards.pop();assert.throws(()=>createDuoBattleV2(data),{code:'DUO_DECK'});
});
test('losing one owner does not end the shared battle',()=>{
 const data={attackerSquads:[squad(1,10,false),squad(2,1e7,false)],defenderSquads:[squad(3,1e5,false),squad(4,1e5,false)],seed:3};
 data.attackerSquads[0].equipmentBonus=0;data.attackerSquads[0].cards=data.attackerSquads[0].cards.map(c=>({...c,startingHpPercent:0}));
 for(const squad of data.attackerSquads)squad.cards=squad.cards.map(c=>({...c,power_type:'NONE'}));
 const b=createDuoBattleV2(data),a=b.result.final.A;
 assert.equal(a.filter(c=>c.ownerId===1&&c.hp>0).length,0);assert.ok(a.some(c=>c.ownerId===2&&c.hp>0));assert.equal(b.result.winner,'A');
});
test('legacy five-card combat remains isolated from duo ownership and repeatable',()=>{
 const data={attackerCards:cards(10000),defenderCards:cards(10000),seed:4},before=createPvpBattleV2(data);
 createDuoBattleV2(input());assert.deepEqual(createPvpBattleV2(data),before);
 assert.equal(before.teams.A.cards.length,5);assert.equal(buildFighter(cards(1)[0],0,'A').ownerId,undefined);
});
