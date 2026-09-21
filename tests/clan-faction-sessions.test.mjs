import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {factionFixture} from './helpers/clan-faction-fixture.mjs';
import {factionOverview, mutateFaction} from '../functions/_clan_faction.js';
import {syncFactionSessions,reconcileFactionSessions} from '../functions/_clan_faction_sessions.js';
import {FACTION_SESSION_RELEASE,factionDayStart,factionTime} from '../shared/clan-faction-sessions-v1.mjs';
import {runDraftSchedule} from '../workers/clan-draft/src/schedule.js';

const beginning=factionDayStart('2026-09-22');
const policy={enabled:true,effectiveAt:beginning,recipients:'ALL_MEMBERS',interruption:'CANCEL',mapPolicy:'RESET'};
const formation={attack1:[1,2,3],attack2:[4,5],defense1:[6,7,8],defense2:[9,10]};
const act=(f,kind,body={})=>mutateFaction(f.env,f.season,f.user,kind,{requestId:crypto.randomUUID(),...body},f.deps);
async function fixture(t,postgres=false,extra={}){
 const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
 const serial=postgres?'BIGSERIAL PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT',int=postgres?'BIGINT':'INTEGER';
 const sql=[`ALTER TABLE users ADD COLUMN card_shards ${int} DEFAULT 0`,
  ...(postgres?[`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$`]:[]),
  `CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,starts_at TEXT,ends_at TEXT,settled_at TEXT)`,
  `CREATE TABLE user_messages(id ${serial},user_id ${int},sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key))`,
  `CREATE TABLE user_message_rewards(id ${serial},message_id ${int} UNIQUE,user_id ${int},reward_type TEXT,reward_amount ${int},claimed_at TEXT)`,
  `CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id ${int} PRIMARY KEY,message_id ${int} UNIQUE,user_id ${int},reward_type TEXT,reward_amount ${int},claim_token TEXT UNIQUE,balance_before ${int},balance_after ${int},source TEXT,credited_at TEXT)`,
  `CREATE TABLE coin_logs(user_id ${int},change_amount ${int},balance_after ${int},reason TEXT)`];
 if(postgres)await f.DB.execSchema(sql);else f.DB.sql.exec(sql.join(';'));
 await f.p("INSERT INTO app_meta(key,value) VALUES('clan_settings_v1',?)",JSON.stringify({mode:'ON'})).run();
 f.clock.now=beginning;
 f.season.ends_at=new Date(beginning+86400000*14).toISOString();
 await f.p('UPDATE clan_seasons SET ends_at=? WHERE id=7',f.season.ends_at).run();
 Object.assign(f.deps,{factionSessionPolicy:{...policy,...extra},randomFactionSchedule:()=>0});
 return f;
}
async function own(f,count=4){
 const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),s=JSON.parse(row.state_json);
 s.districts.forEach((d,i)=>{d.owner=i<count?1:0;});
 await f.p('UPDATE clan_faction_state SET state_json=?,revision=revision+1 WHERE season_id=7',JSON.stringify(s)).run();
}
test('live default activates approved KEEP/PARTICIPANTS/PAUSE/DEFER policy after the immutable cutover',async t=>{
 const f=await fixture(t,true);
 delete f.deps.factionSessionPolicy;
 const before=JSON.parse((await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json);
 assert.equal(FACTION_SESSION_RELEASE.enabled,true);
 assert.equal(factionTime(FACTION_SESSION_RELEASE.effectiveAt),Date.parse('2026-09-22T01:15:00+09:00'));
 f.clock.now=beginning+3*3600000;
 const result=await factionOverview(f.env,f.season,f.user,f.deps);
 assert.equal(result.sessions.active,true);
 assert.equal(result.sessions.current.ordinal,2);
 assert.equal(result.sessions.schedule[0].status,'SKIPPED','pre-cutover slots do not pay retroactively');
 assert.equal(result.sessions.recipientPolicy,'PARTICIPANTS');
 assert.equal(result.sessions.mapPolicy,'KEEP');
 assert.deepEqual(result.districts.map(d=>[d.id,d.owner]),before.districts.map(d=>[d.id,d.owner]),'existing territory ownership survives activation');
 assert.deepEqual(result.formation.attack1,formation.attack1);
 assert.equal(result.tax.abolished,true);
 assert.equal(result.tax.perHour,0);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_message_rewards').first()).count),0);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} complete session, 300억 mail, reset, immutable schedule and exactly-once retry`,async t=>{
 const f=await fixture(t,postgres),first=await factionOverview(f.env,f.season,f.user,f.deps);
 assert.equal(first.sessions.active,true);assert.equal(first.holdings,0);assert.equal(first.tax.perHour,0);
 assert.deepEqual(first.formation.attack1,[1,2,3]);
 const pool=first.tax.pool;
 await act(f,'formation',{formation});await own(f,8);
 f.clock.now+=10800000;
 const after=await factionOverview(f.env,f.season,f.user,f.deps);
 assert.equal(after.sessions.current.ordinal,2);assert.equal(after.holdings,0);
 assert.equal(after.sessions.history[0].myReward,30000000000);
 assert.equal(after.tax.pool,pool);
 assert.equal('recipients' in after.sessions.history[0],false);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
 const rewards=(await f.p('SELECT * FROM user_message_rewards').all()).results;
 assert.ok(rewards.every(r=>Number(r.reward_amount)===30000000000));
 assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),100,'mail does not credit immediately');
 f.deps.randomFactionSchedule=()=>{throw Error('rerolled')};
 await syncFactionSessions(f.env,f.season,f.deps);await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_message_rewards').first()).count),12);
 await assert.rejects(act(f,'collect'),/폐지/);
 f.clock.now=beginning+6*3600000;
 const closed=await factionOverview(f.env,f.season,f.user,f.deps);
 assert.equal(closed.sessions.active,false);
 await assert.rejects(act(f,'launch',{districtId:'11680',squad:'attack1'}),/개방 시간/);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM clan_faction_sessions_v1').first()).count),2);
 if(postgres){
  const source=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const claim=source.slice(source.indexOf('async function claimMessageRewardDirectV1222('),source.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
  const context=vm.createContext({crypto,ensureVerifiedRewardMessageV1276:async()=>{},ensureMessageRewardClaimV1222:async()=>{},messageRewardClaimToken:()=>crypto.randomUUID()});
  const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('const COUPON_REWARD_MAX='));
  vm.runInContext(`${specs}\n${claim};this.claim=claimMessageRewardDirectV1222`,context);
  const reward=rewards.find(r=>Number(r.user_id)===1);
  await context.claim(f.env,f.user,reward,Number(reward.message_id));
  await context.claim(f.env,f.user,reward,Number(reward.message_id));
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),30000000100);
 }
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} reward failure rolls back close and every message; retry pays once`,async t=>{
 const f=await fixture(t,postgres);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now+=10800000;f.setFailure('INSERT INTO user_message_rewards');
 await assert.rejects(syncFactionSessions(f.env,f.season,f.deps),/INJECTED/);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 assert.equal(JSON.parse((await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json).session.status,'ACTIVE');
 f.setFailure('');await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
});
test('territory war cancels active round, removes alerts and prevents every combat entry',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now+=60000;
 await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',?,?,NULL)",new Date(f.clock.now).toISOString(),new Date(f.clock.now+86400000).toISOString()).run();
 const view=await factionOverview(f.env,f.season,f.user,f.deps);
 assert.equal(view.sessions.blockedByTerritory,true);assert.equal(view.sessions.active,false);
 assert.equal(view.sessions.history[0].status,'CANCELLED');
 for(const kind of ['launch','enter','strike'])await assert.rejects(act(f,kind,{districtId:'11680',squad:'attack1',battleId:'old'}),/영토전/);
 assert.deepEqual((await factionOverview(f.env,f.season,f.user,f.deps,{alertsOnly:true})).alerts,[]);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
});
test('finished territory overlap is detected after an outage; late close cannot grant cancelled rewards',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'FINISHED',?,?,?)",new Date(beginning+60000).toISOString(),new Date(beginning+86400000).toISOString(),new Date(beginning+120000).toISOString()).run();
 f.clock.now=beginning+3*3600000+100;
 const s=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(s.view.history[0].reason,'TERRITORY_WAR');assert.equal(s.view.history[0].status,'CANCELLED');
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
});
test('time boundary after combat calculation rejects a late strike',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);
 const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),state=JSON.parse(row.state_json);
 state.districts.find(d=>d.id==='11680').owner=2;state.districts.find(d=>d.id==='11680').defense='defense1';
 await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(state)).run();
 const launch=await act(f,'launch',{districtId:'11680',squad:'attack1'});await act(f,'enter',{battleId:launch.battleId});
 f.deps.buildFactionBattle=async()=>{f.clock.now=beginning+10800000;return {battleV2:{teams:{B:{cards:[{maxHp:100}]}},result:{winner:'A',final:{B:[{hp:0}]}}}}};
 await assert.rejects(act(f,'strike',{battleId:launch.battleId}),/종료/);
});
test('OFF and TEST cannot create schedules or rewards; formation still works outside open hours',async t=>{
 const f=await fixture(t);const off={...f.deps,factionSessionPolicy:{enabled:false}};
 assert.equal(await syncFactionSessions(f.env,f.season,off),null);
 assert.deepEqual(await reconcileFactionSessions(f.env,off),{enabled:false});
 await f.p("UPDATE app_meta SET value=? WHERE key='clan_settings_v1'",JSON.stringify({mode:'TEST'})).run();
 await assert.rejects(syncFactionSessions(f.env,f.season,f.deps),/공개 모드/);
 await f.p("UPDATE app_meta SET value=? WHERE key='clan_settings_v1'",JSON.stringify({mode:'ON'})).run();
 f.clock.now=beginning+7*3600000;await act(f,'formation',{formation});
 assert.equal((await factionOverview(f.env,f.season,f.user,f.deps)).sessions.active,false);
});
test('concurrent closure freezes the same recipients and emits one reward per user',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now+=10800000;
 await Promise.all([syncFactionSessions(f.env,f.season,f.deps),syncFactionSessions(f.env,f.season,f.deps)]);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} due PREPARING territory blocks combat before its lazy ACTIVE transition`,async t=>{
 const f=await fixture(t,postgres);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'PREPARING',?,?,NULL)",new Date(beginning+60000).toISOString(),new Date(beginning+86400000).toISOString()).run();
 assert.equal((await syncFactionSessions(f.env,f.season,f.deps)).view.active,true);
 f.clock.now+=60000;
 await assert.rejects(act(f,'launch',{districtId:'11680',squad:'attack1'}),/영토전/);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 assert.equal((await syncFactionSessions(f.env,f.season,f.deps)).view.history[0].reason,'TERRITORY_WAR');
});

test('territory begins during the commit race: no capture or receipt is saved',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);
 f.DB.beforeBatch=()=>f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'PREPARING',?,?,NULL)",new Date(beginning).toISOString(),new Date(beginning+86400000).toISOString()).run();
 await assert.rejects(act(f,'launch',{districtId:'11680',squad:'attack1'}),/영토전/);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM clan_faction_receipts').first()).count),0);
 assert.equal((await factionOverview(f.env,f.season,f.user,f.deps)).holdings,0);
});

test('roster transfer during close retries against the final roster atomically',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now+=10800000;f.DB.beforeBatch=()=>f.p('UPDATE clan_members SET clan_id=2 WHERE season_id=7 AND user_id=1').run();
 await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),11);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages WHERE user_id=1').first()).count),0);
});

test('holdings are counted at close: losing the fourth territory removes eligibility',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f,4);
 await own(f,3);f.clock.now+=10800000;await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 await own(f,4);f.clock.now+=10800000;await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
});

test('midnight closes an outstanding round once and does not reward a missed window',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now=beginning+86400000;
 const s=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(s.view.current.key,'2026-09-23:1');assert.equal(s.view.active,true);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM clan_faction_days_v1').first()).count),2);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM clan_faction_sessions_v1').first()).count),1);
 await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
});

test('season rollover reconciles the preceding session before the new season claims a window',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now=beginning+10800000;
 await f.p("UPDATE clan_seasons SET phase='FINISHED' WHERE id=7").run();
 await f.p("INSERT INTO clan_seasons VALUES(8,3,'ACTIVE',?,?)",new Date(f.clock.now).toISOString(),f.season.ends_at).run();
 const result=await reconcileFactionSessions(f.env,f.deps);
 assert.equal(result.session.current.key,'2026-09-22:2');
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),12);
 assert.equal(Number((await f.p("SELECT season_id FROM clan_faction_session_owners_v1 WHERE session_key='2026-09-22:2'").first()).season_id),8);
});

test('a partial season window is skipped and an early season closure never pays a full-round reward',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 f.clock.now+=60000;await f.p("UPDATE clan_seasons SET phase='FINISHED' WHERE id=7").run();
 const s=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(s.view.history[0].status,'CANCELLED');assert.equal(s.view.history[0].reason,'SEASON_END');
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 assert.equal(s.view.schedule[1].status,'SKIPPED');
});

test('unapproved alternate policies are testable: participants only, KEEP map and immediate SETTLE',async t=>{
 const f=await fixture(t,false,{recipients:'PARTICIPANTS',interruption:'SETTLE',mapPolicy:'KEEP'});
 await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),state=JSON.parse(row.state_json);
 state.session.participants=[1,2,101];state.session.participantClans={1:1,2:1,101:2};await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(state)).run();
 f.clock.now+=60000;await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',?,?,NULL)",new Date(f.clock.now).toISOString(),new Date(f.clock.now+86400000).toISOString()).run();
 const result=await factionOverview(f.env,f.season,f.user,f.deps);
 assert.equal(result.holdings,4);assert.equal(result.sessions.history[0].myReward,30000000000);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),2);
});

test('approved KEEP policy retains ownership, formations and protection across both daily rounds',async t=>{
 const f=await fixture(t,false,{mapPolicy:'KEEP'});
 const before=JSON.parse((await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json);
 const opened=await syncFactionSessions(f.env,f.season,f.deps);
 assert.deepEqual(opened.row.state.districts.map(d=>d.owner),before.districts.map(d=>d.owner),'first cutover also retains the live map');
 await own(f,4);
 f.clock.now+=10800000;const next=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(next.view.current.ordinal,2);assert.equal(next.row.state.districts.filter(d=>d.owner===1).length,4);
 assert.deepEqual(next.row.state.formations,before.formations);
 assert.deepEqual(next.row.state.districts.map(d=>d.protectedUntil),before.districts.map(d=>d.protectedUntil));
 f.clock.now+=10800000;await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),24,'one qualifying reward per user per actual round');
});

test('warm overview synchronization has no write, schema scan or schedule reroll',async t=>{
 const f=await fixture(t);await syncFactionSessions(f.env,f.season,f.deps);
 const sql=[],prepare=f.DB.prepare.bind(f.DB);f.DB.prepare=source=>{sql.push(source);return prepare(source)};
 await syncFactionSessions(f.env,f.season,f.deps);
 assert.ok(sql.every(q=>q.startsWith('SELECT')));assert.equal(sql.length,6);
 assert.ok(sql.every(q=>!/information_schema|clan_faction_days_v1/.test(q)));
 let touched=false;await reconcileFactionSessions({get DB(){touched=true;throw Error('OFF must not query')}},{factionSessionPolicy:{enabled:false}});
 assert.equal(touched,false);
});

test('background scheduler awaits sessions and closes the connection even after settlement failure',async()=>{
 for(const shouldFail of [false,true]){
  const events=[],db={prepare:()=>({bind:()=>({run:async()=>events.push('status')})})};
  const run=()=>runDraftSchedule({},{openDatabase:async()=>({db,close:async()=>events.push('close')}),
   reconcile:async()=>{events.push('draft');return {phase:'ACTIVE'}},
   reconcileSessions:async env=>{assert.equal(env.DB,db);await Promise.resolve();events.push('session');if(shouldFail)throw Error('settlement offline')},now:()=>beginning});
  if(shouldFail){await assert.rejects(run(),/settlement offline/);assert.deepEqual(events,['draft','session','close'])}
  else{await run();assert.deepEqual(events,['draft','session','status','close'])}
 }
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} a silently dropped reward rolls back messages, session and next-round reset`,async t=>{
 const f=await fixture(t,postgres);await syncFactionSessions(f.env,f.season,f.deps);await own(f);
 if(postgres)await f.DB.execSchema([
  "CREATE FUNCTION skip_faction_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=1 THEN RETURN NULL; END IF; RETURN NEW; END $$",
  'CREATE TRIGGER skip_faction_reward BEFORE INSERT ON user_message_rewards FOR EACH ROW EXECUTE FUNCTION skip_faction_reward()'
 ]);
 else f.DB.sql.exec('CREATE TRIGGER skip_faction_reward BEFORE INSERT ON user_message_rewards WHEN NEW.user_id=1 BEGIN SELECT RAISE(IGNORE); END');
 f.clock.now+=10800000;
 await assert.rejects(syncFactionSessions(f.env,f.season,f.deps),/check constraint|CHECK constraint/i);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM clan_faction_sessions_v1').first()).count),0);
 const state=JSON.parse((await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json);
 assert.equal(state.session.ordinal,1);assert.equal(state.session.status,'ACTIVE');
 assert.equal(state.districts.filter(d=>d.owner===1).length,4);
});

const approvedPolicy={recipients:'PARTICIPANTS',interruption:'PAUSE',overlap:'DEFER',mapPolicy:'KEEP'};
async function participatingFixture(t,postgres=false){
 const f=await fixture(t,postgres,approvedPolicy);await syncFactionSessions(f.env,f.season,f.deps);await own(f,4);
 const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),state=JSON.parse(row.state_json);
 Object.assign(state.districts.find(d=>d.id==='11680'),{owner:2,defense:'defense1',protectedUntil:0});
 state.strikeReady[1]=beginning+20*60000;
 await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(state)).run();
 const battle=await act(f,'launch',{districtId:'11680',squad:'attack1'});
 await act(f,'enter',{battleId:battle.battleId});
 const other=await f.p('SELECT * FROM users WHERE id=2').first();
 await mutateFaction(f.env,f.season,other,'enter',{requestId:crypto.randomUUID(),battleId:battle.battleId},f.deps);
 return {...f,battleId:battle.battleId};
}
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} approved pause freezes combat and remaining time; resume pays participating members only`,async t=>{
 const f=await participatingFixture(t,postgres),pausedAt=beginning+10*60000,resumedAt=beginning+4*3600000;
 const original=await syncFactionSessions(f.env,f.season,f.deps),battleEnd=original.row.state.battles.find(b=>b.id===f.battleId).endsAt;
 f.clock.now=pausedAt;
 await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',?,?,NULL)",new Date(pausedAt).toISOString(),new Date(resumedAt).toISOString()).run();
 const paused=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(paused.view.current.status,'PAUSED');assert.equal(paused.view.current.remainingMs,170*60000);
 assert.equal(paused.view.history.length,0);assert.equal(paused.row.state.battles.find(b=>b.id===f.battleId).status,'ACTIVE');
 f.clock.now=resumedAt-1;
 const still=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(still.view.current.remainingMs,170*60000);assert.equal(still.row.state.battles.find(b=>b.id===f.battleId).status,'ACTIVE');
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 await assert.rejects(act(f,'strike',{battleId:f.battleId}),/영토전/);
 await f.p("UPDATE territory_war_v3_rounds SET status='FINISHED',settled_at=? WHERE id=1",new Date(resumedAt).toISOString()).run();
 f.clock.now=resumedAt;
 const resumed=await syncFactionSessions(f.env,f.season,f.deps),duration=resumedAt-pausedAt;
 assert.equal(resumed.view.active,true);assert.equal(resumed.view.current.endsAt,beginning+10800000+duration);
 assert.equal(resumed.row.state.battles.find(b=>b.id===f.battleId).endsAt,battleEnd+duration);
 assert.equal(resumed.row.state.strikeReady[1],beginning+20*60000+duration);
 assert.equal(resumed.view.schedule[1].status,'QUEUED','another round waits instead of overlapping the paused/resumed round');
 await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal((await syncFactionSessions(f.env,f.season,f.deps)).view.current.endsAt,resumed.view.current.endsAt,'resume is idempotent');
 f.clock.now=resumed.view.current.endsAt;const deferred=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(deferred.view.current.ordinal,2);assert.equal(deferred.view.current.endsAt-deferred.view.current.startsAt,10800000);
 assert.equal(deferred.view.current.startsAt,f.clock.now);assert.deepEqual(deferred.row.state.session.participants,[]);
 const recipients=(await f.p('SELECT user_id,reward_amount FROM user_message_rewards ORDER BY user_id').all()).results;
 assert.deepEqual(recipients.map(r=>[Number(r.user_id),Number(r.reward_amount)]),[[1,30000000000],[2,30000000000]]);
 const neutral=deferred.row.state.districts.find(d=>!d.owner);
 await act(f,'launch',{districtId:neutral.id,squad:'attack1'});
 f.clock.now=deferred.view.current.endsAt;await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages WHERE user_id=1').first()).count),2);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages WHERE user_id=2').first()).count),1,'participation does not carry into the deferred next round');
});

test('an outage spanning two completed territory wars preserves exactly three hours of play',async t=>{
 const f=await participatingFixture(t);
 for(const [id,start,end] of [[1,10,20],[2,30,60]])await f.p("INSERT INTO territory_war_v3_rounds VALUES(?,'FINISHED',?,?,?)",id,new Date(beginning+start*60000).toISOString(),new Date(beginning+end*60000).toISOString(),new Date(beginning+end*60000).toISOString()).run();
 f.clock.now=beginning+200*60000;
 const current=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(current.view.active,true);assert.equal(current.view.current.endsAt,beginning+220*60000);
 assert.equal(current.view.current.pausedTotalMs,40*60000);assert.equal(current.row.state.session.pauses.length,2);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
 f.clock.now=beginning+240*60000;const done=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(done.view.active,true);assert.equal(done.view.current.ordinal,2);
 assert.equal(done.view.current.startsAt,f.clock.now);assert.equal(done.view.current.endsAt,f.clock.now+10800000);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),2);
});

test('a paused round can cross midnight without reopening it or starting a parallel daily round',async t=>{
 const f=await participatingFixture(t);f.clock.now=beginning+60000;
 await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',?,?,NULL)",new Date(f.clock.now).toISOString(),new Date(beginning+86400000).toISOString()).run();
 await syncFactionSessions(f.env,f.season,f.deps);
 f.clock.now=beginning+86400000;
 const tomorrow=await syncFactionSessions(f.env,f.season,f.deps);
 assert.equal(tomorrow.view.current.key,'2026-09-22:1');assert.equal(tomorrow.view.current.status,'PAUSED');
 assert.equal(tomorrow.view.schedule[0].reason,'PREVIOUS_SESSION');assert.equal(tomorrow.view.schedule[0].status,'QUEUED');
 assert.ok(tomorrow.view.queue.some(s=>s.key==='2026-09-22:2'),'yesterday second round is retained');
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM clan_faction_session_owners_v1').first()).count),1);
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM user_messages').first()).count),0);
});

test('participation in another clan cannot be transferred into its qualifying reward',async t=>{
 const f=await participatingFixture(t);
 await f.p('UPDATE clan_members SET clan_id=2 WHERE season_id=7 AND user_id=2').run();
 const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),state=JSON.parse(row.state_json);
 state.districts.slice(4,8).forEach(d=>d.owner=2);await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(state)).run();
 f.clock.now=beginning+10800000;await syncFactionSessions(f.env,f.season,f.deps);
 assert.deepEqual((await f.p('SELECT user_id FROM user_messages ORDER BY user_id').all()).results.map(r=>Number(r.user_id)),[1]);
});
