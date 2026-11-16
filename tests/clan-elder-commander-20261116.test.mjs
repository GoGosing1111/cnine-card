import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationKickFixture} from './helpers/organization-kick-fixture.mjs';
import {CLAN_ELDER_TITLE_SQL} from '../scripts/ops/clan-elder-title-20261116.mjs';
import {leaveOrganizationMember} from '../functions/_organization_member_kick.js';

async function fixture(t){
 const f=await organizationKickFixture(t),q=async(s,p=[])=>(await f.pg.query(s,p)).rows;
 await f.pg.exec(`CREATE TABLE character_titles(id bigint PRIMARY KEY,code text UNIQUE,pve_power bigint);
 INSERT INTO character_titles VALUES(1,'SPECIAL_OPS_COMMANDER',1250000),(2,'OTHER_TITLE',100);
 CREATE TABLE user_character_titles(user_id bigint,title_id bigint,source_type text NOT NULL DEFAULT 'SYSTEM',source_id text NOT NULL DEFAULT '',unlocked_at text DEFAULT CURRENT_TIMESTAMP,expires_at text,PRIMARY KEY(user_id,title_id));
 CREATE TABLE user_title_loadout(user_id bigint PRIMARY KEY,title_id bigint,updated_at text DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO user_character_titles(user_id,title_id) VALUES(5,2);
 INSERT INTO user_title_loadout(user_id,title_id) VALUES(5,2);
 INSERT INTO clan_executives VALUES(5,2,4);
 CREATE ROLE cnine_migrator;
 GRANT USAGE ON SCHEMA public TO cnine_migrator;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cnine_migrator;`);
 await f.pg.exec(CLAN_ELDER_TITLE_SQL);
 const sync=async(uid=null)=>(await q('SELECT cnine_sync_clan_elder_title_v1($1) result',[uid]))[0].result;
 assert.deepEqual(await sync(),{granted:3,revoked:0});
 const owned=async()=>q('SELECT user_id,title_id,source_type,source_id,unlocked_at,expires_at FROM user_character_titles ORDER BY title_id,user_id');
 const holders=async()=>(await owned()).filter(r=>r.title_id===1).map(r=>r.user_id);
 const equip=uid=>q('INSERT INTO user_title_loadout(user_id,title_id) VALUES($1,1) ON CONFLICT(user_id) DO UPDATE SET title_id=1',[uid]);
 const equipped=()=>q('SELECT * FROM user_title_loadout ORDER BY user_id');
 const events=()=>q('SELECT user_id,action FROM clan_elder_title_events_v1 ORDER BY id');
 return {...f,q,sync,owned,holders,equip,equipped,events};
}
test('current elders receive one role-bound title, with no auto-equip and no replay grants',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.holders(),[2,3,4]);assert.deepEqual(await f.sync(),{granted:0,revoked:0});
 assert.equal((await f.equipped()).length,1);assert.equal((await f.equipped())[0].title_id,2);
 assert.equal((await f.events()).length,3);assert((await f.owned()).filter(r=>r.title_id===1).every(r=>r.source_type==='CLAN_ELDER'&&r.expires_at===null));
});
test('demotion removes ownership and equipped 1250000 power at the same commit; promotion grants automatically',async t=>{
 const f=await fixture(t);await f.equip(2);
 await f.pg.exec('BEGIN');await f.changeFaction(s=>s.elders[1]=[3]);
 assert((await f.holders()).includes(2));await f.pg.exec('COMMIT');
 assert.deepEqual(await f.holders(),[3,4]);assert(!(await f.equipped()).some(r=>r.user_id===2));
 assert.equal((await f.q('SELECT COALESCE(sum(t.pve_power),0)::int power FROM user_title_loadout l JOIN user_character_titles u USING(user_id,title_id) JOIN character_titles t ON t.id=l.title_id WHERE l.user_id=2'))[0].power,0);
 await f.changeFaction(s=>s.elders[1]=[2,3]);assert.deepEqual(await f.holders(),[2,3,4]);
 assert(!(await f.equipped()).some(r=>r.user_id===2));
});
test('actual voluntary leave revokes title and equipment; failure rolls back the roster and title together',async t=>{
 const f=await fixture(t);await f.equip(2);f.advance(Date.parse('2026-11-16T04:00:00Z')-f.clock());
 const before={owned:await f.owned(),equipped:await f.equipped(),events:await f.events()};
 const [round]=await f.q('SELECT * FROM organization_rounds_v1 WHERE id=$1',[f.roundId]);
 const [member]=await f.q('SELECT * FROM organization_members_v1 WHERE round_id=$1 AND user_id=2',[f.roundId]);
 const body={requestId:crypto.randomUUID(),revision:round.revision,organizationId:1,joinedAt:member.joined_at,confirmation:'LEAVE_CLAN'};
 await f.pg.exec('BEGIN');await leaveOrganizationMember(f.q,{id:2,nickname:'원로'},body,round,f.clock());
 await f.pg.exec('SET CONSTRAINTS ALL IMMEDIATE');assert(!(await f.holders()).includes(2));await f.pg.exec('ROLLBACK');
 assert.deepEqual(await f.owned(),before.owned);assert.deepEqual(await f.equipped(),before.equipped);assert.deepEqual(await f.events(),before.events);
 await f.pg.exec('BEGIN');await leaveOrganizationMember(f.q,{id:2,nickname:'원로'},body,round,f.clock());await f.pg.exec('COMMIT');
 assert(!(await f.holders()).includes(2));assert(!(await f.equipped()).some(r=>r.user_id===2));
});
test('regular membership loss and executive role loss independently revoke; ordinary member labels do not remove elders',async t=>{
 const f=await fixture(t);await f.q("UPDATE clan_members SET member_role='MEMBER' WHERE user_id=3");assert((await f.holders()).includes(3));
 await f.q('DELETE FROM clan_executives WHERE user_id=3');assert(!(await f.holders()).includes(3));
 await f.q('DELETE FROM clan_members WHERE user_id=4');assert(!(await f.holders()).includes(4));
 assert.deepEqual(await f.holders(),[2]);
});
test('delete/reinsert executive refresh preserves title age, equipment and event count',async t=>{
 const f=await fixture(t);await f.equip(2);const before={owned:await f.owned(),equipped:await f.equipped(),events:await f.events()};
 await f.pg.exec('BEGIN; DELETE FROM clan_executives WHERE season_id=5 AND clan_id=1; INSERT INTO clan_executives VALUES(5,1,2),(5,1,3); COMMIT;');
 assert.deepEqual(await f.owned(),before.owned);assert.deepEqual(await f.equipped(),before.equipped);assert.deepEqual(await f.events(),before.events);
});
test('season replacement keeps continuing elders equipped and transfers eligibility to the new live roster',async t=>{
 const f=await fixture(t);await f.equip(3);const before=(await f.owned()).find(r=>r.user_id===3&&r.title_id===1);
 await f.pg.exec('BEGIN');
 await f.q("UPDATE organization_rounds_v1 SET scope='ARCHIVED:'||id WHERE id=$1",[f.roundId]);
 await f.q("INSERT INTO organization_rounds_v1(id,scope,name,phase,created_at) VALUES('new-round','LIVE','다음 시즌','ASSIGNED',$1)",[f.clock()]);
 await f.q("INSERT INTO organization_members_v1 SELECT 'new-round',user_id,organization_id,slot,seed_power,joined_at FROM organization_members_v1 WHERE round_id=$1",[f.roundId]);
 await f.pg.exec("INSERT INTO clan_seasons VALUES(6,'ACTIVE','2099-01-01'); INSERT INTO clan_members SELECT user_id,clan_id,6,member_role,joined_at,draft_pick_no FROM clan_members WHERE season_id=5; INSERT INTO clan_executives VALUES(6,1,3),(6,1,5);");
 await f.q("INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES('new-round',$1)",[JSON.stringify({elders:{1:[3,5]}})]);
 await f.q("UPDATE app_meta SET value=$1 WHERE key='clan_resumption_v1'",[JSON.stringify({enabled:true,seasonId:6,roundId:'new-round'})]);
 await f.pg.exec('COMMIT');
 assert.deepEqual(await f.holders(),[3,5]);assert.equal((await f.owned()).find(r=>r.user_id===3&&r.title_id===1).unlocked_at,before.unlocked_at);
 assert((await f.equipped()).some(r=>r.user_id===3&&r.title_id===1));assert((await f.equipped()).some(r=>r.user_id===5&&r.title_id===2));
});
test('non-elder manual grants cannot bypass the policy and stale equip fails without restoring revoked ownership',async t=>{
 const f=await fixture(t);await f.q("INSERT INTO user_character_titles(user_id,title_id,source_type) VALUES(5,1,'ADMIN')");
 assert(!(await f.holders()).includes(5));await assert.rejects(()=>f.equip(5),e=>e.code==='23514');
 await f.equip(2);await f.changeFaction(s=>s.elders[1]=[3]);await assert.rejects(()=>f.equip(2),e=>e.code==='23514');
 assert(!(await f.equipped()).some(r=>r.user_id===2));assert((await f.equipped()).some(r=>r.user_id===5&&r.title_id===2));
});
test('unrelated faction updates keep ownership and loadouts unchanged and queue no role trigger',async t=>{
 const f=await fixture(t);await f.equip(2);const before={owned:await f.owned(),equipped:await f.equipped(),events:await f.events()};
 for(let i=0;i<5;i++)await f.changeFaction(s=>s.revision=i+100);
 assert.deepEqual(await f.owned(),before.owned);assert.deepEqual(await f.equipped(),before.equipped);assert.deepEqual(await f.events(),before.events);
});

test('ordinary game database role can equip, grant and revoke through triggers without schema-owner privileges',async t=>{
 const f=await fixture(t);await f.pg.exec('SET ROLE cnine_migrator');await f.equip(2);
 await f.changeFaction(s=>s.elders[1]=[3]);assert(!(await f.holders()).includes(2));
 await f.changeFaction(s=>s.elders[1]=[2,3]);assert((await f.holders()).includes(2));
 assert.equal((await f.events()).filter(e=>e.user_id===2&&e.action==='REVOKE').length,1);
 assert.equal((await f.events()).filter(e=>e.user_id===2&&e.action==='GRANT').length,2);
 await f.pg.exec('RESET ROLE');
});
