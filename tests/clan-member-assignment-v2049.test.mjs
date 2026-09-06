import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleClanMemberAssignment} from '../functions/_clan_member_assignment.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const NOW=Date.parse('2026-09-06T09:00:00Z');
async function fixture({count=21}={}) {
  const pg=new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
    CREATE TABLE admin_logs(admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint);
    INSERT INTO users VALUES(2,'QAෆ','ACTIVE','USER',9000000000),(3,'QA2','ACTIVE','USER',8000000000);
    CREATE TABLE user_second_verifications(user_id bigint,provider text);
    INSERT INTO user_second_verifications VALUES(2,'PLAYDK'),(3,'PLAYDK');
    CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,max_members int);
    INSERT INTO clan_seasons VALUES(4,1,'ACTIVE',22),(3,0,'COMPLETE',22);
    CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
    INSERT INTO clan_organizations VALUES(6,'롯데',1),(8,'DC',1);
    CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score bigint);
    INSERT INTO clan_season_teams VALUES(4,6,100,777),(4,8,200,999);
    CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text,preferred_role text,draft_pick_no int,
      contribution_score bigint DEFAULT 0,battle_wins int DEFAULT 0,battle_losses int DEFAULT 0,joined_at text,updated_at text,PRIMARY KEY(season_id,user_id));
    CREATE TABLE clan_draft_pool(season_id bigint,user_id bigint,candidate_key text,preferred_role text,activity_window text,deck_snapshot text,status text,
      drafted_clan_id bigint,pick_no int,registered_at text,updated_at text,total_score bigint DEFAULT 0,PRIMARY KEY(season_id,user_id),UNIQUE(season_id,candidate_key));
    CREATE TABLE clan_wars(id bigint,season_id bigint);
    CREATE TABLE clan_war_battles(season_id bigint,attacker_user_id bigint,defender_user_id bigint,status text);
    CREATE TABLE clan_war_reservation_locks(user_id bigint,war_id bigint,expires_at text);
    CREATE TABLE pvp_decks(user_id bigint,card_ids text);
    CREATE TABLE pvp_deck_presets(user_id bigint,preset_no int,card_ids text);
    CREATE TABLE pvp_active_presets(user_id bigint,preset_no int);
    INSERT INTO pvp_decks VALUES(2,'["1","2","3","4","5"]'),(3,'["6","7","8","9","10"]');
    INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(3,8,2,'MEMBER');
  `);
  for(let i=0;i<count;i++) {
    await pg.query("INSERT INTO users VALUES($1,$2,'ACTIVE','USER',100)",[100+i,'Member '+(100+i)]);
    await pg.query("INSERT INTO clan_members(season_id,clan_id,user_id,member_role,preferred_role,joined_at) VALUES(4,6,$1,'MEMBER','BALANCED','2026-09-01')",[100+i]);
  }
  let failAudit=false,failSql=null;
  const client={async query(input) {
    const text=typeof input==='string'?input:input.text;
    if(failAudit&&text.includes('INSERT INTO admin_logs'))throw new Error('QA audit failure');
    if(failSql&&text.includes(failSql))throw new Error('QA targeted write failure');
    const result=await pg.query(text,typeof input==='string'?[]:input.values||[]);
    return {...result,rowCount:result.affectedRows??result.rows.length};
  }};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const call=(body,options={})=>handleClanMemberAssignment({env,now:options.now??NOW,user:{id:options.ownerId??1,role:options.role||'OWNER'},
    request:new Request('https://qa.test/api/admin/clan-war/member-assignment',{method:options.method||'POST',...(options.method==='GET'?{}:{body:JSON.stringify(body)})}),
    deps:{readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
  const preview=(extra={})=>call({action:'preview',userId:2,nickname:'QAෆ',clanId:6,clanName:'롯데',seasonId:4,...extra});
  const apply=(previewId,options)=>call({action:'apply',previewId,confirmation:'ASSIGN_UNAFFILIATED_CLAN_MEMBER'},options);
  return {pg,env,call,preview,apply,failAudit(){failAudit=true;},failOn(sql){failSql=sql;},close:()=>pg.close()};
}

test('last-slot admission is audited, exactly once, and leaves old seasons, wallet and clan scores unchanged',async()=>{
  const f=await fixture();
  try {
    const p=await f.preview();assert.equal(p.status,200,JSON.stringify(p));assert.equal(p.body.memberCount,21);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=2')).rows.length,0);
    const r=await f.apply(p.body.previewId);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.memberCount,22);
    const m=(await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=2')).rows[0];
    assert.equal(Number(m.clan_id),6);assert.equal(m.member_role,'MEMBER');assert.equal(Number(m.contribution_score),0);
    const pool=(await f.pg.query('SELECT * FROM clan_draft_pool WHERE user_id=2')).rows[0];assert.equal(pool.status,'DRAFTED');assert.equal(Number(pool.drafted_clan_id),6);
    assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=2')).rows[0].coin),9000000000);
    assert.equal(Number((await f.pg.query('SELECT score FROM clan_season_teams WHERE clan_id=6')).rows[0].score),777);
    assert.equal(Number((await f.pg.query('SELECT clan_id FROM clan_members WHERE season_id=3 AND user_id=2')).rows[0].clan_id),8);
    assert.equal((await f.apply(p.body.previewId)).body.replayed,true);
    assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
    const audit=JSON.parse((await f.pg.query('SELECT value FROM app_meta')).rows[0].value);
    assert.equal(audit.before.membership,null);assert.equal(audit.before.draftPool,null);assert.equal(Number(audit.after.membership.clan_id),6);
  }finally{await f.close();}
});

test('two previews for the final slot cannot overbook; existing draft metadata is preserved',async()=>{
  const f=await fixture();
  try {
    await f.pg.exec("INSERT INTO clan_draft_pool VALUES(4,2,'original','ATTACK','EVENING','[]','AVAILABLE',NULL,NULL,'2026-08-01',NULL,321)");
    const a=await f.preview(),b=await f.preview({userId:3,nickname:'QA2'});
    assert.equal((await f.apply(a.body.previewId)).status,200);
    assert.equal((await f.apply(b.body.previewId)).status,409);
    const row=(await f.pg.query('SELECT * FROM clan_draft_pool WHERE user_id=2')).rows[0];
    assert.equal(row.candidate_key,'original');assert.equal(Number(row.total_score),321);assert.equal(row.registered_at,'2026-08-01');
    assert.equal((await f.pg.query('SELECT preferred_role FROM clan_members WHERE season_id=4 AND user_id=2')).rows[0].preferred_role,'ATTACK');
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4 AND clan_id=6')).rows[0].n),22);
  }finally{await f.close();}
});

test('identity, authentication, verification, membership and changed-season checks fail closed',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.call({action:'preview'},{role:'ADMIN'})).status,403);
    assert.equal((await f.call({},{method:'GET'})).status,405);
    assert.equal((await f.preview({nickname:'QA'})).status,409);
    assert.equal((await f.preview({clanName:'DC'})).status,409);
    const p=await f.preview();
    assert.equal((await f.apply(p.body.previewId,{now:NOW+16*60000})).status,409);
    await f.pg.exec("DELETE FROM user_second_verifications WHERE user_id=2");assert.equal((await f.apply(p.body.previewId)).status,409);
    await f.pg.exec("INSERT INTO user_second_verifications VALUES(2,'PLAYDK'); INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(4,8,2,'MEMBER')");
    assert.equal((await f.apply(p.body.previewId)).status,409);
    await f.pg.exec("DELETE FROM clan_members WHERE season_id=4 AND user_id=2; UPDATE clan_seasons SET phase='SETTLEMENT' WHERE id=4");
    assert.equal((await f.apply(p.body.previewId)).status,409);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=2')).rows.length,0);
  }finally{await f.close();}
});

test('audit failure rolls membership and draft changes back together',async()=>{
  const f=await fixture();
  try {
    const p=await f.preview();f.failAudit();assert.equal((await f.apply(p.body.previewId)).status,409);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=2')).rows.length,0);
    assert.equal((await f.pg.query('SELECT * FROM clan_draft_pool WHERE user_id=2')).rows.length,0);
    assert.equal(JSON.parse((await f.pg.query('SELECT value FROM app_meta')).rows[0].value).status,'PREVIEW');
  }finally{await f.close();}
});

const removeMembers=[{userId:101,nickname:'Member 101'},{userId:102,nickname:'Member 102'}];
const replace=(f,previewId,extra={},options={})=>f.call({action:'apply',previewId,confirmation:'REPLACE_EXPLICIT_CLAN_MEMBERS',...extra},options);
async function seedRemovalHistory(f) {
  await f.pg.exec(`
    UPDATE clan_members SET contribution_score=444,battle_wins=12,battle_losses=3 WHERE season_id=4 AND user_id=101;
    INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(3,8,101,'MEMBER');
    INSERT INTO clan_draft_pool VALUES(4,101,'old101','ATTACK','EVENING','["a"]','DRAFTED',6,5,'2026-08-01','2026-09-01',500),
      (4,102,'old102','DEFENSE','FLEX','["b"]','DRAFTED',6,6,'2026-08-01','2026-09-01',600);
    INSERT INTO clan_wars VALUES(11,4);
    INSERT INTO clan_war_battles VALUES(4,101,200,'COMPLETED');
  `);
}

test('full-clan replacement removes only the named two, admits one, preserves history and keeps a recovery record',async()=>{
  const f=await fixture({count:22});
  try {
    await seedRemovalHistory(f);
    const p=await f.preview({removeMembers});
    assert.equal(p.status,200,JSON.stringify(p));assert.equal(p.body.afterCount,21);
    assert.equal(p.body.confirmation,'REPLACE_EXPLICIT_CLAN_MEMBERS');
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),22);
    assert.equal((await f.apply(p.body.previewId)).status,400);
    // The apply body cannot replace the server-owned, explicitly reviewed list.
    const r=await replace(f,p.body.previewId,{removeMembers:[{userId:103,nickname:'Member 103'}]});
    assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.memberCount,21);assert.equal(r.body.removedCount,2);
    assert.deepEqual(r.body.removed.map(m=>m.userId),[101,102]);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id IN (101,102)')).rows.length,0);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id IN (2,100,103)')).rows.length,3);
    const pools=(await f.pg.query('SELECT * FROM clan_draft_pool WHERE user_id IN (101,102) ORDER BY user_id')).rows;
    assert.ok(pools.every(p=>p.status==='WITHDRAWN'&&p.drafted_clan_id===null&&p.pick_no===null));
    assert.equal(pools[0].candidate_key,'old101');assert.equal(Number(pools[0].total_score),500);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=3 AND user_id=101')).rows.length,1);
    assert.equal((await f.pg.query('SELECT * FROM clan_war_battles')).rows.length,1);
    assert.equal(Number((await f.pg.query('SELECT score FROM clan_season_teams WHERE clan_id=6')).rows[0].score),777);
    assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=101')).rows[0].coin),100);
    const log=(await f.pg.query('SELECT * FROM admin_logs')).rows[0];assert.equal(log.action_type,'CLAN_MEMBER_REPLACEMENT');
    const before=JSON.parse(log.before_data);assert.equal(before.removedMemberships.length,2);
    assert.equal(Number(before.removedMemberships[0].contribution_score),444);assert.equal(before.removedDraftPool.length,2);
    assert.equal((await replace(f,p.body.previewId)).body.replayed,true);
    assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
  }finally{await f.close();}
});

test('replacement rejects malformed, duplicate, foreign-clan, wrong-name, master and self removal targets',async()=>{
  const f=await fixture({count:22});
  try {
    for(const invalid of [null,{},[],Array(22).fill(removeMembers[0]),[null],[{userId:'101',nickname:'Member 101'}],
      [removeMembers[0],removeMembers[0]],[{userId:2,nickname:'QAෆ'}]]) {
      assert.equal((await f.preview({removeMembers:invalid})).status,400);
    }
    for(const invalid of [[{userId:100,nickname:'Member 100'}],[{userId:101,nickname:'Wrong name'}],[{userId:999,nickname:'Missing'}]]) {
      assert.equal((await f.preview({removeMembers:invalid})).status,409);
    }
    await f.pg.exec('UPDATE clan_members SET clan_id=8 WHERE season_id=4 AND user_id=101');
    assert.equal((await f.preview({removeMembers})).status,409);
    assert.equal((await f.pg.query('SELECT * FROM app_meta')).rows.length,0);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),22);
  }finally{await f.close();}
});

test('pending attacks, pending defense and live reservations block every affected account before removal',async()=>{
  const f=await fixture({count:22});
  try {
    await f.pg.exec('INSERT INTO clan_wars VALUES(11,4)');
    const p=await f.preview({removeMembers});assert.equal(p.status,200);
    for(const id of [2,101,102]) {
      await f.pg.query("INSERT INTO clan_war_battles VALUES(4,$1,200,'PENDING')",[id]);
      assert.equal((await replace(f,p.body.previewId)).status,409);
      await f.pg.exec('DELETE FROM clan_war_battles');
      await f.pg.query("INSERT INTO clan_war_battles VALUES(4,200,$1,'RESOLVING')",[id]);
      assert.equal((await f.preview({removeMembers})).status,409);
      await f.pg.exec('DELETE FROM clan_war_battles');
      await f.pg.query("INSERT INTO clan_war_reservation_locks VALUES($1,11,'2099-01-01T00:00:00Z')",[id]);
      assert.equal((await replace(f,p.body.previewId)).status,409);
      await f.pg.exec('DELETE FROM clan_war_reservation_locks');
    }
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),22);
    assert.equal((await replace(f,p.body.previewId)).status,200);
  }finally{await f.close();}
});

test('preview membership identity, ownership, admission eligibility and expiry are revalidated for replacement',async()=>{
  const f=await fixture({count:22});
  try {
    const p=await f.preview({removeMembers});assert.equal(p.status,200);
    assert.equal((await replace(f,p.body.previewId,{}, {ownerId:99})).status,403);
    assert.equal((await replace(f,p.body.previewId,{}, {now:NOW+16*60000})).status,409);
    await f.pg.exec("UPDATE clan_members SET joined_at='2026-09-02' WHERE season_id=4 AND user_id=101");
    assert.equal((await replace(f,p.body.previewId)).status,409);
    await f.pg.exec("UPDATE clan_members SET joined_at='2026-09-01' WHERE season_id=4 AND user_id=101; UPDATE users SET nickname='Changed' WHERE id=101");
    assert.equal((await replace(f,p.body.previewId)).status,409);
    await f.pg.exec("UPDATE users SET nickname='Member 101' WHERE id=101; UPDATE clan_season_teams SET master_user_id=101 WHERE clan_id=6");
    assert.equal((await replace(f,p.body.previewId)).status,409);
    await f.pg.exec("UPDATE clan_season_teams SET master_user_id=100 WHERE clan_id=6; UPDATE pvp_decks SET card_ids='[]' WHERE user_id=2");
    assert.equal((await replace(f,p.body.previewId)).status,409);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),22);
    assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,0);
  }finally{await f.close();}
});

test('replacement audit failure restores both outgoing members, their draft state and incoming admission',async()=>{
  const f=await fixture({count:22});
  try {
    await seedRemovalHistory(f);
    const members=(await f.pg.query('SELECT * FROM clan_members ORDER BY season_id,user_id')).rows;
    const drafts=(await f.pg.query('SELECT * FROM clan_draft_pool ORDER BY user_id')).rows;
    const p=await f.preview({removeMembers});assert.equal(p.status,200);
    f.failAudit();assert.equal((await replace(f,p.body.previewId)).status,409);
    assert.deepEqual((await f.pg.query('SELECT * FROM clan_members ORDER BY season_id,user_id')).rows,members);
    assert.deepEqual((await f.pg.query('SELECT * FROM clan_draft_pool ORDER BY user_id')).rows,drafts);
    assert.equal(JSON.parse((await f.pg.query('SELECT value FROM app_meta')).rows[0].value).status,'PREVIEW');
  }finally{await f.close();}
});

test('competing replacements cannot reuse previously removed members as free capacity',async()=>{
  const f=await fixture({count:22});
  try {
    const a=await f.preview({removeMembers}),b=await f.preview({removeMembers,userId:3,nickname:'QA2'});
    assert.equal(a.status,200);assert.equal(b.status,200);
    assert.equal((await replace(f,a.body.previewId)).status,200);
    assert.equal((await replace(f,b.body.previewId)).status,409);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=3')).rows.length,0);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM clan_members WHERE season_id=4')).rows[0].n),21);
  }finally{await f.close();}
});

const clanGift={coin:3000000000,title:'롯데 클랜 지원금',body:'롯데 클랜원에게 30억 코인을 지급합니다. 메시지에서 수령해 주세요.'};
async function transferFixture({legacy=false}={}) {
  const f=await fixture({count:22});
  await f.pg.exec(`
    INSERT INTO users VALUES(200,'Other master','ACTIVE','USER',100);
    INSERT INTO clan_members(season_id,clan_id,user_id,member_role,joined_at,contribution_score,battle_wins,battle_losses)
      VALUES(4,8,2,'MEMBER','2026-09-01',777,12,3),(4,8,200,'MASTER','2026-09-01',0,0,0);
    INSERT INTO clan_draft_pool VALUES(4,2,'transfer-2','SPEED','EVENING','["1","2","3","4","5"]','DRAFTED',8,7,'2026-08-01',NULL,1234);
    ALTER TABLE users ADD COLUMN card_shards bigint DEFAULT 0;
    CREATE TABLE user_messages(id bigserial PRIMARY KEY,user_id bigint NOT NULL,sender_type text,title text,body text,message_type text,
      campaign_key text,is_read integer DEFAULT 0,read_at text,hidden_at text);
    CREATE UNIQUE INDEX messages_campaign_user ON user_messages(user_id,campaign_key);
    CREATE TABLE user_message_rewards(id bigserial PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,
      reward_amount ${legacy?'integer':'bigint'},claimed_at text);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,
      reward_type text,reward_amount ${legacy?'integer':'bigint'},claim_token text UNIQUE,balance_before ${legacy?'integer':'bigint'},
      balance_after ${legacy?'integer':'bigint'},source text,credited_at text);
    CREATE TABLE coin_logs(user_id bigint,change_amount ${legacy?'integer':'bigint'},balance_after ${legacy?'integer':'bigint'},reason text);
  `);
  f.transferPreview=(extra={})=>f.preview({fromClanId:8,fromClanName:'DC',removeMembers:[removeMembers[0]],clanGift,...extra});
  f.transferApply=(previewId,extra={})=>f.call({action:'apply',previewId,confirmation:'APPLY_CLAN_CHANGE_AND_COIN_MESSAGES',...extra});
  return f;
}

test('transfer plus 3 billion messages targets the final 22 only and preserves personal stats, wallets and source scores',async()=>{
  const f=await transferFixture();
  try {
    const p=await f.transferPreview();assert.equal(p.status,200,JSON.stringify(p));
    assert.equal(p.body.currentMembership.clanId,8);assert.equal(p.body.gift.sent,22);assert.equal(p.body.gift.totalCoin,66000000000);
    assert.ok(!p.body.gift.recipients.some(r=>r.userId===101));assert.ok(p.body.gift.recipients.some(r=>r.userId===2));
    assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
    assert.equal((await replace(f,p.body.previewId)).status,400);
    const r=await f.transferApply(p.body.previewId);assert.equal(r.status,200,JSON.stringify(r));
    assert.equal(r.body.memberCount,22);assert.equal(r.body.sourceAfterCount,1);assert.equal(r.body.gift.sent,22);
    const incoming=(await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=2')).rows[0];
    assert.equal(Number(incoming.clan_id),6);assert.equal(Number(incoming.contribution_score),777);assert.equal(incoming.battle_wins,12);
    const pool=(await f.pg.query('SELECT * FROM clan_draft_pool WHERE season_id=4 AND user_id=2')).rows[0];
    assert.equal(Number(pool.drafted_clan_id),6);assert.equal(pool.candidate_key,'transfer-2');assert.equal(Number(pool.total_score),1234);
    assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=2')).rows[0].coin),9000000000);
    assert.equal(Number((await f.pg.query('SELECT score FROM clan_season_teams WHERE clan_id=8')).rows[0].score),999);
    const messages=(await f.pg.query('SELECT * FROM user_messages')).rows,rewards=(await f.pg.query('SELECT * FROM user_message_rewards')).rows;
    assert.equal(messages.length,22);assert.equal(rewards.length,22);assert.ok(rewards.every(r=>Number(r.reward_amount)===3000000000&&r.claimed_at===null));
    assert.ok(!messages.some(m=>[3,101,200].includes(Number(m.user_id))));
    assert.equal((await f.transferApply(p.body.previewId)).body.replayed,true);
    assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,22);
    const log=(await f.pg.query('SELECT * FROM admin_logs')).rows[0];assert.equal(log.action_type,'CLAN_MEMBER_CHANGE_AND_GIFT');
    assert.equal(Number(JSON.parse(log.before_data).membership.clan_id),8);
  }finally{await f.close();}
});

test('gift send failure rolls back transfer, release, messages, rewards and schema widening',async()=>{
  const f=await transferFixture({legacy:true});
  try {
    const p=await f.transferPreview();assert.equal(p.status,200);assert.equal(p.body.gift.moneyUpgrade.length,6);
    f.failOn('INSERT INTO user_message_rewards');
    assert.equal((await f.transferApply(p.body.previewId)).status,409);
    assert.equal(Number((await f.pg.query('SELECT clan_id FROM clan_members WHERE season_id=4 AND user_id=2')).rows[0].clan_id),8);
    assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE season_id=4 AND user_id=101')).rows.length,1);
    assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
    assert.equal((await f.pg.query('SELECT * FROM user_message_rewards')).rows.length,0);
    assert.equal((await f.pg.query("SELECT data_type FROM information_schema.columns WHERE table_name='user_message_rewards' AND column_name='reward_amount'")).rows[0].data_type,'integer');
    f.failOn(null);assert.equal((await f.transferApply(p.body.previewId)).status,200);
  }finally{await f.close();}
});

test('real PostgreSQL claim receives 3 billion exactly once after legacy message money fields are widened',async()=>{
  const f=await transferFixture({legacy:true});
  try {
    const p=await f.transferPreview();const r=await f.transferApply(p.body.previewId);assert.equal(r.status,200,JSON.stringify(r));
    const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
    const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('const COUPON_REWARD_MAX='));
    const claim=source.slice(source.indexOf('async function claimMessageRewardDirectV1222('),source.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
    const context=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
    vm.runInContext(`${specs}\n${claim}\nthis.claim=claimMessageRewardDirectV1222;`,context);
    const reward=(await f.pg.query('SELECT * FROM user_message_rewards WHERE user_id=2')).rows[0];
    const first=await context.claim(f.env,{id:2},reward,Number(reward.message_id));assert.equal(first.credited,true);assert.equal(first.balanceAfter,12000000000);
    const again=await context.claim(f.env,{id:2},reward,Number(reward.message_id));assert.equal(again.duplicate,true);
    assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=2')).rows[0].coin),12000000000);
    assert.equal((await f.pg.query('SELECT * FROM coin_logs WHERE user_id=2')).rows.length,1);
    assert.equal(Number((await f.pg.query('SELECT reward_amount FROM user_message_reward_claim_receipts_v1222 WHERE user_id=2')).rows[0].reward_amount),3000000000);
  }finally{await f.close();}
});

test('transfer source, leadership, final recipient set and gift amount are explicit and revalidated',async()=>{
  const f=await transferFixture();
  try {
    assert.equal((await f.preview({removeMembers:[removeMembers[0]]})).status,409);
    assert.equal((await f.transferPreview({fromClanId:6})).status,400);
    assert.equal((await f.transferPreview({fromClanName:'Wrong'})).status,409);
    for(const coin of [0,-1,1.2,3000000001,Infinity,'3000000000'])assert.equal((await f.transferPreview({clanGift:{...clanGift,coin}})).status,409);
    const p=await f.transferPreview();assert.equal(p.status,200);
    await f.pg.exec("UPDATE clan_members SET joined_at='2026-09-02' WHERE season_id=4 AND user_id=2");
    assert.equal((await f.transferApply(p.body.previewId)).status,409);
    await f.pg.exec("UPDATE clan_members SET joined_at='2026-09-01' WHERE season_id=4 AND user_id=2; UPDATE clan_season_teams SET master_user_id=2 WHERE clan_id=8");
    assert.equal((await f.transferApply(p.body.previewId)).status,409);
    await f.pg.exec("UPDATE clan_season_teams SET master_user_id=200 WHERE clan_id=8; UPDATE users SET status='BANNED' WHERE id=103");
    assert.equal((await f.transferApply(p.body.previewId)).status,409);
    await f.pg.exec("UPDATE users SET status='ACTIVE' WHERE id=103; UPDATE clan_members SET clan_id=8 WHERE season_id=4 AND user_id=103");
    assert.equal((await f.transferApply(p.body.previewId)).status,409);
    assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
    assert.equal(Number((await f.pg.query('SELECT clan_id FROM clan_members WHERE season_id=4 AND user_id=2')).rows[0].clan_id),8);
  }finally{await f.close();}
});
