import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {questPeriod,defaultQuestSettings,validateQuestSettings,ensureQuestHub,questHubStatus,checkWeeklyPosts,claimWeeklyQuest,handleQuestHub,QUEST_SETTINGS_KEY} from '../functions/_quest_hub.js';

test('KST Monday 00:00 inclusive / next Monday exclusive, including year crossover',()=>{
 const sunday=questPeriod(Date.parse('2026-09-27T14:59:59Z')),monday=questPeriod(Date.parse('2026-09-27T15:00:00Z'));
 assert.equal(sunday.weekKey,'2026-09-21');assert.equal(sunday.lastDate,'2026-09-27');assert.equal(sunday.days.length,7);
 assert.equal(monday.weekKey,'2026-09-28');assert.equal(monday.days.length,1);assert.equal(sunday.end,monday.start);
 assert.equal(questPeriod(Date.parse('2027-01-01T02:00:00Z')).weekKey,'2026-12-28');
});
test('new weekly rewards are all OFF, unset; unsafe/zero-enabled values are rejected',()=>{
 const original=defaultQuestSettings();assert.ok(Object.values(original.quests).every(q=>!q.enabled&&q.rewardAmount===0));
 for(const value of ['',null,-1,1.5,Number.MAX_SAFE_INTEGER+1]){const next=structuredClone(original);next.quests.POST.rewardAmount=value;assert.throws(()=>validateQuestSettings(next,original))}
 for(const rewardType of ['UNKNOWN','constructor','__proto__']){const next=structuredClone(original);next.quests.POST.rewardType=rewardType;assert.throws(()=>validateQuestSettings(next,original))}
 const zero=structuredClone(original);zero.quests.POST.enabled=true;assert.throws(()=>validateQuestSettings(zero,original),/1개 이상/);
 zero.quests.POST.rewardAmount=100_000_000_000;assert.equal(validateQuestSettings(zero,original).quests.POST.rewardAmount,100_000_000_000);
});

async function fixture({denyLegacyIndexes=false}={}){
 const pg=new PGlite();await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE FUNCTION sqlite_datetime(text,text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP)+$2::interval,'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT sqlite_now());
 CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT DEFAULT 123);INSERT INTO users VALUES(1,123),(2,999);
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT,provider_name TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK','uuid-a','tester');
 CREATE TABLE wago_daily_post_progress_v2(user_id BIGINT,quest_date TEXT,post_count BIGINT,last_checked_at TEXT);
 CREATE TABLE wago_daily_quest_claims(user_id BIGINT,quest_date TEXT,reward_coin BIGINT,claimed_at TEXT);
 CREATE TABLE raid_core_attempts_v2024(attempt_id TEXT PRIMARY KEY,room_id TEXT,user_id BIGINT,status TEXT,result_json TEXT DEFAULT '{}',resolved_at TEXT);
 CREATE TABLE territory_war_v3_actions(id BIGSERIAL PRIMARY KEY,user_id BIGINT,status TEXT,updated_at TEXT);
 CREATE TABLE clan_war_battles(id BIGSERIAL PRIMARY KEY,attacker_user_id BIGINT,defender_user_id BIGINT,status TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 const client={async query(input){const result=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length}}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)},user={id:1,role:'USER'},calls=[];
 if(denyLegacyIndexes){const execSchema=env.DB.execSchema.bind(env.DB);env.DB.execSchema=sql=>{if(sql.some(statement=>/^CREATE INDEX/.test(statement)))throw Object.assign(Error('must be owner of table territory_war_v3_actions'),{code:'42501'});return execSchema(sql)}}
 const deps={dailySettings:async()=>({enabled:true,postEnabled:true,postRewardCoin:10000000000,boardSlugs:['skm'],checkCooldownSeconds:20}),excluded:()=>false,ensureDaily:async()=>{},ensureMessages:async()=>{},
  authenticate:async()=>user,requirePermission:async()=>({...user,role:'OWNER'}),json:(body,status=200)=>Response.json(body,{status}),readBody:r=>r.json(),
  playdkClient:()=>({async getDailyPostCount(args){calls.push(args);return {userUuid:args.userUuid,questDate:args.questDate,timezone:'Asia/Seoul',boardSlugs:args.boardSlugs,count:50,posts:[],postsTruncated:true}}})};
 await ensureQuestHub(env);
 const period=questPeriod(),stamp=new Date().toISOString().slice(0,19).replace('T',' ');
 await pg.query("INSERT INTO territory_war_v3_actions(user_id,status,updated_at) VALUES(1,'APPLIED',$1),(1,'PENDING',$1),(2,'APPLIED',$1)",[stamp]);
 await pg.query("INSERT INTO clan_war_battles(attacker_user_id,defender_user_id,status,updated_at) VALUES(1,2,'COMPLETED',$1),(1,2,'COMPLETED',$1),(2,1,'COMPLETED',$1),(1,2,'PENDING',$1)",[stamp]);
 for(const [id,room,status,result] of [['a','room1','COMPLETED','{}'],['b','room1','COMPLETED','{}'],['c','room2','COMPLETED','{}'],['d','room3','COMPLETED','{}'],['e','room4','PENDING','{}'],['f','room5','COMPLETED','{"outcome":{"failureReason":"CORE_BATTLE_ABANDONED"}}']])await pg.query('INSERT INTO raid_core_attempts_v2024 VALUES($1,$2,1,$3,$4,$5)',[id,room,status,result,stamp]);
 return {pg,env,deps,user,calls,period,async enable(id,amount=100000000000){const settings=defaultQuestSettings();settings.quests[id]={enabled:true,rewardType:'COIN',rewardAmount:amount};await pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(settings),QUEST_SETTINGS_KEY])}};
}
test('status preserves daily reward and counts actual completed attacker participation, not defense/abandon/repeated rooms',async()=>{
 const f=await fixture();try{
  const status=await questHubStatus(f.env,f.user,f.deps);assert.equal(status.daily.target,15);assert.equal(status.daily.rewardAmount,10000000000);
  assert.deepEqual(status.weekly.map(q=>[q.id,q.target,q.count]),[['POST',200,0],['CORE_RAID',3,3],['TERRITORY',1,1],['CLAN',2,2]]);
  assert.ok(status.weekly.every(q=>!q.enabled));assert.equal(status.weekly[0].available,false);
  await assert.rejects(()=>claimWeeklyQuest(f.env,f.user,'TERRITORY',f.deps),/보상 설정/);
  assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
 }finally{await f.pg.close()}
});
test('legacy index ownership cannot block additive quest tables or OFF defaults',async()=>{
 const f=await fixture({denyLegacyIndexes:true});try{
  const status=await questHubStatus(f.env,f.user,f.deps);assert.equal(status.weekly.length,4);assert.ok(status.weekly.every(q=>!q.enabled&&q.rewardAmount===0));
  assert.equal((await f.pg.query('SELECT * FROM quest_weekly_claims_v1')).rows.length,0);
  assert.equal((await f.pg.query("SELECT * FROM app_meta WHERE key='quest_hub_foundation_20260924_v1'")).rows.length,1);
  await f.enable('TERRITORY');assert.equal((await claimWeeklyQuest(f.env,f.user,'TERRITORY',f.deps)).ok,true);
 }finally{await f.pg.close()}
});
test('weekly DK check queries elapsed KST dates, uses total count rather than truncated posts and caches only complete result',async()=>{
 const f=await fixture();try{
  const result=await checkWeeklyPosts(f.env,f.user,f.deps);assert.equal(result.postCount,f.period.days.length*50);assert.deepEqual(f.calls.map(c=>c.questDate).sort(),f.period.days);
  const again=await checkWeeklyPosts(f.env,f.user,f.deps);assert.equal(again.cooldown,true);assert.equal(f.calls.length,f.period.days.length);
  const old=(await f.pg.query('SELECT * FROM quest_weekly_posts_v1')).rows;
  const broken={...f.deps,playdkClient:()=>({getDailyPostCount:async()=>{throw Error('DK unavailable')}})};
  await assert.rejects(()=>checkWeeklyPosts(f.env,f.user,broken,{force:true}));assert.deepEqual((await f.pg.query('SELECT * FROM quest_weekly_posts_v1')).rows,old);
  const changed={...f.deps,playdkClient:()=>({getDailyPostCount:async args=>({userUuid:'wrong',questDate:args.questDate,timezone:'Asia/Seoul',boardSlugs:['skm'],count:999})})};
  await assert.rejects(()=>checkWeeklyPosts(f.env,f.user,changed,{force:true}),/일치하지/);assert.deepEqual((await f.pg.query('SELECT * FROM quest_weekly_posts_v1')).rows,old);
 }finally{await f.pg.close()}
});
test('identity changes invalidate saved weekly post totals',async()=>{
 const f=await fixture();try{await checkWeeklyPosts(f.env,f.user,f.deps);await f.pg.exec("UPDATE user_second_verifications SET provider_user_id='uuid-new'");const status=await questHubStatus(f.env,f.user,f.deps);assert.equal(status.weekly[0].count,0);assert.equal(status.weekly[0].available,false)}finally{await f.pg.close()}
});
test('weekly reward delivers one exact message, does not touch wallet, replays without duplication',async()=>{
 const f=await fixture();try{
  await f.enable('TERRITORY');const first=await claimWeeklyQuest(f.env,f.user,'TERRITORY',f.deps),again=await claimWeeklyQuest(f.env,f.user,'TERRITORY',f.deps);
  assert.equal(first.delivery,'MESSAGE');assert.equal(again.replayed,true);assert.equal(first.messageId,again.messageId);
  const rewards=(await f.pg.query('SELECT * FROM user_message_rewards')).rows;assert.equal(rewards.length,1);assert.equal(Number(rewards[0].reward_amount),100000000000);
  assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,1);assert.equal((await f.pg.query('SELECT * FROM quest_weekly_claims_v1')).rows[0].status,'COMPLETED');
  assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=1')).rows[0].coin),123);
 }finally{await f.pg.close()}
});
test('reward insert failure rolls message and receipt back; retry is safe',async()=>{
 const f=await fixture();try{
  await f.enable('CLAN');await f.pg.exec("ALTER TABLE user_message_rewards ADD CONSTRAINT reject_gift CHECK(reward_amount<1)");
  await assert.rejects(()=>claimWeeklyQuest(f.env,f.user,'CLAN',f.deps));
  for(const table of ['user_messages','user_message_rewards','quest_weekly_claims_v1'])assert.equal((await f.pg.query('SELECT * FROM '+table)).rows.length,0);
  await f.pg.exec('ALTER TABLE user_message_rewards DROP CONSTRAINT reject_gift');assert.equal((await claimWeeklyQuest(f.env,f.user,'CLAN',f.deps)).ok,true);
 }finally{await f.pg.close()}
});
test('CMS requires OWNER, rejects stale revision, saves zero/OFF and never overwrites on schema reentry',async()=>{
 const f=await fixture();try{
  const input=defaultQuestSettings(),make=()=>new Request('https://qa.invalid/',{method:'PATCH',body:JSON.stringify({revision:0,settings:input})}),path='admin/weekly-quests';
  const denied=await handleQuestHub({env:f.env,path,request:make(),deps:{...f.deps,requirePermission:async()=>({...f.user,role:'ADMIN'})}});assert.equal(denied.status,403);
  const saved=await handleQuestHub({env:f.env,path,request:make(),deps:f.deps});assert.equal(saved.status,200);const value=(await saved.json()).settings;assert.equal(value.revision,1);
  assert.equal((await handleQuestHub({env:f.env,path,request:make(),deps:f.deps})).status,409);
  await ensureQuestHub(f.env);assert.deepEqual(JSON.parse((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[QUEST_SETTINGS_KEY])).rows[0].value),value);
  assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
 }finally{await f.pg.close()}
});
test('activity counters include Monday midnight, exclude next Monday and old-week records',async()=>{
 const f=await fixture();try{
  await f.pg.exec('DELETE FROM clan_war_battles');
  const now=Date.parse('2026-09-27T14:59:59Z'),deps={...f.deps,now:()=>now};
  for(const timestamp of ['2026-09-20T14:59:59Z','2026-09-20T15:00:00Z','2026-09-27 14:59:59','2026-09-27T15:00:00Z'])await f.pg.query("INSERT INTO clan_war_battles(attacker_user_id,status,updated_at) VALUES(1,'COMPLETED',$1)",[timestamp]);
  assert.equal((await questHubStatus(f.env,f.user,deps)).weekly.find(q=>q.id==='CLAN').count,2);
  assert.equal((await questHubStatus(f.env,f.user,{...deps,now:()=>now+1000})).weekly.find(q=>q.id==='CLAN').count,1);
 }finally{await f.pg.close()}
});
test('changed CMS policy before transaction cannot pay the earlier reward',async()=>{
 const f=await fixture();try{
  await f.enable('TERRITORY');const deps={...f.deps,ensureMessages:async()=>f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(defaultQuestSettings()),QUEST_SETTINGS_KEY])};
  await assert.rejects(()=>claimWeeklyQuest(f.env,f.user,'TERRITORY',deps),/변경/);
  for(const table of ['user_messages','user_message_rewards','quest_weekly_claims_v1'])assert.equal((await f.pg.query('SELECT * FROM '+table)).rows.length,0);
 }finally{await f.pg.close()}
});
test('DK date/board/timezone mismatch or midnight rollover never saves partial counts',async()=>{
 const f=await fixture();try{
  for(const override of [{questDate:'1999-01-01'},{boardSlugs:['other']},{timezone:'UTC'}]){
   const deps={...f.deps,playdkClient:()=>({getDailyPostCount:async args=>({userUuid:args.userUuid,questDate:args.questDate,boardSlugs:args.boardSlugs,timezone:'Asia/Seoul',count:50,...override})})};
   await assert.rejects(()=>checkWeeklyPosts(f.env,f.user,deps),/일치하지/);
  }
  let tick=Date.parse('2026-09-27T14:59:59Z');const deps={...f.deps,now:()=>tick,playdkClient:()=>({getDailyPostCount:async args=>{tick=Date.parse('2026-09-27T15:00:00Z');return {userUuid:args.userUuid,questDate:args.questDate,boardSlugs:args.boardSlugs,timezone:'Asia/Seoul',count:50}}})};
  await assert.rejects(()=>checkWeeklyPosts(f.env,f.user,deps),/날짜가 바뀌/);assert.equal((await f.pg.query('SELECT * FROM quest_weekly_posts_v1')).rows.length,0);
 }finally{await f.pg.close()}
});
test('automatic territory cleanup preserves completed participation for the whole quest week',async()=>{
 const f=await fixture();try{
  await f.pg.exec("ALTER TABLE territory_war_v3_actions ADD COLUMN round_id BIGINT DEFAULT 1; CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT); INSERT INTO territory_war_v3_rounds VALUES(1,'FINISHED'); DELETE FROM territory_war_v3_actions;");
  for(const days of [2,7,9])await f.pg.query("INSERT INTO territory_war_v3_actions(user_id,status,updated_at) VALUES(1,'COMPLETED',$1)",[new Date(Date.now()-days*86400000).toISOString().slice(0,19).replace('T',' ')]);
  const source=readFileSync(new URL('../functions/_storage_cleanup.js',import.meta.url),'utf8'),sql=source.match(/key:'twv3_actions',table:'territory_war_v3_actions',sql:`([^`]+)`/)[1];
  await f.env.DB.prepare(sql).bind(100).run();assert.equal((await f.pg.query('SELECT * FROM territory_war_v3_actions')).rows.length,2);
 }finally{await f.pg.close()}
});
