import test from 'node:test';
import assert from 'node:assert/strict';
import {handleClan} from '../functions/_clan.js';
import {organizationKickFixture} from './helpers/organization-kick-fixture.mjs';

async function fixture(t,options){
 const f=await organizationKickFixture(t,options);t.mock.method(Date,'now',f.clock);
 const body={seasonId:5,targetUserId:5,joinedAt:'2026-10-29',requestId:crypto.randomUUID(),confirmation:'KICK_CLAN_MEMBER'};
 const call=async(patch={},user=2,{path='clan/member/kick',method='POST'}={})=>{
  const response=await handleClan({path,env:f.env,deps:f.deps,request:new Request('https://example.test/api/'+path,{method,headers:{'x-qa-user':String(user),'Content-Type':'application/json',Origin:'https://example.test'},...(method==='GET'?{}:{body:JSON.stringify({...body,...patch})})})});
  return {status:response.status,data:await response.json()};
 };
 return {...f,legacyBody:body,legacy:call};
}
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));

test('the actual restored clan route reaches elder removal and updates both rosters once',async t=>{
 const f=await fixture(t),before=await f.faction();
 const result=await f.legacy();ok(result);assert.equal(result.data.clanId,1);assert.equal(result.data.seasonId,5);
 assert.equal((await f.overview(5)).data.membership,null);
 assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE user_id=5')).rows.length,0);
 assert.deepEqual((await f.faction()).formations[1],{attack1:[6],defense1:[]});
 assert.deepEqual((await f.faction()).captains[1],{});assert.equal((await f.faction()).districts[0].defense,'');
 const regular=JSON.parse((await f.pg.query('SELECT state_json FROM clan_faction_state')).rows[0].state_json);
 assert.deepEqual(regular.formations[1],{attack1:[6],defense1:[]});assert.deepEqual(regular.captains[1],{});
 assert.deepEqual((await f.faction()).history,before.history);assert.deepEqual((await f.faction()).session,before.session);
 assert.equal((await f.pg.query('SELECT balance FROM qa_wallets')).rows[0].balance,9999999999999);
 ok(await f.legacy());assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
 assert.equal((await f.legacy({targetUserId:6})).data.code,'ORG_REQUEST_CONFLICT');
});

test('legacy requests still require current elder authority and protect self, elders and other clans',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 for(const [body,user,code] of [[{},6,'ORG_ELDER'],[{},1,'ORG_ELDER'],[{},4,'ORG_MEMBERSHIP'],[{targetUserId:2},2,'ORG_SELF'],[{targetUserId:3},2,'ORG_ELDER_TARGET'],[{targetUserId:7},2,'ORG_MEMBERSHIP'],[{confirmation:''},2,'ORG_CONFIRMATION'],[{seasonId:4},2,'ORG_SEASON'],[{joinedAt:'old-membership'},2,'ORG_STALE']]){
  const result=await f.legacy(body,user);assert.equal(result.data.code,code,JSON.stringify(result));
 }
 assert.deepEqual(await f.snapshot(),before);
 await f.changeFaction(s=>s.elders[1]=[3]);assert.equal((await f.legacy()).data.code,'ORG_ELDER');
 await f.changeFaction(s=>s.elders[1]=[2,3]);await f.pg.query("UPDATE users SET banned_until='2099-01-01' WHERE id=2");assert.equal((await f.legacy()).data.code,'ORG_ACCOUNT');
});

test('battle, settlement and reservation guards remain on the restored route',async t=>{
 const f=await fixture(t);
 for(const status of ['ACTIVE','CLOSING']){await f.pg.query('UPDATE clan_wars SET status=$1',[status]);const before=await f.snapshot();assert.equal((await f.legacy()).data.code,'ORG_BATTLE');assert.deepEqual(await f.snapshot(),before);}
 await f.pg.exec("UPDATE clan_wars SET status='COMPLETED';INSERT INTO clan_war_battles VALUES(5,'PENDING',5,7)");assert.equal((await f.legacy()).data.code,'ORG_BATTLE');
 await f.pg.exec("DELETE FROM clan_war_battles;INSERT INTO clan_war_reservation_locks VALUES(9,5,'2999-01-01')");assert.equal((await f.legacy()).data.code,'ORG_BATTLE');
 await f.pg.exec('DELETE FROM clan_war_reservation_locks');await f.changeFaction(s=>s.battles=[{status:'ACTIVE',endsAt:f.clock()+10000,attackers:[5],defenders:[7]}]);assert.equal((await f.legacy()).data.code,'ORG_BATTLE');
 await f.changeFaction(s=>s.battles=[]);
 for(const phase of ['SETTLEMENT','CHAMPIONS','COMPLETE']){await f.pg.query('UPDATE clan_seasons SET phase=$1',[phase]);assert.equal((await f.legacy()).data.code,'ORG_SEASON');}
});

test('audit or receipt failure rolls back both rosters; an exact retry commits once',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 for(const sql of ['INSERT INTO admin_logs','INSERT INTO organization_receipts_v1']){f.fail(sql);assert.equal((await f.legacy()).status,503);f.fail('');assert.deepEqual(await f.snapshot(),before);}
 ok(await f.legacy());ok(await f.legacy());assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});

test('old dialogs and successful retries cannot remove a rejoined member; competing elders remove once',async t=>{
 const f=await fixture(t),secondId=crypto.randomUUID();
 const results=await Promise.all([f.legacy(),f.legacy({requestId:secondId},3)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
 f.advance(1000);
 ok(await f.post('organization/join/apply',{roundId:f.roundId,revision:3,organizationId:1,message:'rejoin'},{user:5}));
 ok(await f.post('organization/join/review',{roundId:f.roundId,revision:4,userId:5,decision:'APPROVED'},{user:2}));
 await f.pg.query("UPDATE clan_members SET joined_at='2026-10-29 16:00:01' WHERE user_id=5");
 ok(await f.legacy());assert.equal((await f.legacy({requestId:crypto.randomUUID()})).data.code,'ORG_STALE');
 assert.equal((await f.overview(5)).data.membership.organizationId,1);assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE user_id=5')).rows.length,1);
});

test('only the restored POST kick route is enabled; authentication, unreleased state and recruitment locks stay enforced',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 assert.equal((await f.legacy({},0)).status,401);assert.equal((await f.legacy({},2,{method:'GET'})).status,405);
 for(const path of ['clan/register','clan/draft/pick','clan/identity','clan/admin/mode','admin/clan-war/reset-draft','admin/clan-war/champions-rewards'])assert.equal((await f.legacy({},1,{path})).data.code,'CLAN_SCHEDULE_LOCKED');
 assert.deepEqual(await f.snapshot(),before);
 await f.pg.exec("DELETE FROM app_meta WHERE key='clan_resumption_v1'");
 assert.equal((await f.legacy()).data.code,'CLAN_SCHEDULE_LOCKED');
});
