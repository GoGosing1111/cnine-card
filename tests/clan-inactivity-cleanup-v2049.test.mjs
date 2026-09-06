import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {clanAccessMs, handleClanInactivityCleanup} from '../functions/_clan_inactivity_cleanup.js';

const NOW = Date.parse('2026-09-06T09:00:00Z');
const CONFIRM = 'REMOVE_INACTIVE_CLAN_MEMBERS_5_DAYS';
async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
    CREATE TABLE admin_logs(admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,last_login_at text,coin bigint);
    CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text);
    INSERT INTO clan_seasons VALUES(4,1,'ACTIVE'),(3,0,'COMPLETE');
    CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
    INSERT INTO clan_organizations VALUES(1,'DK',1),(2,'삼성',1),(3,'빈 클랜',1);
    CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score bigint);
    INSERT INTO clan_season_teams VALUES(4,1,1,777),(4,2,10,888),(3,1,1,999);
    CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text,joined_at text,contribution_score bigint,PRIMARY KEY(season_id,user_id));
    CREATE TABLE clan_draft_pool(season_id bigint,user_id bigint,status text,drafted_clan_id bigint,pick_no int,updated_at text,PRIMARY KEY(season_id,user_id));
    CREATE TABLE clan_wars(id bigint,season_id bigint);
    INSERT INTO clan_wars VALUES(12,4);
    CREATE TABLE clan_war_battles(season_id bigint,attacker_user_id bigint,defender_user_id bigint,status text,created_at text);
    CREATE TABLE clan_war_reservation_locks(war_id bigint,user_id bigint,expires_at text);
    CREATE TABLE sessions(user_id bigint,created_at text,expires_at text);
    CREATE TABLE attendance_logs(user_id bigint,claimed_at text);
    CREATE TABLE draw_logs(user_id bigint,created_at text);
    CREATE TABLE battle_logs(user_id bigint,created_at text);
  `);
  for (let id = 1; id <= 10; id++) {
    const at = id === 1 ? '2026-09-06 00:00:00' : id === 5 ? null : id === 3 ? '2026-09-01T09:00:00Z' : '2026-08-25 00:00:00';
    await pg.query('INSERT INTO users VALUES($1,$2,$3,9000000000)', [id, `QA${id}`, at]);
    await pg.query('INSERT INTO clan_members VALUES(4,$1,$2,$3,$4,123)', [id === 10 ? 2 : 1,id,[1,10].includes(id) ? 'MASTER' : 'MEMBER','2026-09-03T12:00:00Z']);
    await pg.query("INSERT INTO clan_draft_pool VALUES(4,$1::bigint,'DRAFTED',$2,$1::integer,NULL)",[id,id === 10 ? 2 : 1]);
  }
  await pg.exec(`
    INSERT INTO clan_members VALUES(3,1,2,'MEMBER','2026-08-01',99);
    INSERT INTO attendance_logs VALUES(4,'2026-09-05 12:00:00');
    INSERT INTO sessions VALUES(2,'2026-08-25','2026-09-25');
    INSERT INTO clan_war_battles VALUES(4,1,6,'COMPLETED','2026-09-06 08:00:00');
    INSERT INTO clan_war_battles VALUES(4,1,7,'PENDING','2026-09-06 08:00:00');
  `);
  let failAudit = false;
  const client = {async query(input) {
    const text = typeof input === 'string' ? input : input.text;
    if (failAudit && text.includes('INSERT INTO admin_logs')) throw new Error('QA audit failure');
    const result = await pg.query(text, typeof input === 'string' ? [] : input.values || []);
    return {...result, rowCount: result.affectedRows ?? result.rows.length};
  }};
  const env = {DB: new __postgresCompatTest.PostgresD1Database(client)};
  const call = (body, options = {}) => handleClanInactivityCleanup({env, now: options.now ?? NOW,
    user: {id: 1, role: options.role || 'OWNER'}, deps: {readBody: r => r.json(), json: (body,status=200) => ({body,status})},
    request: new Request('https://qa.test/api/admin/clan-war/inactivity-cleanup', body ? {method: 'POST', body: JSON.stringify(body)} : {})});
  const preview = async () => {const result = await call({action:'preview'});assert.equal(result.status,200,JSON.stringify(result));return result.body;};
  const apply = (id, options) => call({action:'apply', previewId:id, confirmation:CONFIRM},options);
  return {pg,call,preview,apply,failAudit(){failAudit=true;},close:()=>pg.close()};
}

test('timestamps use UTC for legacy strings and exact five-day inclusive cutoff', () => {
  assert.equal(clanAccessMs('2026-09-01 09:00:00'), NOW - 5*86400000);
  assert.equal(clanAccessMs('2026-09-01T18:00:00+09:00'), NOW - 5*86400000);
  assert(Number.isNaN(clanAccessMs(null)));
});

test('preview does not remove anyone; actual activity protects stale logins, passive defense/valid sessions do not',async()=>{
  const f = await fixture();
  try {
    const report = await f.preview();
    assert.deepEqual(report.candidates.map(r=>r.userId),[2,3,6,8,9]);
    assert.deepEqual(report.exceptions.map(r=>[r.userId,r.state]),[[5,'UNKNOWN'],[7,'BATTLE_BUSY'],[10,'MASTER_REVIEW']]);
    assert.equal(report.roster.find(r=>r.userId===4).state,'ACTIVE');
    assert.equal(report.totalMembers,10);assert.equal(report.clans.length,3);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members')).rows[0].n),11);
  } finally {await f.close();}
});

test('apply revalidates login, real activity and membership; audits recovery and replays exactly once',async()=>{
  const f = await fixture();
  try {
    const preview = await f.preview();
    await f.pg.exec("UPDATE users SET last_login_at='2026-09-06 08:30:00' WHERE id=8; INSERT INTO draw_logs VALUES(9,'2026-09-06 08:30:00'); UPDATE clan_members SET joined_at='2026-09-06 08:31:00' WHERE season_id=4 AND user_id=6;");
    const result = await f.apply(preview.previewId);
    assert.equal(result.status,200,JSON.stringify(result));assert.deepEqual(result.body.removed.map(r=>r.userId),[2,3]);
    assert.equal(result.body.skipped.length,3);assert.equal(result.body.totalMembers,8);
    assert.equal(result.body.clans[0].memberCount,7);assert.equal(result.body.clans[2].memberCount,0);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=3')).rows.length,1);
    assert.equal(Number((await f.pg.query('SELECT MIN(coin) n FROM users')).rows[0].n),9000000000);
    assert.equal(Number((await f.pg.query('SELECT score FROM clan_season_teams WHERE season_id=4 AND clan_id=1')).rows[0].score),777);
    const stored=JSON.parse((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[result.body.recoveryKey])).rows[0].value);
    assert.equal(stored.membersBefore.length,2);assert.equal(stored.draftBefore[0].status,'DRAFTED');
    assert.equal((await f.pg.query('SELECT status FROM clan_draft_pool WHERE season_id=4 AND user_id=2')).rows[0].status,'WITHDRAWN');
    const replay = await f.apply(preview.previewId);assert.equal(replay.body.replayed,true);assert.equal(replay.body.removedCount,2);
    assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
  } finally {await f.close();}
});

test('audit failure rolls all membership, draft, and receipt changes back',async()=>{
  const f=await fixture();
  try {
    const preview=await f.preview();f.failAudit();const result=await f.apply(preview.previewId);
    assert.equal(result.status,409);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),10);
    assert.equal((await f.pg.query('SELECT status FROM clan_draft_pool WHERE user_id=2')).rows[0].status,'DRAFTED');
    assert.equal(JSON.parse((await f.pg.query('SELECT value FROM app_meta')).rows[0].value).status,'PREVIEW');
  }finally{await f.close();}
});

test('non-owner, missing confirmation, expired preview, changed season and missing activity schema fail closed',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.call({action:'preview'},{role:'ADMIN'})).status,403);
    assert.equal((await f.call({action:'apply'})).status,400);
    const p=await f.preview();
    assert.equal((await f.apply(p.previewId,{now:NOW+16*60000})).status,409);
    await f.pg.exec("INSERT INTO clan_seasons VALUES(5,2,'ACTIVE')");
    assert.equal((await f.apply(p.previewId)).status,409);
    await f.pg.exec("UPDATE clan_seasons SET phase='COMPLETE' WHERE id=5; DROP TABLE attendance_logs");
    assert.equal((await f.apply(p.previewId)).status,409);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),10);
  }finally{await f.close();}
});
