import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {prepareCityRewardMessage,claimCityMessageReward,cityMessageRewardKey} from '../functions/_jokgak_city_message_reward.js';
import {claimMessageRewardBatch} from '../functions/_message_reward_batch.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityRoundRewardPolicyKey,cityRoundRewardReceiptKey} from '../functions/_jokgak_city_round_rewards.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {closeCityAtNoon,CLOSE_AT,OPERATION_KEY} from '../scripts/ops/jokgak-city-noon-off-20261013.mjs';
const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise='));
const claim=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
function entry(){const c=vm.createContext({ensureVerifiedRewardMessageV1276:async()=>{},claimCityMessageReward});vm.runInContext(specs+'\n'+claim+'\nthis.claim=claimMessageRewardDirectV1222;this.spec=verifiedMessageRewardSpec;this.coupon=couponRewardSpec;',c);return c;}
const count=async(f,table)=>Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n);
const coins=async f=>Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin);
const campaign='jokgak-city:round:82957:1';
const packet={userId:1,campaign,title:'[족각도시] 회차 보상 도착',body:'참여 보상과 현금 TOP 5 보상입니다.',coin:700000000000,items:[{code:'CITY_TEST_ITEM',quantity:7}]};
async function deliver(f){const plan=await prepareCityRewardMessage(f.env,packet);await f.env.DB.batch(plan.statements);return f.p('SELECT * FROM user_message_rewards WHERE user_id=1').first();}
async function owner(f){await f.p("UPDATE users SET nickname='핑크빛유두',role='OWNER' WHERE id=1").run();}
for(const pg of [false,true]){const dialect=pg?'Postgres':'SQLite';
 test(dialect+': server message attachment holds 700B and items, claims after OFF through real single/batch entry, and never pays twice',async t=>{
  const f=await cityFixture(t,pg),c=entry(),reward=await deliver(f);
  assert.equal(await coins(f),123456);assert.equal(await count(f,'cnine_user_inventory'),0);assert.equal(await count(f,'coin_logs'),0);
  assert.equal(c.spec('JOKGAK_CITY_REWARD').messageOnly,true);assert.equal(c.coupon('JOKGAK_CITY_REWARD'),null);
  const off=(await readCitySettings(f.env)).policy;off.mode='OFF';await saveCitySettings(f.env,{id:80,role:'OWNER'},off,f.now);
  await assert.rejects(c.claim(f.env,{id:2},reward,Number(reward.message_id)),/보상/);
  assert.equal((await c.claim(f.env,{id:1},reward,Number(reward.message_id))).credited,true);
  assert.equal(await coins(f),700000123456);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first()).quantity),7);
  assert.equal((await c.claim(f.env,{id:1},reward,Number(reward.message_id))).duplicate,true);
  const batch=await claimMessageRewardBatch(f.env,{id:1},[Number(reward.message_id)],{specFor:c.spec,canRecover:async()=>false,claim:c.claim});assert.equal(batch[0].alreadyClaimed,true);
  assert.equal(await count(f,'coin_logs'),1);assert.equal(await count(f,'inventory_logs'),1);assert.equal(await count(f,'user_message_reward_claim_receipts_v1222'),1);
  assert.ok((await f.p('SELECT hidden_at FROM user_messages WHERE user_id=1').first()).hidden_at);
 });
 test(dialect+': delivery and claim failures roll back attachments, credits and receipt; lost responses and concurrent claims recover once',async t=>{
  const f=await cityFixture(t,pg),c=entry();
  f.fail('INSERT INTO user_message_rewards');await assert.rejects(deliver(f),/INJECTED/);f.fail('');
  assert.equal(await count(f,'user_messages'),0);assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',cityMessageRewardKey(campaign)).first(),null);
  const reward=await deliver(f);
  for(const failure of ['INSERT INTO coin_logs','INSERT INTO inventory_logs','UPDATE user_messages']){
   f.fail(failure);await assert.rejects(c.claim(f.env,{id:1},reward,Number(reward.message_id)),/INJECTED/);f.fail('');
   assert.equal(await coins(f),123456);assert.equal(await count(f,'cnine_user_inventory'),0);assert.equal(await count(f,'user_message_reward_claim_receipts_v1222'),0);assert.equal((await f.p('SELECT claimed_at FROM user_message_rewards WHERE user_id=1').first()).claimed_at,null);
  }
  f.lost();const recovered=await c.claim(f.env,{id:1},reward,Number(reward.message_id));assert.equal(recovered.duplicate,true);assert.equal(await coins(f),700000123456);
  const next=await prepareCityRewardMessage(f.env,{...packet,campaign:'jokgak-city:action:concurrent',coin:10,items:[]});await f.env.DB.batch(next.statements);
  const r=await f.p('SELECT * FROM user_message_rewards ORDER BY id DESC LIMIT 1').first();
  if(pg){const attempts=await Promise.allSettled([c.claim(f.env,{id:1},r,Number(r.message_id)),c.claim(f.env,{id:1},r,Number(r.message_id))]);assert.ok(attempts.some(x=>x.status==='fulfilled'));}
  else await c.claim(f.env,{id:1},r,Number(r.message_id));
  assert.equal(await coins(f),700000123466);assert.equal(await count(f,'coin_logs'),2);
 });
 test(dialect+': missing/tampered attachment and inactive item fail without consuming the message',async t=>{
  const f=await cityFixture(t,pg),reward=await deliver(f),key=cityMessageRewardKey(campaign),raw=(await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value;
  for(const value of ['{}',JSON.stringify({...JSON.parse(raw),userId:2}),JSON.stringify({...JSON.parse(raw),coin:10000000000001})]){await f.p('UPDATE app_meta SET value=? WHERE key=?',value,key).run();await assert.rejects(claimCityMessageReward(f.env,{id:1},reward,Number(reward.message_id)),/보상/);}
  await f.p('UPDATE app_meta SET value=? WHERE key=?',raw,key).run();await f.p("UPDATE inventory_items SET is_active=0 WHERE code='CITY_TEST_ITEM'").run();await assert.rejects(claimCityMessageReward(f.env,{id:1},reward,Number(reward.message_id)),/아이템/);
  assert.equal(await coins(f),123456);assert.equal(await count(f,'user_message_reward_claim_receipts_v1222'),0);
 });
 test(dialect+': noon close never runs early, settles messages before OFF, rolls back failed OFF audit, and preserves later operator reopening',async t=>{
  const f=await cityFixture(t,pg);await owner(f);f.setTime(CLOSE_AT-3600000);
  const policy=(await readCitySettings(f.env)).policy;policy.roundRewards.top5.enabled=true;policy.roundRewards.top5.ranks[0].coin=500000000000;await saveCitySettings(f.env,{id:1,role:'OWNER'},policy,f.now);
  // An isolated round snapshot represents a rule set saved before this round.
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy.roundRewards),cityRoundRewardPolicyKey(cityShift(f.now).id)).run();
  await f.join(1);assert.equal((await closeCityAtNoon(f.env,CLOSE_AT-1)).status,'NOT_DUE');assert.equal((await readCitySettings(f.env)).policy.mode,'ON');assert.equal(await count(f,'user_messages'),0);
  const before=(await readCitySettings(f.env)).policy;f.fail('INSERT INTO admin_logs');await assert.rejects(closeCityAtNoon(f.env,CLOSE_AT),/INJECTED/);f.fail('');
  assert.equal((await readCitySettings(f.env)).policy.mode,'ON');assert.equal(await count(f,'user_messages'),1);assert.equal(await coins(f),123456);
  assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',OPERATION_KEY).first(),null);
  const closed=await closeCityAtNoon(f.env,CLOSE_AT+1000);assert.equal(closed.recipients,1);assert.equal(closed.mode,'OFF');assert.equal(await count(f,'user_messages'),1);
  const current=(await readCitySettings(f.env)).policy;assert.deepEqual(current.roundRewards,before.roundRewards);assert.deepEqual(current.roles,before.roles);
  const round=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityRoundRewardReceiptKey(cityShift(f.now).id)).first()).value);assert.equal(round.delivery,'MESSAGE');
  current.mode='ON';await saveCitySettings(f.env,{id:1,role:'OWNER'},current,CLOSE_AT+2000);assert.equal((await closeCityAtNoon(f.env,CLOSE_AT+3000)).replayed,true);assert.equal((await readCitySettings(f.env)).policy.mode,'ON');
 });
}
