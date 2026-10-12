import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {seedTerritorySkillVotes} from './helpers/territory-skill-vote-fixture.mjs';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {networkFront,frontRound} from '../functions/_territory_network_v6.js';
import {applyBattlefieldSkill,battlefieldPolicy} from '../functions/_territory_battlefield_v5.js';
import {battlefieldSkillCatalog,normalizeBattlefieldConfig,BATTLEFIELD_DEFAULTS} from '../shared/territory-battlefield-v5.mjs';
import {RENEWAL_SKILL_CODES,renewalSkillPlan} from '../shared/territory-renewal-skills-20261013.mjs';
const no=async f=>Number((await f.p('SELECT COUNT(*) n FROM territory_war_skill_cooldowns').first()).n);
async function fixture(t,postgres){
 const f=await territoryNetworkFixture(t,postgres);await f.form();
 f.front=async()=>networkFront(f.env,await f.round(),{nodeIndex:4});
 const front=await f.front();f.frontId=Number(front.id);
 await f.p('UPDATE territory_war_v3_fronts SET a_hp=500,b_hp=500,a_max_hp=1000,b_max_hp=1000 WHERE id=?',f.frontId).run();
 await f.p('UPDATE territory_battlefield_fronts SET charge_a=80,charge_b=90 WHERE front_id=?',f.frontId).run();
 f.data=()=>f.p('SELECT * FROM territory_battlefield_fronts WHERE front_id=?',f.frontId).first();
 f.seed=(code,side='A',count=25)=>seedTerritorySkillVotes(f,code,side,count,{frontId:f.frontId});
 f.cast=key=>T.activateVotedTerritorySkill(f.env,key,f.cfg);
 f.commander=side=>f.p("SELECT * FROM territory_war_v3_users WHERE round_id=1 AND side=? AND status='ACTIVE' ORDER BY user_id LIMIT 1",side).first();
 return f;
}
test('three V6-only skills expose their frozen CMS policy; cost fits a smaller charge capacity',()=>{
 const old=battlefieldSkillCatalog(),current=battlefieldSkillCatalog(BATTLEFIELD_DEFAULTS,{network:true});
 for(const code of RENEWAL_SKILL_CODES){assert.equal(old[code],undefined);assert.equal(current[code].cooldownMinutes,45);assert.ok(current[code].asset.endsWith('-icon.webp'));}
 assert.equal(normalizeBattlefieldConfig({chargeMax:20}).arcLanceCharge,20);
 assert.equal(normalizeBattlefieldConfig({arcLanceHpPercent:500,repairHpPercent:-1}).arcLanceHpPercent,10);
});
test('resource and health caps, EMP restrictions, empty targets and both sides use actual remaining amounts',()=>{
 const now=1000,front={a_hp:999,a_max_hp:1000,b_hp:2,b_max_hp:1000},data={charge_a:99,charge_b:5,emp_a_until_ms:0,emp_b_until_ms:0},base={config:BATTLEFIELD_DEFAULTS,data,front,side:'A',now};
 assert.deepEqual(renewalSkillPlan('CITADEL_REPAIR',base),{damage:0,heal:1,chargeSpent:0,chargeDrained:0,chargeGained:1});
 assert.equal(renewalSkillPlan('ARC_LANCE',base).damage,1);
 assert.equal(renewalSkillPlan('DISRUPTION_WAVE',base).chargeDrained,5);
 assert.equal(renewalSkillPlan('DISRUPTION_WAVE',{...base,side:'B'}).chargeDrained,35);
 assert.throws(()=>renewalSkillPlan('ARC_LANCE',{...base,data:{...data,emp_a_until_ms:1001}}),/복구/);
 assert.throws(()=>renewalSkillPlan('ARC_LANCE',{...base,data:{...data,charge_a:39}}),/부족/);
 assert.throws(()=>renewalSkillPlan('ARC_LANCE',{...base,front:{...front,b_hp:1}}),/개인 교전/);
 assert.throws(()=>renewalSkillPlan('DISRUPTION_WAVE',{...base,data:{...data,charge_b:0}}),/교란할/);
 assert.throws(()=>renewalSkillPlan('CITADEL_REPAIR',{...base,data:{...data,charge_a:100},front:{...front,a_hp:1000}}),/가득/);
});
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(dialect+': the 25th vote casts one lance, spends once and shares its cooldown across nodes',async t=>{
  const f=await fixture(t,postgres),otherBefore=await networkFront(f.env,await f.round(),{nodeIndex:2});
  const key=await f.seed('ARC_LANCE','A',24);assert.equal(await f.cast(key),null);assert.equal(await no(f),0);
  await f.seed('ARC_LANCE');const result=await f.cast(key);assert.equal(result.damage,60);assert.equal(result.chargeSpent,40);
  assert.equal((await f.front()).b_hp,440);assert.equal((await f.data()).charge_a,40);assert.equal((await f.round()).a_total_damage,60);
  assert.equal((await f.cast(key)).replayed,true);assert.equal((await f.front()).b_hp,440);assert.equal(await no(f),1);
  assert.deepEqual(await networkFront(f.env,await f.round(),{nodeIndex:2}),otherBefore);
  const otherKey=await seedTerritorySkillVotes(f,'ARC_LANCE','A',25,{frontId:Number(otherBefore.id)});assert.equal(await f.cast(otherKey),null);
  const stats=await f.p('SELECT SUM(attacks) attacks,SUM(damage) damage FROM territory_war_v3_users').first();assert.equal(Number(stats.attacks),0);assert.equal(Number(stats.damage),0);
 });
 test(dialect+': disruption drains only the selected enemy charge and never cancels a reserved cannon',async t=>{
  const f=await fixture(t,postgres),due=Date.now()+60000;
  await f.p("UPDATE territory_battlefield_fronts SET cannon_b_due_ms=?,cannon_b_request='reserved' WHERE front_id=?",due,f.frontId).run();
  const key=await f.seed('DISRUPTION_WAVE'),result=await f.cast(key);assert.equal(result.chargeDrained,35);assert.equal(result.damage,0);
  const data=await f.data();assert.equal(data.charge_b,55);assert.equal(data.charge_a,80);assert.equal(Number(data.cannon_b_due_ms),due);assert.equal(data.cannon_b_request,'reserved');assert.equal((await f.front()).b_hp,500);
  assert.equal((await f.cast(key)).replayed,true);assert.equal((await f.data()).charge_b,55);
 });
 test(dialect+': either faction can repair its own wall and charge, capped without clearing existing EMP',async t=>{
  const f=await fixture(t,postgres),until=Date.now()+60000;
  await f.p('UPDATE territory_war_v3_fronts SET b_hp=950 WHERE id=?',f.frontId).run();
  await f.p('UPDATE territory_battlefield_fronts SET emp_b_until_ms=? WHERE front_id=?',until,f.frontId).run();
  const key=await f.seed('CITADEL_REPAIR','B'),result=await f.cast(key);assert.equal(result.heal,50);assert.equal(result.chargeGained,10);
  const front=await f.front(),data=await f.data();assert.equal(front.b_hp,1000);assert.equal(front.a_hp,500);assert.equal(data.charge_b,100);assert.equal(data.charge_a,80);assert.equal(Number(data.emp_b_until_ms),until);
  assert.equal((await f.cast(key)).replayed,true);assert.equal((await f.front()).b_hp,1000);
 });
 test(dialect+': activation failure rolls back HP, charge, receipt, cooldown and votes before a safe retry',async t=>{
  const f=await fixture(t,postgres),key=await f.seed('ARC_LANCE'),batch=f.env.DB.batch.bind(f.env.DB);
  f.env.DB.batch=s=>batch([...s,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('renewal-failure',0)")]);
  assert.equal(await f.cast(key),null);assert.equal((await f.front()).b_hp,500);assert.equal((await f.data()).charge_a,80);assert.equal(await no(f),0);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_operation_votes WHERE operation=?',key).first()).n),25);
  f.env.DB.batch=batch;assert.equal((await f.cast(key)).damage,60);
 });
 test(dialect+': stale front, lost access and legacy rounds cannot consume the new skill',async t=>{
  const f=await fixture(t,postgres),key=await f.seed('ARC_LANCE'),front=await f.front(),mine=await f.commander('A');
  const round=frontRound(await f.round(),front),args={round,front:{...front,version:front.version-1},mine,operation:'ARC_LANCE',requestId:'RENEWAL:STALE',voteKey:key};
  await assert.rejects(applyBattlefieldSkill(f.env,args));assert.equal((await f.data()).charge_a,80);assert.equal(await no(f),0);
  await f.p('UPDATE territory_network_nodes SET a_access=0 WHERE front_id=?',f.frontId).run();assert.equal(await f.cast(key),null);assert.equal((await f.front()).b_hp,500);
  await assert.rejects(applyBattlefieldSkill(f.env,{...args,round:{...round,warfare_version:4},front}),/사용할 수 없는/);
 });
 test(dialect+': formation freezes new CMS values and later changes do not reprice an existing round',async t=>{
  const f=await fixture(t,postgres),policy=await battlefieldPolicy(f.env,await f.round());assert.equal(policy.arcLanceHpPercent,6);
  await f.p("UPDATE app_meta SET value=? WHERE key='territory_war_settings_v3'",JSON.stringify({...f.cfg,battlefield:{...BATTLEFIELD_DEFAULTS,arcLanceHpPercent:10}})).run();
  const result=await f.cast(await f.seed('ARC_LANCE'));assert.equal(result.damage,60);
 });
}
