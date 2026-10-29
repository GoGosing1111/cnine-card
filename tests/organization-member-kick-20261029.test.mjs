import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationKickFixture} from './helpers/organization-kick-fixture.mjs';
import {organizationJoinView} from '../js/organization-join-v1.mjs';
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));

test('an elder removes a member from both current rosters and formations, preserving earned records and funds',async t=>{
 const f=await organizationKickFixture(t),before=await f.faction(),requestId=crypto.randomUUID();
 const view=(await f.overview(3)).data;
 assert.deepEqual(view.roster.filter(m=>m.canKick).map(m=>m.userId),[5,6]);assert.equal((await f.overview(5)).data.roster.some(m=>m.canKick),false);
 const result=await f.kick({requestId},3);ok(result);assert.equal(result.data.memberCount,3);
 const after=await f.faction();assert.deepEqual(after.formations[1],{attack1:[6],defense1:[]});assert.deepEqual(after.captains[1],{});assert.equal(after.districts[0].defense,'');
 assert.deepEqual(after.formations[2],before.formations[2]);assert.deepEqual(after.history,before.history);assert.deepEqual(after.session,before.session);
 assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE user_id=5')).rows.length,0);
 assert.equal((await f.pg.query('SELECT status FROM clan_draft_pool')).rows[0].status,'WITHDRAWN');
 assert.equal((await f.pg.query('SELECT active FROM organization_surveys_v1 WHERE user_id=5')).rows[0].active,0);
 assert.equal((await f.pg.query('SELECT balance FROM qa_wallets')).rows[0].balance,9999999999999);
 const removed=(await f.overview(5)).data;assert.equal(removed.membership,null);assert.equal(removed.join.canApply,true);assert.equal(removed.join.application.status,'REMOVED');
 assert.match(organizationJoinView(removed),/클랜 방출 · 재신청 가능/);
 ok(await f.kick({requestId},3));assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
 assert.equal((await f.kick({requestId,targetUserId:6},3)).data.code,'ORG_REQUEST_CONFLICT');
 ok(await f.post('organization/join/apply',{roundId:f.roundId,revision:3,organizationId:1,message:'가입 재신청'},{user:5}));
 ok(await f.post('organization/join/review',{roundId:f.roundId,revision:4,userId:5,decision:'APPROVED'},{user:2}));
 assert.equal((await f.overview(5)).data.membership.organizationId,1);assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE user_id=5')).rows.length,1);
 ok(await f.kick({requestId},3));assert.equal((await f.overview(5)).data.membership.organizationId,1);
 assert.equal((await f.kick({},3)).data.code,'ORG_STALE');
});

test('self, other elders, foreign members, non-elders and OWNER without elder membership cannot remove anyone',async t=>{
 const f=await organizationKickFixture(t),before=await f.snapshot();
 for(const [body,user,code] of [[{targetUserId:2},2,'ORG_SELF'],[{targetUserId:3},2,'ORG_ELDER_TARGET'],[{targetUserId:7},2,'ORG_MEMBERSHIP'],[{},6,'ORG_ELDER'],[{},1,'ORG_ELDER'],[{},4,'ORG_MEMBERSHIP'],[{joinedAt:f.clock()-1},2,'ORG_STALE'],[{revision:1},2,'ORG_STALE'],[{confirmation:''},2,'ORG_CONFIRMATION'],[{targetUserId:'5'},2,'ORG_INPUT']]){
  const r=await f.kick(body,user);assert.notEqual(r.status,200,JSON.stringify({body,user,r}));if(code!=='ORG_INPUT')assert.equal(r.data.code,code,JSON.stringify(r));
 }
 assert.deepEqual(await f.snapshot(),before);
 await f.pg.query("UPDATE users SET banned_until='2099-01-01' WHERE id=2");assert.equal((await f.kick()).data.code,'ORG_ACCOUNT');
 await f.pg.query('UPDATE users SET banned_until=NULL WHERE id=2');await f.changeFaction(s=>s.elders[1]=[3]);assert.equal((await f.kick()).data.code,'ORG_ELDER');
});

test('active faction battles, regular matches, unsettled fights and reservations block removal',async t=>{
 const f=await organizationKickFixture(t);
 await f.changeFaction(s=>s.battles=[{status:'ACTIVE',endsAt:f.clock()+60000,attackers:[5],defenders:[7]}]);
 let before=await f.snapshot();assert.equal((await f.kick()).data.code,'ORG_BATTLE');assert.deepEqual(await f.snapshot(),before);
 await f.changeFaction(s=>s.battles=[]);
 for(const status of ['ACTIVE','CLOSING']){await f.pg.query('UPDATE clan_wars SET status=$1',[status]);assert.equal((await f.kick()).data.code,'ORG_BATTLE');}
 await f.pg.exec("UPDATE clan_wars SET status='COMPLETED';INSERT INTO clan_war_battles VALUES(5,'PENDING',5,7)");assert.equal((await f.kick()).data.code,'ORG_BATTLE');
 await f.pg.exec("DELETE FROM clan_war_battles;INSERT INTO clan_war_reservation_locks VALUES(9,5,'2999-01-01')");assert.equal((await f.kick()).data.code,'ORG_BATTLE');
 await f.pg.exec("DELETE FROM clan_war_reservation_locks;UPDATE clan_seasons SET phase='CHAMPIONS'");assert.equal((await f.kick()).data.code,'ORG_SEASON');
 await f.pg.exec("UPDATE clan_seasons SET phase='ACTIVE'");ok(await f.kick());
});

test('audit/receipt failure rolls both rosters and every side effect back, exact retry succeeds',async t=>{
 const f=await organizationKickFixture(t),requestId=crypto.randomUUID(),before=await f.snapshot();
 for(const sql of ['INSERT INTO admin_logs','INSERT INTO organization_receipts_v1']){f.fail(sql);assert.equal((await f.kick({requestId})).status,503);f.fail('');assert.deepEqual(await f.snapshot(),before);}
 ok(await f.kick({requestId}));assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});

test('competing elders remove only once; old dialogs cannot remove a rejoined membership',async t=>{
 const f=await organizationKickFixture(t),results=await Promise.all([f.kick({},2),f.kick({},3)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
 await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,5,1,3,1000,$2)',[f.roundId,f.clock()]);
 assert.equal((await f.kick()).data.code,'ORG_STALE');assert.equal((await f.overview(5)).data.membership.organizationId,1);
});

test('no resumption leaves legacy history untouched and TEST access remains enforced',async t=>{
 const f=await organizationKickFixture(t,{resumed:false});ok(await f.kick());assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE user_id=5')).rows.length,1);
 const p=(await f.call('admin/organization')).data.policy;ok(await f.post('admin/organization/policy',{policy:{...p,testUserIds:[3]}}));
 assert.equal((await f.kick({targetUserId:6,revision:1})).data.code,'ORG_TEST_ONLY');
});
