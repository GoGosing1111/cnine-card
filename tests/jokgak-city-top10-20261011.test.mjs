import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {settleCityRound} from '../functions/_jokgak_city_round.js';
import {prepareCityTopSettlement,CITY_TOP_CURSOR} from '../functions/_jokgak_city_top.js';
import {CITY_TOP10_EVENT as E,rankCityTop10,validateCityTop10Plan} from '../functions/_jokgak_city_top10_event.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {assignedCityRole} from '../functions/_jokgak_city_roles.js';

async function fixture(t,pg,tiePolicy='INCLUDE_CUTOFF_TIES',scheduled=true){
 const f=await cityFixture(t,pg);f.setTime(E.startsAt+60000);
 const id=pg?'BIGSERIAL PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT',n=pg?'BIGINT':'INTEGER';
 const schema=[
  `CREATE TABLE user_messages(id ${id},user_id ${n},sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key))`,
  `CREATE TABLE user_message_rewards(id ${id},message_id ${n} UNIQUE,user_id ${n},reward_type TEXT,reward_amount ${n},claimed_at TEXT)`
 ];
 if(pg)await f.env.DB.execSchema(schema);else for(const sql of schema)await f.p(sql).run();
 if(scheduled)await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',E.operationKey,JSON.stringify({...E,status:'SCHEDULED',tiePolicy,adminId:80})).run();
 return f;
}
async function cash(f,id,balance){const key=cityLifeKey(id),life=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);life.wallets.ON.balance=balance;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(life),key).run();}
const receipt=async f=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',E.operationKey).first()).value);
const count=async(f,table)=>Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n);

for(const pg of [false,true]){const db=pg?'Postgres':'SQLite';
 test(db+': one scheduled rotation ranks final ON cash, includes cutoff ties and leavers, excludes TEST/banned accounts, and attaches 500B without crediting wallets',async t=>{
  const f=await fixture(t,pg);
  for(let id=1;id<=14;id++){await f.join(id);await cash(f,id,id<=9?20000-id*100: id<=11?10000:id===12?9999:999999);}
  await f.action(10,'leave');
  await f.p("UPDATE users SET status='BANNED' WHERE id=13").run();
  const actions=(await f.p('SELECT request_id,result_json FROM jokgak_city_actions_v1 WHERE user_id=14').all()).results;
  for(const a of actions)await f.p('UPDATE jokgak_city_actions_v1 SET result_json=? WHERE request_id=?',JSON.stringify({...JSON.parse(a.result_json),mode:'TEST'}),a.request_id).run();
  await settleCityRound(f.env,E.endsAt-1);assert.equal(await count(f,'user_messages'),0);
  await settleCityRound(f.env,E.endsAt);const r=await receipt(f);
  assert.equal(r.status,'COMPLETED');assert.equal(r.candidateCount,12);assert.equal(r.recipientCount,11);assert.equal(r.totalCoin,'5500000000000');
  assert.deepEqual(r.recipients.map(x=>x.userId),Array.from({length:11},(_,i)=>i+1));assert.equal(r.recipients[10].rank,10);
  const rewards=(await f.p('SELECT * FROM user_message_rewards ORDER BY user_id').all()).results;assert.equal(rewards.length,11);
  for(const reward of rewards){assert.equal(reward.reward_type,'COIN');assert.equal(Number(reward.reward_amount),500_000_000_000);assert.equal(reward.claimed_at,null);}
  for(const u of (await f.p('SELECT coin FROM users').all()).results)assert.equal(Number(u.coin),123456);
  assert.equal(await count(f,'coin_logs'),0);assert.equal(await count(f,'jokgak_city_actions_v1'),0);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='JOKGAK_CITY_TOP10_MESSAGE_SEND'").first()).n),1);
  await settleCityRound(f.env,E.endsAt,{force:true});f.setTime(E.endsAt);await f.join(12);await settleCityRound(f.env,E.endsAt+21600000);assert.equal(await count(f,'user_messages'),11,'later shift cannot repeat event');
 });
 test(db+': message, reward, audit, snapshot and round expiry roll back together; lost commit response and stale plans cannot pay again',async t=>{
  const f=await fixture(t,pg);await f.join(1);const end=cityShift(f.now).endsAt;
  for(const failure of ['INSERT INTO user_message_rewards',"'JOKGAK_CITY_TOP10_MESSAGE_SEND'",'DELETE FROM jokgak_city_actions_v1']){
   f.fail(failure);await assert.rejects(settleCityRound(f.env,end),/INJECTED/);f.fail('');
   assert.equal(await count(f,'user_messages'),0);assert.equal(await count(f,'user_message_rewards'),0);assert.equal((await receipt(f)).status,'SCHEDULED');
   assert.equal(Number((await f.p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first()).value),E.epoch);assert.ok(await count(f,'jokgak_city_actions_v1')>0);
  }
  const stale=await prepareCityTopSettlement(f.env,cityShift(end));f.lost();await settleCityRound(f.env,end);await settleCityRound(f.env,end,{force:true});
  await assert.rejects(f.env.DB.batch(stale.statements),/constraint|guard/i);
  assert.equal(await count(f,'user_messages'),1);assert.equal(await count(f,'user_message_rewards'),1);assert.equal((await receipt(f)).status,'COMPLETED');
 });
 test(db+': a changed balance or late entrant invalidates the prepared ranking before any messages commit',async t=>{
  const f=await fixture(t,pg);await f.join(1);await cash(f,1,10000);
  const a=await prepareCityTopSettlement(f.env,cityShift(E.endsAt));await cash(f,1,5000);await assert.rejects(f.env.DB.batch(a.statements),/constraint|guard/i);
  const b=await prepareCityTopSettlement(f.env,cityShift(E.endsAt));await f.join(2);await assert.rejects(f.env.DB.batch(b.statements),/constraint|guard/i);
  assert.equal(await count(f,'user_messages'),0);await settleCityRound(f.env,E.endsAt);assert.equal((await receipt(f)).recipients[0].userId,2);
 });
 test(db+': final automatic income is projected using the same frozen career rules as trophy settlement',async t=>{
  const f=await fixture(t,pg);const policy=(await readCitySettings(f.env)).policy;policy.career.enabled=true;policy.career.startedAt=f.now;await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);
  for(const id of [1,2]){await f.join(id);await cash(f,id,10000);}
  await settleCityRound(f.env,E.endsAt);const r=await receipt(f);
  for(const recipient of r.recipients){const role=await assignedCityRole(f.env,recipient.userId,E.epoch);const rate=policy.career.rates.find(x=>x.code===role).cash;assert.equal(recipient.cash,10000+5*rate);}
 });
 test(db+': missing activation never sends; no-participant settlement completes once with zero recipients',async t=>{
  const f=await fixture(t,pg,'INCLUDE_CUTOFF_TIES',false);await f.join(1);await settleCityRound(f.env,E.endsAt);assert.equal(await count(f,'user_messages'),0);
  const empty=await fixture(t,pg);await settleCityRound(empty.env,E.startsAt);await settleCityRound(empty.env,E.endsAt);assert.equal((await receipt(empty)).recipientCount,0);assert.equal(await count(empty,'user_messages'),0);
 });
}
test('one-time constants and candidate validation cannot silently change award or date',()=>{
 assert.equal(cityShift(E.startsAt).id,E.epoch);assert.equal(cityShift(E.startsAt).endsAt,E.endsAt);
 assert.throws(()=>validateCityTop10Plan({...E,status:'SCHEDULED',tiePolicy:'INCLUDE_CUTOFF_TIES',adminId:1,rewardAmount:1}),/MISMATCH/);
 assert.throws(()=>rankCityTop10([{id:1,cash:100},{id:1,cash:200}]),/INVALID/);
 assert.throws(()=>rankCityTop10([{id:1,cash:NaN}]),/INVALID/);
});
test('Postgres: actual message claim credits 500B once, rolls back a failed coin ledger and leaves a matching receipt',async t=>{
 const f=await fixture(t,true);await f.env.DB.execSchema([
  'CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT)'
 ]);
 await f.join(1);await settleCityRound(f.env,E.endsAt);
 const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('const COUPON_REWARD_MAX='));
 const claim=source.slice(source.indexOf('async function claimMessageRewardDirectV1222('),source.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
 const ctx=vm.createContext({ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>crypto.randomUUID()});
 vm.runInContext(specs+'\n'+claim+'\nthis.claim=claimMessageRewardDirectV1222;',ctx);
 const reward=await f.p('SELECT * FROM user_message_rewards WHERE user_id=1').first();
 f.fail('INSERT INTO coin_logs');await assert.rejects(ctx.claim(f.env,{id:1},reward,Number(reward.message_id)),/INJECTED/);f.fail('');
 assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),123456);assert.equal(await count(f,'user_message_reward_claim_receipts_v1222'),0);
 const result=await ctx.claim(f.env,{id:1},reward,Number(reward.message_id));assert.equal(result.balanceAfter,500000123456);
 assert.equal((await ctx.claim(f.env,{id:1},reward,Number(reward.message_id))).duplicate,true);
 assert.equal(await count(f,'coin_logs'),1);const claimed=await f.p('SELECT * FROM user_message_reward_claim_receipts_v1222').first();assert.equal(Number(claimed.reward_amount),500000000000);assert.equal(Number(claimed.balance_after)-Number(claimed.balance_before),500000000000);
});
