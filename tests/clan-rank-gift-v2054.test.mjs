import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {CLANS,CAMPAIGN,RECEIPT_KEY,inspectClanRankGift,sendClanRankGift,verifyClanRankGift} from '../scripts/ops/clan-rank-gift-v2054.mjs';

async function fixture(t){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT CURRENT_TIMESTAMP::text$$;
    CREATE TABLE clan_seasons(id bigint,phase text);
    INSERT INTO clan_seasons VALUES(4,'ACTIVE');
    CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score int,wins int,losses int,draft_position int);
    CREATE TABLE clan_organizations(id bigint,name text,mark_key text,primary_color text,accent_color text,slogan text);
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,coin bigint DEFAULT 9000000000);
    CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint);
    CREATE TABLE clan_wars(season_id bigint,clan_a_id bigint,clan_b_id bigint,score_a bigint,score_b bigint,status text);
    CREATE TABLE user_messages(id bigserial PRIMARY KEY,user_id bigint,sender_type text,title text,body text,message_type text,campaign_key text,UNIQUE(user_id,campaign_key));
    CREATE TABLE user_message_rewards(id bigserial PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,reward_amount bigint,balance_before bigint,balance_after bigint);
    CREATE TABLE coin_logs(change_amount bigint,balance_after bigint);
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
  `);
  for(const c of CLANS){
    await pg.query('INSERT INTO clan_organizations(id,name) VALUES($1,$2)',[c.id,c.name]);
    await pg.query('INSERT INTO clan_season_teams VALUES(4,$1::bigint,$2,$3,3,0,$1::int)',[c.id,c.id*1000+1,c.id===7||c.id===4?9:0]);
    await pg.query("INSERT INTO users(id,nickname) SELECT $1::bigint+n,'synthetic-'||n FROM generate_series(1,$2::int) n",[c.id*1000,c.members]);
    await pg.query('INSERT INTO clan_members SELECT 4,$1,$2::bigint+n FROM generate_series(1,$3::int) n',[c.id,c.id*1000,c.members]);
    await pg.query("INSERT INTO clan_wars VALUES(4,$1,99,$2,1991,'COMPLETED')",[c.id,c.id===7?2164:2138]);
  }
  let fail='';const calls=[];
  const client={async query(sql,values=[]){
    calls.push(sql);
    if(fail&&sql.startsWith(fail))throw new Error('injected failure');
    // Single-connection local fixture; production uses the real transaction advisory lock.
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    const r=await pg.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};
  }};
  const send=async fingerprint=>{await pg.exec('BEGIN');try{const r=await sendClanRankGift(client,fingerprint);await pg.exec('COMMIT');return r}catch(e){await pg.exec('ROLLBACK');throw e}};
  return {pg,client,calls,send,fail(value){fail=value}};
}

test('175 inbox rewards use exact 50억 / 30억 / 10억 BIGINT amounts and replay once without crediting wallets',async t=>{
  const f=await fixture(t),preview=await inspectClanRankGift(f.client);
  assert.equal(preview.existingMessages,0);assert.ok(preview.storage.every(c=>c.type==='bigint'));
  assert.ok(f.calls.every(sql=>sql.trim().startsWith('SELECT')),'inspection is read-only');
  const first=await f.send(preview.fingerprint);assert.equal(first.replayed,false);assert.equal(first.totalCoin,'303000000000');
  const second=await f.send('');assert.equal(second.replayed,true);assert.equal(second.messages,175);
  assert.equal((await f.pg.query('SELECT COUNT(*) n FROM users WHERE coin<>9000000000')).rows[0].n,0);
  assert.equal((await f.pg.query('SELECT phase FROM clan_seasons')).rows[0].phase,'ACTIVE');
  assert.equal((await f.pg.query('SELECT COUNT(*) n FROM coin_logs')).rows[0].n,0);
  const groups=(await f.pg.query('SELECT reward_amount,COUNT(*) n FROM user_message_rewards GROUP BY reward_amount ORDER BY reward_amount DESC')).rows;
  assert.deepEqual(groups.map(g=>[String(g.reward_amount),Number(g.n)]),[['5000000000',21],['3000000000',22],['1000000000',132]]);
  const verified=await verifyClanRankGift(f.client);assert.equal(verified.pending,175);assert.equal(verified.claimed,0);
  const [reward]=(await f.pg.query('SELECT id,reward_amount FROM user_message_rewards ORDER BY id LIMIT 1')).rows;
  await f.pg.query('INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,reward_amount) VALUES($1,$2)',[reward.id,reward.reward_amount]);
  await f.pg.query("UPDATE user_message_rewards SET claimed_at='2026-09-06' WHERE id=$1",[reward.id]);
  assert.equal((await verifyClanRankGift(f.client)).claimed,1);
});

test('wrong fingerprint and member changes reject before any message or audit write',async t=>{
  const f=await fixture(t),preview=await inspectClanRankGift(f.client);
  await assert.rejects(f.send('0'.repeat(64)),/snapshot changed/);
  await f.pg.exec('DELETE FROM clan_members WHERE user_id=7001');
  await assert.rejects(f.send(preview.fingerprint),/175 unique/);
  assert.equal((await f.pg.query('SELECT COUNT(*) n FROM user_messages')).rows[0].n,0);
});

test('reward insert or audit failure rolls all messages and rewards back',async t=>{
  const f=await fixture(t),preview=await inspectClanRankGift(f.client);
  for(const stage of ['INSERT INTO user_message_rewards','INSERT INTO app_meta']){
    f.fail(stage);await assert.rejects(f.send(preview.fingerprint),/injected failure/);f.fail('');
    for(const table of ['user_messages','user_message_rewards','app_meta'])assert.equal((await f.pg.query(`SELECT COUNT(*) n FROM ${table}`)).rows[0].n,0);
  }
  assert.equal((await f.send(preview.fingerprint)).messages,175);
});

test('unreceipted campaign messages and overflow-prone storage fail closed',async t=>{
  const f=await fixture(t),preview=await inspectClanRankGift(f.client);
  await f.pg.query('INSERT INTO user_messages(user_id,campaign_key) VALUES(7001,$1)',[CAMPAIGN]);
  await assert.rejects(f.send(preview.fingerprint),/reconciliation/);
  await f.pg.exec('DELETE FROM user_messages;ALTER TABLE user_message_rewards ALTER COLUMN reward_amount TYPE integer');
  await assert.rejects(f.send(preview.fingerprint),/BIGINT/);
  assert.equal((await f.pg.query('SELECT COUNT(*) n FROM user_messages')).rows[0].n,0);
  assert.equal((await f.pg.query('SELECT COUNT(*) n FROM app_meta WHERE key=$1',[RECEIPT_KEY])).rows[0].n,0);
});
