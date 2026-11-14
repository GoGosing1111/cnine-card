import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarFixture} from './helpers/clan-review-fixture.mjs';
import {organizationKickFixture} from './helpers/organization-kick-fixture.mjs';
import {clanRejoinKey,CLAN_REJOIN_DELAY_MS} from '../functions/_organization_rejoin.js';

const day=86400000;

test('manual review keeps pending applicants out, prevents rejected reapplication and allocates approved active candidates once',async t=>{
 const f=await calendarFixture(t);
 for(const user of [2,3,4,5,6])assert.equal((await f.send('apply',user)).status,200);
 const decisions=[{userId:2,decision:'APPROVED'},{userId:3,decision:'REJECTED'},{userId:4,decision:'APPROVED'},{userId:6,decision:'APPROVED'}];
 assert.equal((await f.reviewApplicants(decisions,{},2)).status,403);
 const stale=(await f.view()).elderSeason.revision;
 assert.equal((await f.reviewApplicants(decisions)).status,200);
 assert.equal((await f.reviewApplicants(decisions,{revision:stale})).data.code,'ORG_STALE');
 const mine=(await f.view(2)).elderSeason;assert.equal(mine.reviewStatus,'APPROVED');assert.equal(mine.selected,false);assert.equal(mine.applicants,undefined);
 assert.equal((await f.view(3)).elderSeason.reviewStatus,'REJECTED');assert.equal((await f.view(5)).elderSeason.reviewStatus,'PENDING');
 assert.equal((await f.send('cancel',3)).status,200);assert.equal((await f.send('apply',3)).data.code,'ORG_ELDER_REJECTED');
 assert.equal((await f.send('cancel',2)).status,200);assert.equal((await f.send('apply',2)).status,200);
 assert.equal((await f.view(2)).elderSeason.rejoin.blocked,false,'Cancelling an application is not leaving a clan');
 await f.q("UPDATE users SET status='SUSPENDED' WHERE id=4");
 await f.q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[clanRejoinKey({scope:'LIVE'},6),JSON.stringify({leftAt:f.clock(),availableAt:f.clock()+7*day})]);
 f.advance(f.c.elderClosesAt-f.clock());await f.tick();
 const drawn=(await f.view()).elderSeason;
 assert.deepEqual(Object.values(drawn.selections).flat(),[2]);assert.equal((await f.tick()).changed,false);
 assert.deepEqual((await f.view()).elderSeason.selections,drawn.selections);
});

test('review rejects more than 24 approvals and rolls decisions/audit back when receipt fails',async t=>{
 const f=await calendarFixture(t);
 const applications=Object.fromEntries(Array.from({length:25},(_,i)=>[i+2,{nickname:'지원자 '+i,appliedAt:f.clock()+i,power:2000}]));
 await f.q("UPDATE app_meta SET value=jsonb_set(value::jsonb,'{applications}',$2::jsonb)::text WHERE key=$1",[f.windowKey,JSON.stringify(applications)]);
 const before=(await f.q('SELECT value FROM app_meta WHERE key=$1',[f.windowKey]))[0].value;
 assert.equal((await f.reviewApplicants(Object.keys(applications).map(id=>({userId:Number(id),decision:'APPROVED'})))).data.code,'ORG_ELDER_FULL');
 assert.equal((await f.q('SELECT value FROM app_meta WHERE key=$1',[f.windowKey]))[0].value,before);
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await f.reviewApplicants([{userId:2,decision:'APPROVED'}])).status,503);f.fail('');
 assert.equal((await f.q('SELECT value FROM app_meta WHERE key=$1',[f.windowKey]))[0].value,before);
 assert.equal((await f.q("SELECT * FROM admin_logs WHERE action_type='CLAN_ELDER_APPLICATION_REVIEW'")).length,0);
});

test('scheduled member and elder departures atomically clear future seats, preserve old season and block all clans across rounds for exactly seven days',async t=>{
 const f=await calendarFixture(t);await f.send('apply',2);await f.reviewApplicants([{userId:2,decision:'APPROVED'}]);
 f.advance(f.c.elderClosesAt-f.clock());await f.tick();await f.send('join',131,{organizationId:8});
 const oldRoster=await f.q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY user_id',[f.roundId]);
 const requestId='qa-calendar-leave-once';const before=await f.view(131);
 const body={roundId:f.roundId,revision:before.round.revision,organizationId:8,windowRevision:before.elderSeason.revision,confirmation:'LEAVE_CLAN',requestId};
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await f.post('organization/member/leave',body,{user:131})).status,503);f.fail('');
 assert.equal((await f.view(131)).elderSeason.memberClubId,8);assert.equal((await f.view(131)).rejoin.blocked,false);
 const left=await f.post('organization/member/leave',body,{user:131});assert.equal(left.status,200);assert.equal(left.data.rejoinAvailableAt,f.clock()+7*day);
 f.advance(1000);assert.deepEqual((await f.post('organization/member/leave',body,{user:131})).data,left.data);
 assert.equal((await f.send('join',131,{organizationId:1})).data.code,'ORG_REJOIN_WAIT');
 assert.equal((await f.leave(2)).status,200);assert.equal((await f.view(2)).elderSeason.selected,false);
 assert.deepEqual(await f.q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY user_id',[f.roundId]),oldRoster);
 // A new LIVE round uses the same account restriction; exactly 168h permits joining.
 await f.q("UPDATE organization_rounds_v1 SET scope='ARCHIVED:'||id WHERE id=$1",[f.roundId]);
 await f.q("INSERT INTO organization_rounds_v1(id,scope,name,phase,created_at) VALUES('next-round','LIVE','next','ASSIGNED',$1)",[f.clock()]);
 const apply=()=>f.post('organization/join/apply',{roundId:'next-round',revision:0,organizationId:1,message:''},{user:131});
 f.advance(left.data.rejoinAvailableAt-f.clock()-1);assert.equal((await apply()).data.code,'ORG_REJOIN_WAIT');
 f.advance(1);assert.equal((await apply()).status,200);
 assert.equal(CLAN_REJOIN_DELAY_MS,7*day);
});

test('active season self-leave removes membership, formations and elder authority; battle/receipt failures do not start cooldown',async t=>{
 const f=await organizationKickFixture(t);f.advance(Date.parse('2026-11-14T16:00:00+09:00')-f.clock());
 const leave=async(user=5,extra={})=>{const s=(await f.overview(user)).data;return f.post('organization/member/leave',{roundId:f.roundId,revision:s.round.revision,organizationId:s.membership.organizationId,joinedAt:s.membership.joinedAt,confirmation:'LEAVE_CLAN',...extra},{user});};
 const before=await f.snapshot();
 await f.changeFaction(s=>s.battles=[{id:'busy',status:'ACTIVE',endsAt:f.clock()+10000,attackers:[5],defenders:[]}]);
 assert.equal((await leave()).data.code,'ORG_BATTLE');await f.changeFaction(s=>s.battles=[]);
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await leave()).status,503);f.fail('');
 assert.equal((await f.overview(5)).data.membership.organizationId,1);assert.equal((await f.overview(5)).data.rejoin.blocked,false);
 assert.equal((await leave()).status,200);
 const after=await f.snapshot();assert.equal(after.clan_members.some(m=>Number(m.user_id)===5),false);assert.equal(after.organization_members_v1.some(m=>Number(m.user_id)===5),false);
 assert.deepEqual(after.qa_wallets,before.qa_wallets);assert.deepEqual((await f.faction()).formations[1],{attack1:[6],defense1:[]});
 assert.equal((await f.overview(5)).data.rejoin.blocked,true);
 await f.pg.query('INSERT INTO clan_season_teams VALUES(5,1,2)');
 assert.equal((await leave(2)).status,200);assert.deepEqual((await f.faction()).elders[1],[3]);
 assert.equal(Number((await f.pg.query('SELECT master_user_id FROM clan_season_teams WHERE season_id=5 AND clan_id=1')).rows[0].master_user_id),3);
 assert.equal((await f.pg.query('SELECT member_role FROM clan_members WHERE season_id=5 AND user_id=3')).rows[0].member_role,'MASTER');
 assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[clanRejoinKey({scope:'LIVE'},2)])).rows.length,1);
});
