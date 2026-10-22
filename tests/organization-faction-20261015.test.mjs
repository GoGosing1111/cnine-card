import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationFactionSchema,handleOrganizationFaction,tickOrganizationFaction} from '../functions/_organization_faction.js';
import {ORGANIZATION_DISTRICTS,validateOrganizationFactionPolicy} from '../shared/organization-faction-v1.mjs';
import {organizationFactionFixture as fixture} from './helpers/organization-faction-fixture.mjs';
import {validateFormation as validateClanFormation} from '../functions/_clan_faction_model.js';

const empty={attack3:[],attack4:[],attack5:[],defense3:[],defense4:[],defense5:[],attack1:[],attack2:[],defense1:[],defense2:[]};
test('organization attack and defense squads allow three, reject four atomically, and leave clan capacity unchanged',async t=>{
 const f=await fixture(t);assert.equal((await f.overview()).data.rules.squadSize,3);
 assert.equal(validateClanFormation({...empty,attack1:[2,3,4,5,6]},[2,3,4,5,6]).attack1.length,5);
 for(const squad of Object.keys(empty).filter(id=>!['attack4','attack5'].includes(id))){
  const formation={...empty,[squad]:[2,3,4]};assert.equal((await f.post('organization/faction/formation',{formation})).status,200);
  const rejected=await f.post('organization/faction/formation',{formation:{...empty,[squad]:[2,3,4,5]}});assert.equal(rejected.status,400);assert.match(rejected.data.error,/최대 3명/);
  assert.deepEqual((await f.overview()).data.formation,formation,'over-capacity request must not change saved squads');
 }
});
test('old five-member formations expose and launch only the first three on each side',async t=>{
 const f=await fixture(t);await f.mutateState(s=>{s.formations[1]={...empty,attack1:[2,3,4,5,6]};s.formations[2]={...empty,defense1:[7,8,9,10,11]};const d=s.districts.find(d=>d.id==='11680');d.owner=2;d.defense='defense1';});
 const overview=(await f.overview()).data;assert.deepEqual(overview.formation.attack1,[2,3,4]);assert.equal(overview.districts.find(d=>d.id==='11680').defenders.length,3);
 const result=await f.post('organization/faction/launch',{districtId:'11680',squad:'attack1'});assert.equal(result.status,200);const b=(await f.overview()).data.battles.find(b=>b.id===result.data.battleId);
 assert.deepEqual(b.attackers,[2,3,4]);assert.deepEqual(b.defenders,[7,8,9]);assert.equal((await f.post('organization/faction/enter',{battleId:b.id},5)).status,403);assert.equal((await f.post('organization/faction/enter',{battleId:b.id},10)).status,403);
});
test('25 Seoul districts, policy nulls, own-member authority and no clan data writes',async t=>{
 assert.equal(ORGANIZATION_DISTRICTS.length,25);assert.equal(new Set(ORGANIZATION_DISTRICTS.map(x=>x.id)).size,25);
 assert.throws(()=>validateOrganizationFactionPolicy({revision:0,mode:'ON',fundsPerRegion:0,upgradeCosts:[0,null,null,null,null]}));
 const f=await fixture(t),v=await f.overview();assert.equal(v.status,200);assert.equal(v.data.sessions.active,true);assert.equal(v.data.treasury.funds,0);
 assert.equal(v.data.districts.length,25);assert.equal(v.data.roster.length,5);assert.equal(v.data.clans.length,6);
 assert.equal((await f.commander(1,7)).status,409);assert.equal((await f.post('organization/faction/formation',{formation:{...empty,attack1:[2,7]}})).status,403);
 assert.equal((await f.post('organization/faction/formation',{formation:{...empty,attack1:[2,3],defense1:[4,5,6]}},3)).status,403);
 assert.equal((await f.post('organization/faction/formation',{formation:{...empty,attack1:[2,3],defense1:[4,5,6]}})).status,200);
 assert.deepEqual((await f.pg.query('SELECT * FROM clan_members')).rows,[{user_id:2,clan_id:8}]);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM organization_faction_ledger_v1')).rows[0].n,0);
});
test('shared HP, real server damage, entry guard, replay and member cooldown remain unchanged',async t=>{
 const f=await fixture(t);
 await f.post('organization/faction/formation',{formation:{...empty,attack1:[2,3],defense1:[4,5,6]}});
 await f.post('organization/faction/formation',{formation:{...empty,attack1:[7,8],defense1:[9,10,11]}},7);
 await f.mutateState(s=>{const d=s.districts.find(d=>d.id==='11680');d.owner=2;d.defense='defense1';});
 const launch=await f.post('organization/faction/launch',{districtId:'11680',squad:'attack1'});assert.equal(launch.status,200,JSON.stringify(launch));
 const battleId=launch.data.battleId;
 assert.equal((await f.post('organization/faction/strike',{battleId})).status,403);assert.equal(f.builds(),0);
 assert.equal((await f.post('organization/faction/enter',{battleId},4)).status,403);
 assert.equal((await f.post('organization/faction/enter',{battleId})).status,200);
 const requestId=crypto.randomUUID(),first=await f.post('organization/faction/strike',{battleId,requestId});assert.equal(first.status,200,JSON.stringify(first));
 assert.equal(first.data.damage,150000);assert.equal(first.data.defenderHp,850000);
 const replay=await f.post('organization/faction/strike',{battleId,requestId});assert.equal(replay.data.replayed,true);assert.equal(f.builds(),1);
 assert.equal((await f.post('organization/faction/strike',{battleId})).status,409);
 const before=JSON.stringify((await f.overview()).data.battles);
 f.fail('INSERT INTO organization_faction_receipts_v1');f.advance(60000);
 const failed=await f.post('organization/faction/strike',{battleId});assert.equal(failed.status,503);f.fail('');
 assert.equal(JSON.stringify((await f.overview()).data.battles),before,'receipt failure rolls HP and cooldown back');
});
test('session rewards pay 300 billion at nine territories, treasury snapshot is separate, duplicate tick is harmless and upgrade is atomic',async t=>{
 const f=await fixture(t,{live:true,funds:500});
 await f.mutateState(s=>{s.districts.slice(0,9).forEach(d=>d.owner=1);s.session.participants=[2,3];s.session.participantClans={2:1,3:1};});
 const settings=(await f.admin()).data.policy;
 const changed=await f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy:{...settings,fundsPerRegion:900,upgradeCosts:[0,1000,4000,5000,6000]}}});assert.equal(changed.status,200);
 f.advance(3*3600000);
 await tickOrganizationFaction(f.env,f.deps);await tickOrganizationFaction(f.env,f.deps);
 const state=(await f.overview()).data;assert.equal(state.treasury.funds,4500,'session-start amount is immutable');assert.equal(state.holdings,9);
 const rewards=(await f.pg.query('SELECT reward_type,reward_amount,user_id FROM user_message_rewards ORDER BY user_id,reward_type')).rows;
 assert.equal(rewards.length,6);assert.equal(Number(rewards.find(r=>r.reward_type==='COIN').reward_amount),300000000000);assert.equal(Number(rewards.find(r=>r.reward_type==='MASTER_STAR').reward_amount),300000);assert.equal(Number(rewards.find(r=>r.reward_type==='STARLIGHT_ARMOR_CORE').reward_amount),300);
 assert.equal((await f.post('organization/faction/upgrade',{},3)).status,403);
 const requestId=crypto.randomUUID();assert.equal((await f.post('organization/faction/upgrade',{expectedStage:1,policyRevision:1})).status,409,'stale CMS price cannot be charged');f.fail('INSERT INTO organization_faction_ledger_v1');
 assert.equal((await f.post('organization/faction/upgrade',{requestId,expectedStage:1,policyRevision:2})).status,503);f.fail('');
 assert.equal((await f.overview()).data.treasury.funds,4500);assert.equal((await f.overview()).data.treasury.stage,1);
 const upgrade=await f.post('organization/faction/upgrade',{requestId,expectedStage:1,policyRevision:2});assert.equal(upgrade.status,200,JSON.stringify(upgrade));assert.equal(upgrade.data.stage,2);assert.equal(upgrade.data.funds,3500);
 assert.equal((await f.post('organization/faction/upgrade',{requestId,expectedStage:1,policyRevision:2})).data.replayed,true);
 assert.equal((await f.overview()).data.treasury.stage,2);assert.equal((await f.post('organization/faction/upgrade',{expectedStage:2,policyRevision:2})).status,409);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM user_message_rewards')).rows[0].n,6);
});
test('TEST does not award live accounts and null treasury rate does not mint funds',async t=>{
 const f=await fixture(t);
 await f.mutateState(s=>{s.districts.slice(0,9).forEach(d=>d.owner=1);s.session.participants=[2];s.session.participantClans={2:1};});
 f.advance(3*3600000);await tickOrganizationFaction(f.env,f.deps);
 assert.equal((await f.overview()).data.treasury.funds,0);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM user_message_rewards')).rows[0].n,0);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM organization_faction_ledger_v1')).rows[0].n,0);
});
test('territory interruption freezes timers and resumes the same three-hour session',async t=>{
 const f=await fixture(t);const initial=(await f.overview()).data.sessions.current;
 f.advance(60000);const pausedAt=f.clock();
 await f.pg.query("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',$1,$2,NULL)",[new Date(pausedAt).toISOString(),new Date(pausedAt+3600000).toISOString()]);
 const paused=(await f.overview()).data;assert.equal(paused.sessions.active,false);assert.equal(paused.sessions.current.status,'PAUSED');
 f.advance(3600000);await f.pg.query("UPDATE territory_war_v3_rounds SET status='FINISHED',settled_at=$1 WHERE id=1",[new Date(f.clock()).toISOString()]);
 const resumed=(await f.overview()).data;assert.equal(resumed.sessions.active,true);assert.equal(resumed.sessions.current.key,initial.key);assert.equal(resumed.sessions.current.endsAt,initial.endsAt+3600000);
});
