import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../preview/mercenary-role-attacks-v2100/catalog-snapshot.json' with {type:'json'};
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD as power} from '../shared/equipment-mercenary-power-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {applyMercenaryBalanceV2103,MERCENARY_SKILL_BALANCE_V2103 as proposals} from '../shared/mercenary-skill-balance-v2103.mjs';
const party=p=>['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),power:p,power_type}));
const snapshot=code=>{const row=catalog.cards.find(c=>c.code===code);return {...row,statMode:'RANK_FIXED',combat,skills:row.skills.map(s=>({...seed.document.skills.find(t=>t.id===s.id),balance:proposals.find(t=>t.id===s.id).balance}))};};

test('linkage uses only five own ordinary cards, is frozen once, and preserves fixed stats and existing shields',()=>{
 const own=party(20000000).map((c,i)=>buildFighter(c,i,'A',null,'PVP')),before=structuredClone(own);
 const m=buildMercenaryFighter(snapshot('V-004'),'A','PVP',buildFighter),original=structuredClone(m);
 const suit={...own[0],isBattleSuit:true,attack:1e15,maxHp:1e15},foe=party(1e12).map((c,i)=>buildFighter(c,i,'B',null,'PVP'));
 applyMercenaryCombatLink([[...own,m,suit],foe]);assert.deepEqual(own,before);
 for(const key of ['power','basePower','attack','maxHp','hp','defense','speed'])assert.equal(m[key],original[key],key);
 assert.equal(m.power,power.basePowerByRank.SS);assert.ok(mercenaryEffectiveAttack(m)>m.attack*100);
 const linked=structuredClone(m.mercenaryLink),shield=m.shield;own[0].attack*=1000;applyMercenaryCombatLink([[...own,m,suit],foe]);assert.deepEqual(m.mercenaryLink,linked);assert.equal(m.shield,shield);
 assert.equal(mercenaryDamageCapHp(m),m.maxHp+shield);assert.equal(mercenaryEffectiveAttack({...own[1],mercenaryLink:{attackFloor:1e15}}),own[1].attack);
 const dead={...original,hp:0,alive:false};applyMercenaryCombatLink([[...before,dead]]);assert.equal(dead.shield,0);assert.equal(dead.mercenaryLink,undefined);
});

test('released cadence takes one additional action after three own card actions and resets on a natural turn',()=>{
 const a={side:'A',alive:true,hp:1},b={...a,side:'B'},m={...a,isMercenary:true,statMode:'RANK_FIXED',id:'M'},suit={...a,isBattleSuit:true};
 const c=mercenaryTurnCadence({A:[a,m,suit],B:[b]});c.acted(a);c.acted(b);c.acted(suit);c.acted(a);assert.equal(c.pending(),null);c.acted(m);c.acted(a);c.acted(a);assert.equal(c.pending(),null);c.acted(a);assert.equal(c.pending(),m);c.acted(m);assert.equal(c.pending(),null);
 for(let i=0;i<3;i++)c.acted(a);m.hp=0;assert.equal(c.pending(),null);
});

test('a large linked ward is depleted in combat instead of becoming invincible behind fixed low HP',()=>{
 const m={...snapshot('V-004'),rank:'C',position:'FRONT',skills:[]};
 const battle=createPvpBattleV2({attackerCards:party(1000000),defenderCards:party(1000000000),attackerMercenary:m,seed:12});
 const id='A:MERCENARY:V-004',hits=battle.result.timeline.filter(e=>e.targetId===id&&(e.damage||e.absorbed));
 assert.ok(hits.some(e=>e.absorbed>power.basePowerByRank.C));assert.ok(battle.result.timeline.some(e=>e.type==='KO'&&e.targetId===id));assert.equal(battle.result.winner,'B');
});

test('CMS tuning preserves all assignments, grades, skill rules and probabilities and refuses mechanic drift',()=>{
 const before=structuredClone(seed.document),after=applyMercenaryBalanceV2103(before,seed.catalog);
 assert.deepEqual({...after,skills:before.skills},before);assert.deepEqual(before,seed.document);
 for(const s of after.skills){const original=before.skills.find(x=>x.id===s.id);assert.deepEqual({...s,balance:original.balance,review:original.review},original);}
 const changed=structuredClone(before);changed.skills[0].mechanic='OTHER';assert.throws(()=>applyMercenaryBalanceV2103(changed,seed.catalog));
});

test('threat-targeted skills recognize an opposing mercenary enhanced by combat linkage',()=>{
 const a=buildMercenaryFighter(snapshot('V-004'),'A','PVP',buildFighter),enemy=buildMercenaryFighter(snapshot('V-004'),'B','PVP',buildFighter);
 enemy.mercenaryLink={attackFloor:1000000,openingShield:0};
 const card={...enemy,id:'B:1',isMercenary:false,slot:4,attack:500000,mercenaryLink:undefined};
 const events=[],runtime=mercenaryCombat({teams:{A:[a],B:[enemy,card]},hit(){},damage(){},knockout(){},emit:(type,e)=>events.push({type,...e}),clock:()=>0});
 a.actions++;runtime.beforeAction(a);assert.equal(events[0].targetId,enemy.id);
});

test('linked support heals and shields from the same effective attack budget and never deals support damage',()=>{
 for(const id of ['MS-018','MS-028']){
  const skill={...seed.document.skills.find(s=>s.id===id),balance:proposals.find(s=>s.id===id).balance};
  const a=buildMercenaryFighter({...snapshot('V-004'),position:'REAR',skills:[skill]},'A','PVP',buildFighter);
  a.mercenaryLink={version:2103,attackFloor:1000000,openingShield:0};
  const ally={id:'A:1',side:'A',slot:0,row:'FRONT',isMercenary:false,hp:1,maxHp:10000000,shield:0,maxShield:0,alive:true,actions:0};
  const enemy={...ally,id:'B:1',side:'B',hp:10000000};
  const events=[],runtime=mercenaryCombat({teams:{A:[a,ally],B:[enemy]},hit:()=>{throw Error('Support cannot hit');},damage:()=>{throw Error('Support cannot deal damage');},knockout(){},emit:(type,e)=>events.push({type,...e}),clock:()=>0});
  for(let i=0;i<3;i++){a.actions++;runtime.beforeAction(a);}
  if(id==='MS-018')assert.equal(ally.hp,3200001);else assert.equal(ally.shield,3000000);
  assert.equal(enemy.hp,10000000);assert.ok(events.some(e=>e.type==='MERCENARY_END'));
 }
});

test('all current mercenaries retain positive aggregate PVP value, with material S/SS skill contribution at high power',()=>{
 for(const p of [1000000,20000000,100000000]){
  const cards=party(p),base=Array.from({length:64},(_,i)=>createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:(i+1)*7919}));
  for(const row of catalog.cards){let before=0,after=0,damage=0,total=0;
   for(const side of ['A','B'])for(let i=0;i<64;i++){
    const result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,[side==='A'?'attackerMercenary':'defenderMercenary']:snapshot(row.code),seed:(i+1)*7919});
    before+=Number(base[i].result.winner===side);after+=Number(result.result.winner===side);
    for(const e of result.result.timeline.filter(e=>e.actorId?.startsWith(side+':'))){const d=Number(e.damage||0)+Number(e.absorbed||0);total+=d;if(e.actorId===side+':MERCENARY:'+row.code)damage+=d;}
    assert.equal(result.teams[side].cards.length,5);assert.equal(result.teams[side].mercenaries.length,1);
   }
   assert.ok(after>=before,`${row.code} at ${p}: ${after} vs ${before}`);
   if(['S','SS','SSS'].includes(row.rank)){assert.ok(after>=before+10,`${row.code} must make a material difference: ${after}/128`);assert.ok(damage/total>.025,`${row.code} damage contribution ${damage/total}`);}
  }
 }
});

test('stronger skills resolve in PVE with finite damage',()=>{
 const result=createPveBattleV2({cards:party(20000000),mercenary:snapshot('V-004'),monster:{id:1,battle_power:1e9},seed:12});
 assert.ok(result.result.timeline.some(e=>e.type==='MERCENARY_HIT'&&e.damage>100000));
 for(const e of result.result.timeline)if(e.damage!==undefined)assert.ok(Number.isFinite(e.damage)&&e.damage>=0);
});
