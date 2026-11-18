import test from 'node:test';import assert from 'node:assert/strict';
import {seasonKickFixture} from './helpers/clan-season-kick-fixture.mjs';
import {CLAN_MEMBER_KICK_ENABLED} from '../shared/clan-member-kick-policy-v1.mjs';
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));
test('season five elders can remove only their ordinary members, atomically and once, through the real organization route',async t=>{
 assert.equal(CLAN_MEMBER_KICK_ENABLED,true);const f=await seasonKickFixture(t),view=await f.view(2),normal=await f.view(5),before=await f.q('SELECT user_id,clan_id FROM clan_members WHERE season_id=$1 ORDER BY user_id',[f.season.seasonId]);
 assert.equal(view.join.canReview,true);assert.deepEqual(view.roster.filter(m=>m.canKick).map(m=>m.userId).sort((a,b)=>a-b),[5,6,7,8,9,10]);assert(normal.roster.every(m=>!m.canKick));
 const target=view.roster.find(m=>m.userId===5),body={requestId:crypto.randomUUID(),roundId:f.season.roundId,revision:view.round.revision,targetUserId:5,joinedAt:target.joinedAt,confirmation:'KICK_CLAN_MEMBER'};
 const kick=(actor,patch={})=>f.post('organization/member/kick',{...body,...patch},{user:actor});
 for(const [actor,patch,code] of [[5,{},'ORG_SELF'],[6,{},'ORG_ELDER'],[1,{},'ORG_ELDER'],[4,{},'ORG_MEMBERSHIP'],[2,{targetUserId:3},'ORG_ELDER_TARGET']])assert.equal((await kick(actor,patch)).data.code,code);
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await kick(2)).status,503);f.fail('');assert.deepEqual(await f.q('SELECT user_id,clan_id FROM clan_members WHERE season_id=$1 ORDER BY user_id',[f.season.seasonId]),before);
 ok(await kick(2));ok(await kick(2));
 for(const table of ['organization_members_v1','clan_members'])assert.equal((await f.q('SELECT user_id FROM '+table+' WHERE '+(table==='clan_members'?'season_id':'round_id')+'=$1 AND user_id=5',[table==='clan_members'?f.season.seasonId:f.season.roundId])).length,0);
 assert.equal((await f.q("SELECT * FROM admin_logs WHERE action_type='ORGANIZATION_ELDER_MEMBER_KICK' AND target_id='5'")).length,1);
 assert.deepEqual((await f.q('SELECT user_id,clan_id FROM clan_members WHERE season_id=$1 ORDER BY user_id',[f.season.seasonId])),before.filter(x=>Number(x.user_id)!==5));
 assert.equal((await f.view(5)).membership,null);assert.equal((await f.view(5)).join.canApply,true);await f.tick();assert.equal((await f.view(5)).membership,null);
 ok(await f.apply(5));const pending=(await f.view(2)).join.applications.find(a=>a.userId===5);assert(pending);ok(await f.review(2,5,{revision:pending.revision}));
 ok(await kick(2));assert.equal((await f.view(5)).membership.organizationId,7);assert.equal((await kick(2,{requestId:crypto.randomUUID()})).data.code,'ORG_STALE');
});
