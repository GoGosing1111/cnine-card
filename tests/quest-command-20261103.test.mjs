import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ensureCombatQuestSchema,questDay,dailyCombatCounts,extraWeeklyRaidCounts,dailyCombatStatus,claimDailyCombatQuest,QUEST_COMBAT_POLICY_KEY} from '../functions/_quest_combat.js';
import {DAILY_COMBAT_QUESTS,questNpcLines} from '../shared/quest-command-v1.mjs';
import {questPeriod} from '../functions/_quest_hub.js';

async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT sqlite_now());
 CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT DEFAULT 123);INSERT INTO users VALUES(1,123),(2,999);
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK','proof-a');
 CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active BIGINT);INSERT INTO inventory_items VALUES('MASTER_STAR',1),('CARD_FRAGMENT',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,updated_at TEXT DEFAULT sqlite_now(),PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory VALUES(1,'CARD_FRAGMENT',777,7,sqlite_now()),(1,'MASTER_STAR',99,9,sqlite_now());
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE ranked_fight_receipts_v1(user_id BIGINT,request_id TEXT,created_at TEXT,PRIMARY KEY(user_id,request_id));
 CREATE TABLE ranked_duo_matches_v1(id TEXT PRIMARY KEY,user_id BIGINT,status TEXT,completed_at TEXT);
 CREATE TABLE raid_instances(id BIGINT PRIMARY KEY,status TEXT,ends_at TEXT);
 CREATE TABLE raid_participants(instance_id BIGINT,user_id BIGINT,is_active BIGINT,total_power BIGINT,total_damage BIGINT);
 CREATE TABLE raid_room_cancellations(instance_id BIGINT PRIMARY KEY);
 CREATE TABLE raid_instance_v1293(instance_id BIGINT PRIMARY KEY,settings_json TEXT);
 `);
 const compat=readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8');
 for(const name of ['sqlite_json_extract','sqlite_json_each'])await pg.exec(compat.match(new RegExp('CREATE OR REPLACE FUNCTION '+name+'[\\s\\S]*?\\$\\$;'))[0]);
 for(const table of ['raid_lich_rooms_v1','raid_madara_rooms_v1','raid_blackwing_rooms_v1'])await pg.exec(`CREATE TABLE ${table}(room_id TEXT PRIMARY KEY,status TEXT,state_json TEXT,updated_at BIGINT DEFAULT ${Date.now()})`);
 const client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)},user={id:1,role:'USER'},deps={dailySettings:async()=>({enabled:true}),excluded:()=>false};
 await ensureCombatQuestSchema(env);
 await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[QUEST_COMBAT_POLICY_KEY,JSON.stringify({version:1,enabled:true})]);
 const stamp=new Date().toISOString().slice(0,19).replace('T',' ');
 const rank=async(n,at=stamp,uid=1)=>{for(let i=0;i<n;i++)await pg.query('INSERT INTO ranked_fight_receipts_v1 VALUES($1,$2,$3)',[uid,crypto.randomUUID(),at])};
 const duo=async(n,{at=stamp,uid=1,status='COMPLETED'}={})=>{for(let i=0;i<n;i++)await pg.query('INSERT INTO ranked_duo_matches_v1 VALUES($1,$2,$3,$4)',[crypto.randomUUID(),uid,status,at])};
 let roomId=0;
 const world=async({at=stamp,uid=1,status='ENDED',active=1,power=10,damage=100,settings={enabled:true,ownerOnlyTest:false}}={})=>{const id=++roomId;await pg.query('INSERT INTO raid_instances VALUES($1,$2,$3)',[id,status,at]);await pg.query('INSERT INTO raid_participants VALUES($1,$2,$3,$4,$5)',[id,uid,active,power,damage]);await pg.query('INSERT INTO raid_instance_v1293 VALUES($1,$2)',[id,JSON.stringify(settings)]);return id};
 const balances=async()=>({users:(await pg.query('SELECT * FROM users ORDER BY id')).rows,inventory:(await pg.query('SELECT user_id,item_code,quantity,unseen_quantity FROM cnine_user_inventory ORDER BY user_id,item_code')).rows,coins:(await pg.query('SELECT * FROM coin_logs ORDER BY id')).rows,items:(await pg.query('SELECT * FROM inventory_logs ORDER BY id')).rows,receipts:(await pg.query('SELECT * FROM quest_daily_combat_claims_v1 ORDER BY quest_id')).rows});
 return {pg,env,user,deps,rank,duo,world,balances,stamp};
}
test('exact approved rewards and Korean day/week boundaries',()=>{
 assert.deepEqual(DAILY_COMBAT_QUESTS.map(q=>[q.id,q.target,q.coin,q.masterStars]),[['RANKED',30,3e12,1e7],['WORLD_RAID',5,1e12,1e7],['DUO_RANKED',10,2e12,1e7]]);
 const before=questDay(Date.parse('2026-11-02T14:59:59.999Z')),after=questDay(Date.parse('2026-11-02T15:00:00Z'));
 assert.equal(before.key,'2026-11-02');assert.equal(after.key,'2026-11-03');assert.equal(before.end,after.start);
 assert.equal(questPeriod(Date.parse('2026-11-01T15:00:00Z')).weekKey,'2026-11-02');
});
test('daily counts require completed self-started matches and public active world raid completion; day end exclusive',async()=>{
 const f=await fixture();try{
  const d=questDay();await f.rank(29);await f.rank(1,d.start);await f.rank(2,d.end);await f.rank(9,f.stamp,2);
  await f.duo(9);await f.duo(1,{at:d.start});await f.duo(2,{status:'PENDING'});await f.duo(2,{uid:2});await f.duo(1,{at:d.end});
  for(let i=0;i<4;i++)await f.world();const id=await f.world({at:d.start});await f.pg.query('INSERT INTO raid_participants VALUES($1,1,1,10,100)',[id]);
  for(const args of [{at:d.end},{status:'ACTIVE'},{active:0},{power:0},{damage:0},{settings:{enabled:true,ownerOnlyTest:true}},{settings:{enabled:false,ownerOnlyTest:false}},{uid:2}])await f.world(args);
  const cancelled=await f.world();await f.pg.query('INSERT INTO raid_room_cancellations VALUES($1)',[cancelled]);const counts=await dailyCombatCounts(f.env,f.user,d);assert.deepEqual(Object.values(counts).map(q=>q.count),[30,10,5]);
 }finally{await f.pg.close()}
});
test('all three daily payouts cross target exactly once, give exact coin and MASTER_STAR, preserve cards and other accounts',async()=>{
 const f=await fixture();try{
  await f.rank(29);await f.duo(9);for(let i=0;i<4;i++)await f.world();
  const initial=await f.balances();for(const q of DAILY_COMBAT_QUESTS)await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,q.id,f.deps),/목표/);assert.deepEqual(await f.balances(),initial);
  await f.rank(1);await f.duo(1);await f.world();
  for(const q of DAILY_COMBAT_QUESTS){const first=await claimDailyCombatQuest(f.env,f.user,q.id,f.deps);assert.equal(first.replayed,false);assert.equal(first.rewardCoin,q.coin);assert.equal(first.masterStars,1e7);const after=await f.balances();assert.equal((await claimDailyCombatQuest(f.env,f.user,q.id,f.deps)).replayed,true);assert.deepEqual(await f.balances(),after);}
  const b=await f.balances();assert.equal(Number(b.users[0].coin),6e12+123);assert.equal(Number(b.users[1].coin),999);assert.equal(Number(b.inventory[0].quantity),777);assert.equal(Number(b.inventory[1].quantity),3e7+99);assert.equal(b.coins.length,3);assert.equal(b.items.length,3);assert.equal(b.receipts.length,3);assert.ok(b.receipts.every(r=>r.status==='COMPLETED'));
  assert.ok((await dailyCombatStatus(f.env,f.user)).every(q=>q.claimed));
  await f.pg.exec('DELETE FROM user_second_verifications');await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',['{"version":1,"enabled":false}',QUEST_COMBAT_POLICY_KEY]);
  assert.equal((await claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps)).replayed,true);assert.deepEqual(await f.balances(),b);
 }finally{await f.pg.close()}
});
test('missing/inactive star catalog rolls back wallet, both logs and receipt; retry succeeds once',async()=>{
 const f=await fixture();try{await f.rank(30);const before=await f.balances();await f.pg.exec("UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'");await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps));assert.deepEqual(await f.balances(),before);await f.pg.exec("UPDATE inventory_items SET is_active=1 WHERE code='MASTER_STAR'");assert.equal((await claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps)).ok,true);assert.equal((await f.pg.query('SELECT * FROM joint_atomic_guards_v1')).rows.length,0);}finally{await f.pg.close()}
});
test('lost commit acknowledgement is recovered from the receipt without duplicate money',async()=>{
 const f=await fixture();try{await f.duo(10);const batch=f.env.DB.batch.bind(f.env.DB);let once=true;f.env.DB.batch=async rows=>{const r=await batch(rows);if(once){once=false;throw Error('lost acknowledgement')}return r};const r=await claimDailyCombatQuest(f.env,f.user,'DUO_RANKED',f.deps);assert.equal(r.replayed,true);assert.equal((await f.balances()).coins.length,1);assert.equal((await claimDailyCombatQuest(f.env,f.user,'DUO_RANKED',f.deps)).replayed,true);}finally{await f.pg.close()}
});
test('policy/identity changed before transaction, blocked accounts, and day rollover never partially pay',async()=>{
 const f=await fixture();try{
  await f.rank(30);const before=await f.balances();await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',{...f.deps,excluded:()=>true}),/인증/);
  let calls=0;await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',{...f.deps,now:()=>Date.now()+(calls++?86400000:0)}),/날짜/);
  const batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async rows=>{await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',['{"version":1,"enabled":false}',QUEST_COMBAT_POLICY_KEY]);return batch(rows)};await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps));assert.deepEqual(await f.balances(),before);
  await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',['{"version":1,"enabled":true}',QUEST_COMBAT_POLICY_KEY]);f.env.DB.batch=async rows=>{await f.pg.exec("UPDATE user_second_verifications SET provider_user_id='changed'");return batch(rows)};await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps));assert.deepEqual(await f.balances(),before);
 }finally{await f.pg.close()}
});
test('coin or star BIGINT overflow rolls back the combined payout',async()=>{
 const f=await fixture();try{await f.rank(30);await f.pg.exec("UPDATE users SET coin=9223372036854775807 WHERE id=1");let before=await f.balances();await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps));assert.deepEqual(await f.balances(),before);await f.pg.exec("UPDATE users SET coin=123 WHERE id=1; UPDATE cnine_user_inventory SET quantity=9223372036854775807 WHERE item_code='MASTER_STAR'");before=await f.balances();await assert.rejects(()=>claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps));assert.deepEqual(await f.balances(),before);}finally{await f.pg.close()}
});
test('combined coop raid count uses frozen participants after departure, excludes test/abandon/lobby/next-week/world raids',async()=>{
 const f=await fixture();try{
  const period=questPeriod(),end=Date.parse(period.end.replace(' ','T')+'Z'),start=Date.parse(period.start.replace(' ','T')+'Z');
  const add=async(table,changes={})=>{const s={status:'CLEAR',releaseMode:'ON',startedAt:start-1,finishedAt:start,members:[],...changes};await f.pg.query(`INSERT INTO ${table}(room_id,status,state_json) VALUES($1,$2,$3)`,[crypto.randomUUID(),s.status,JSON.stringify(s)])};
  await add('raid_lich_rooms_v1',{questParticipants:['1'],members:[]});await add('raid_lich_rooms_v1',{clearRewardSettlement:{weeklyByUser:{1:0}}});await add('raid_lich_rooms_v1',{status:'FAILED',members:[{id:1}]});
  await add('raid_madara_rooms_v1',{initialMembers:[1]});await add('raid_blackwing_rooms_v1',{initialMembers:['1']});await add('raid_blackwing_rooms_v1',{clearRewards:{1:{items:[]}}});
  for(const changes of [{releaseMode:'TEST',initialMembers:[1]},{status:'LOBBY',initialMembers:[1]},{finishedAt:end,initialMembers:[1]},{failure:{code:'MEMBER_LEFT'},initialMembers:[1]},{initialMembers:[2]},{startedAt:0,initialMembers:[1]}])await add('raid_blackwing_rooms_v1',changes);
  await f.world();assert.equal((await extraWeeklyRaidCounts(f.env,f.user,period)).count,6);
 }finally{await f.pg.close()}
});
test('NPC briefing/progress/ready/claimed/blocked/paused/error lines follow mission and status',()=>{
 const replies=new Set();for(const q of DAILY_COMBAT_QUESTS){const base={...q,count:0,enabled:true,available:true};replies.add(questNpcLines(base).join(''));assert.match(questNpcLines({...base,count:1}).join(''),/현재 1\//);assert.match(questNpcLines({...base,count:q.target}).join(''),/1,000만/);assert.match(questNpcLines({...base,claimed:true}).join(''),/지급.*마쳤/);assert.match(questNpcLines({...base,blocked:true}).join(''),/인증/);assert.match(questNpcLines({...base,enabled:false}).join(''),/중지/);assert.match(questNpcLines(base,{phase:'error'}).join(''),/통신/);}assert.equal(replies.size,3);
});
test('simultaneous daily requests settle one receipt and one combined reward',async()=>{
 const f=await fixture();try{await f.rank(30);const results=await Promise.all(Array.from({length:3},()=>claimDailyCombatQuest(f.env,f.user,'RANKED',f.deps)));assert.equal(results.filter(r=>!r.replayed).length,1);const b=await f.balances();assert.equal(b.receipts.length,1);assert.equal(b.coins.length,1);assert.equal(b.items.length,1);assert.equal(Number(b.users[0].coin),3e12+123);assert.equal(Number(b.inventory[1].quantity),1e7+99);}finally{await f.pg.close()}
});
