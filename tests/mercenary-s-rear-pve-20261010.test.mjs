import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,scenarios,snapshot,runBattle} from '../scripts/measure-s-rear-pve-20261010.mjs';
import {battleConfig} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {S_REAR_PVE_POLICY,SS_REAR_PVE_POLICY,isSRearPveMercenary,ssRearPveSnapshot,ssRearPveInterval,ssRearPvePriorityTargets} from '../shared/mercenary-ss-rear-pve-v1.mjs';

const document={mercenaries:[...fixture.targets,...fixture.controls],
 assignments:[...fixture.targets,...fixture.controls].map(m=>({code:m.code,skillIds:m.skills.map(s=>s.id)})),
 skills:[...fixture.targets,...fixture.controls].flatMap(m=>m.skills)};
const actor=m=>({...m,...ssRearPveSnapshot(m),id:'A:MERCENARY:'+m.code,side:'A',battleMode:'PVE',isMercenary:true,hp:100,alive:true});
const clean=b=>JSON.parse(JSON.stringify(b,(key,value)=>key==='pveRearCadence'?undefined:value));

test('new S ranged snapshots include Cheonga, reported Astel and Elodie; S front, other ranks and limited stay excluded',()=>{
 assert.deepEqual(fixture.targets.map(m=>m.code),['V-005','V-008','V-022']);
 for(const m of fixture.targets){
  assert.equal(isSRearPveMercenary(m),true);
  assert.deepEqual(battleConfig(document,m.code,1).pveRearCadence,S_REAR_PVE_POLICY);
  const copy=battleConfig(document,m.code,1);copy.pveRearCadence.regularActionsPerTurn=99;
  assert.equal(battleConfig(document,m.code,1).pveRearCadence.regularActionsPerTurn,2);
 }
 for(const m of fixture.controls)assert.deepEqual(ssRearPveSnapshot(m),{});
 for(const rank of ['C','B','A','SSS'])assert.deepEqual(ssRearPveSnapshot({...fixture.targets[1],rank}),{});
 assert.deepEqual(ssRearPveSnapshot({...fixture.targets[1],edition:'LIMITED'}),{});
 assert.equal(ssRearPveSnapshot({...fixture.targets[1],rank:'SS'}).pveRearCadence.version,2);
});

test('S cadence and priority require its captured version 3; existing S recordings and PVP retain prior behavior',()=>{
 for(const m of fixture.targets)for(const version of [undefined,1,2,3,4,'3'])for(const mode of ['PVE','PVP']){
  const a=actor(m);a.battleMode=mode;a.pveRearCadence={version,regularActionsPerTurn:99,enemyBasicPriority:false};
  const active=version===3&&mode==='PVE';assert.equal(ssRearPveInterval(a),active?2:1);
  assert.deepEqual(ssRearPvePriorityTargets({isMonster:true},[a]),active?[a]:[]);
  const ordinary={id:'A:card',side:'A',alive:true,hp:100},enemy={id:'B:monster',side:'B',isMonster:true,alive:true,hp:100};
  const runtime=mercenaryTurnCadence({A:[ordinary,a],B:[enemy]});
  runtime.acted(ordinary);assert.equal(runtime.pending(),active?null:a);
  if(active){runtime.acted(ordinary);assert.equal(runtime.pending(),a);}
  runtime.acted(a);assert.equal(runtime.pending(),null);
  a.hp=0;a.alive=false;assert.deepEqual(ssRearPvePriorityTargets(enemy,[a]),[]);
 }
 const ss={...actor(fixture.targets[1]),rank:'SS',pveRearCadence:{...SS_REAR_PVE_POLICY}};
 assert.equal(ssRearPveInterval(ss),2);assert.deepEqual(ssRearPvePriorityTargets({isMonster:true},[ss]),[ss]);
 ss.pveRearCadence.version=3;assert.equal(ssRearPveInterval(ss),1,'do not reinterpret unknown version 3 in an older SS snapshot');
});

test('real Apocalypse, tower and legion monster basics hit affected S ranged units first and retarget after death',()=>{
 const selected=[scenarios.find(s=>s.mode==='APOCALYPSE'),scenarios.find(s=>s.mode==='TOWER'&&s.id==='70'),scenarios.find(s=>s.mode==='LEGION'&&s.id==='inferno')];
 let retargeted=false;
 for(const scenario of selected)for(const m of fixture.targets){
  const result=runBattle(scenario,snapshot({code:m.code,equipment:scenario.equipment[0]}),7919),id='A:MERCENARY:'+m.code;
  let alive=true,hits=0;
  for(const event of result.timeline){
   if(event.type==='KO'&&event.targetId===id)alive=false;
   if(event.type!=='TURN'||!event.actorId?.startsWith('B:'))continue;
   if(alive){assert.equal(event.targetId,id,scenario.mode+'/'+m.code);hits++;}
   else{assert.notEqual(event.targetId,id);retargeted=true;}
  }
  assert.ok(hits>0,scenario.mode+'/'+m.code);assert.equal(result.final.mercenaries.A[0].pveRearCadence.version,3);
 }
 assert.ok(retargeted);
});

test('reported Astel bypass reproduces on Alucard with a weak deck and suit; new targeting removes the protected clear',()=>{
 const scenario=scenarios.find(s=>s.mode==='APOCALYPSE'&&s.id==='75');
 const options={code:'V-008',equipment:1000000,formation:'HP2',suit:7000000};
 const before=runBattle(scenario,snapshot({...options,adjusted:false}),48337576);
 const after=runBattle(scenario,snapshot(options),48337576);
 assert.equal(before.winner,'A');assert.equal(after.winner,'B');
 const incoming=r=>r.timeline.filter(e=>e.type==='TURN'&&e.actorId?.startsWith('B:')&&e.targetId==='A:MERCENARY:V-008');
 assert.equal(incoming(before).length,0);assert.ok(incoming(after).length>0);
 const strong=runBattle(scenario,snapshot({...options,equipment:120000000}),48337576);
 assert.equal(strong.winner,'A','S ownership does not force a loss when the formation is strong enough');
});

test('all three S ranged fighters retain exact prior PVP events and outcomes on either side',()=>{
 for(const m of fixture.targets)for(const seed of [7919,23757])for(const side of ['attacker','defender']){
  const loadout=snapshot({code:m.code,equipment:3000000});
  const prior=snapshot({code:m.code,equipment:3000000,adjusted:false});
  const opponent=snapshot({code:'V-004',equipment:3000000}).mercenary;
  const args={attackerCards:loadout.cards,defenderCards:loadout.cards,attackerMercenary:opponent,defenderMercenary:opponent,
   attackerEquipmentBonus:3000000,defenderEquipmentBonus:3000000,seed};
  assert.deepEqual(clean(createPvpBattleV2({...args,[side+'Mercenary']:loadout.mercenary})),
   clean(createPvpBattleV2({...args,[side+'Mercenary']:prior.mercenary})),m.code+'/'+side+'/'+seed);
 }
});

test('public codex gives affected S fighters the actual PVE warning while preserving their rank and skill budgets',()=>{
 const raw=structuredClone(MERCENARY_CMS_SEED.document);
 for(const m of document.mercenaries)Object.assign(raw.mercenaries.find(r=>r.code===m.code),{rank:m.rank,position:m.position,role:m.role});
 const codex=mercenaryCodexDocument({payload_json:JSON.stringify(raw),revision:61});
 for(const m of fixture.targets){
  const row=codex.cards.find(r=>r.code===m.code);assert.equal(row.rank,'S');
  assert.match(row.combatLinkDescription,/PVE에서는 아군 카드 2회, PVP에서는 1회/);
  assert.match(row.combatLinkDescription,/적의 기본 공격 우선 대상/);
  assert.deepEqual(battleConfig(document,m.code,1).skills,m.skills);
 }
 for(const m of fixture.controls)assert.doesNotMatch(codex.cards.find(r=>r.code===m.code).combatLinkDescription,/적의 기본 공격 우선 대상/);
});
