import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFactionFixture as fixture} from './helpers/organization-faction-fixture.mjs';
import {SQUADS,SELF_JOIN_SQUAD_IDS} from '../shared/organization-faction-v1.mjs';
const empty=()=>Object.fromEntries(SQUADS.map(s=>[s.id,[]]));
const expect=(r,status)=>{assert.equal(r.status,status,JSON.stringify(r));return r.data;};
const join=(f,user,squad='attack4',baseSquad='',extra={})=>f.post('organization/faction/join-squad',{squad,baseSquad,...extra},user);
const leave=(f,user,squad='attack4',extra={})=>f.post('organization/faction/leave-squad',{squad,baseSquad:squad,...extra},user);

test('ordinary members join, move and leave themselves without elder or captain appointment; existing state is preserved',async t=>{
 const f=await fixture(t);assert.deepEqual(SQUADS.filter(s=>s.selfJoin).map(s=>s.id),SELF_JOIN_SQUAD_IDS);assert.equal(SQUADS.length,10);
 expect(await f.post('organization/faction/formation',{formation:{...empty(),attack1:[2],defense1:[3],defense2:[4,5]}}),200);
 await f.mutateState(s=>{s.districts[0].owner=1;s.districts[0].defense='defense1';s.squadReady['1:attack4']=f.clock()+600000;s.strikeReady[3]=f.clock()+60000;});
 const before=(await f.admin()).data.state;
 expect(await join(f,3,'attack4','defense1'),200);
 const view=expect(await f.overview(3),200),after=(await f.admin()).data.state;
 assert.equal(view.mine.isMaster,false);assert.equal(view.mine.canManageFormation,false);assert.equal(view.mine.canManageGarrison,false);
 assert.deepEqual(view.formation.attack4,[3]);assert.deepEqual(view.formation.defense1,[]);assert.deepEqual(view.formation.attack1,[2]);assert.deepEqual(view.formation.defense2,[4,5]);assert.equal(view.districts[0].defense,'');
 for(const key of ['captains','elders','session','squadReady','targetReady','strikeReady'])assert.deepEqual(after[key],before[key],key+' must not be reset or grant rewards for joining');
 expect(await join(f,3,'attack5','attack4'),200);assert.deepEqual((await f.overview(3)).data.formation.attack4,[]);
 expect(await leave(f,3,'attack5'),200);assert.deepEqual((await f.overview(3)).data.formation.attack5,[]);
 expect(await f.post('organization/faction/formation',{formation:empty()},3),403);expect(await f.post('organization/faction/garrison',{districtId:view.districts[0].id,squad:'defense2'},3),403);
});

test('three-seat capacity is enforced atomically under competing joins; stale intent and arbitrary users/organizations are rejected',async t=>{
 const f=await fixture(t);expect(await join(f,3),200);expect(await join(f,4),200);
 const results=await Promise.all([join(f,5),join(f,6)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.overview()).data.formation.attack4.length,3);
 const loser=results[0].status===409?5:6,winner=loser===5?6:5;
 expect(await join(f,loser,'attack5'),200);expect(await join(f,loser,'attack4',''),409);
 expect(await join(f,3,'attack1','attack4'),400);expect(await join(f,1),403);
 expect(await join(f,loser,'attack5','attack5',{userId:winner}),400);
 expect(await join(f,loser,'attack5','attack5',{organizationId:2}),400);
 const ours=(await f.overview()).data.formation;expect(await join(f,7),200);assert.deepEqual((await f.overview()).data.formation,ours,'other organization joins only its own squad');
 expect(await f.post('organization/faction/leave-squad',{squad:'attack4',baseSquad:'attack5'},loser),403);
 assert.equal(new Set(Object.values((await f.overview()).data.formation).flat()).size,4);
});

test('joined ordinary members launch and fight; unjoined elders cannot launch autonomous squads and busy membership cannot change',async t=>{
 const f=await fixture(t);expect(await join(f,3),200);
 expect(await f.post('organization/faction/formation',{formation:{...empty(),defense1:[7,8]}},7),200);
 await f.mutateState(s=>Object.assign(s.districts.find(d=>d.id==='11680'),{owner:2,defense:'defense1'}));
 expect(await f.post('organization/faction/launch',{districtId:'11680',squad:'attack4'},2),403);
 expect(await f.post('organization/faction/launch',{districtId:'11680',squad:'attack4'},4),403);
 const launched=expect(await f.post('organization/faction/launch',{districtId:'11680',squad:'attack4'},3),200),battleId=launched.battleId;
 expect(await join(f,4),409);expect(await leave(f,3),409);expect(await join(f,3,'attack5','attack4'),409);
 expect(await join(f,5,'attack5'),200);
 expect(await f.post('organization/faction/enter',{battleId},5),403);
 expect(await f.post('organization/faction/enter',{battleId},3),200);
 const requestId=crypto.randomUUID(),hit=expect(await f.post('organization/faction/strike',{battleId,requestId},3),200);assert.equal(hit.damage,150000);assert.equal(hit.defenderHp,850000);
 assert.equal(expect(await f.post('organization/faction/strike',{battleId,requestId},3),200).replayed,true);assert.equal(f.builds(),1);
 expect(await f.post('organization/faction/strike',{battleId},3),409);
 const battle=(await f.overview()).data.battles.find(b=>b.id===battleId);assert.deepEqual(battle.attackers,[3]);assert.deepEqual(battle.defenders,[7,8]);
});

test('source defense is locked during combat while an unrelated idle squad stays open',async t=>{
 const f=await fixture(t);expect(await f.post('organization/faction/formation',{formation:{...empty(),defense1:[3]}}),200);
 await f.mutateState(s=>s.battles.push({id:'defense-lock',status:'ACTIVE',districtId:s.districts[0].id,attacker:2,defender:1,squad:'attack1',defenseSquad:'defense1',attackers:[7],defenders:[3],endsAt:f.clock()+60000}));
 expect(await join(f,3,'attack4','defense1'),409);expect(await join(f,4,'attack4'),200);
});

test('leader saves cannot erase self-joined members, including old clients without a base; prior membership and captains are preserved',async t=>{
 const f=await fixture(t);await f.mutateState(s=>{s.formations[1]={...empty(),attack4:[3]};s.captains[1]={attack1:0,attack2:0,attack3:0,attack4:5,attack5:0};});
 const initial=(await f.overview()).data;assert.deepEqual(initial.formation.attack4,[3]);assert.equal(initial.captains.attack4,5);
 expect(await f.post('organization/faction/formation',{formation:empty()}),409);
 expect(await f.post('organization/faction/formation',{formation:empty()},5),409);
 expect(await f.post('organization/faction/formation',{formation:{...initial.formation,attack1:[2]}}),200);
 const stale=(await f.overview()).data.formation;expect(await join(f,4,'attack4'),200);
 expect(await f.post('organization/faction/formation',{formation:{...stale,defense1:[6]},baseFormation:stale}),409);
 expect(await f.post('organization/faction/formation',{formation:{...stale,defense1:[6]}}),409);
 const latest=(await f.overview()).data.formation;expect(await f.post('organization/faction/formation',{formation:{...latest,defense1:[6]},baseFormation:latest}),200);
 assert.deepEqual((await f.overview()).data.formation.attack4,[3,4]);
});

test('receipt failure rolls membership and events back; retries join once and do not rejoin after leaving',async t=>{
 const f=await fixture(t),requestId=crypto.randomUUID(),before=(await f.admin()).data.state;
 f.fail('INSERT INTO organization_faction_receipts_v1');expect(await join(f,3,'attack4','',{requestId}),503);f.fail('');
 const rolled=(await f.admin()).data.state;assert.deepEqual(rolled.formations,before.formations);assert.deepEqual(rolled.events,before.events);
 expect(await join(f,3,'attack4','',{requestId}),200);assert.equal(expect(await join(f,3,'attack4','',{requestId}),200).replayed,true);
 expect(await join(f,3,'attack4','attack4'),200);assert.equal((await f.admin()).data.state.events.filter(e=>e.kind==='SQUAD_JOIN').length,1);
 expect(await leave(f,3),200);assert.equal(expect(await join(f,3,'attack4','',{requestId}),200).replayed,true);assert.deepEqual((await f.overview()).data.formation.attack4,[]);
});

test('OFF, unassigned and inactive accounts cannot self-join; pause still prevents launch',async t=>{
 const f=await fixture(t);await f.pg.query("UPDATE users SET status='BANNED' WHERE id=3");expect(await join(f,3),403);await f.pg.query("UPDATE users SET status='ACTIVE' WHERE id=3");
 const policy=(await f.admin()).data.policy;expect(await f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy:{...policy,mode:'OFF'}}}),200);expect(await join(f,3),409);
 expect(await f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy:{...policy,revision:policy.revision+1,mode:'TEST'}}}),200);
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='SURVEY' WHERE id=$1",[f.roundId]);expect(await join(f,3),409);
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED' WHERE id=$1",[f.roundId]);expect(await join(f,3),200);
 await f.pg.query("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',$1,$2,NULL)",[new Date(f.clock()).toISOString(),new Date(f.clock()+3600000).toISOString()]);
 expect(await f.post('organization/faction/launch',{districtId:'11680',squad:'attack4'},3),409);
});
