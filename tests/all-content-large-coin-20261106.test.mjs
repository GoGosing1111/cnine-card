import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {exactWalletFixture} from './helpers/exact-wallet-fixture.mjs';
import {coinChangeStatements} from '../functions/_coin_settlement.js';
import {jointCoinDebit,runJointOperation} from '../functions/_joint_transactions.js';
import {jointGuard,jointGuardEnd} from '../functions/_joint_atomic.js';
import {addCoins,coinInteger,coinValue,MAX_COIN_SQL} from '../shared/coin-integer-v1.mjs';
import {magicFixture} from './helpers/magic-presets-fixture.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const api=read('functions/api/[[path]].js');
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,'Missing runtime section '+start);return source.slice(a,b);}
const route=(start,end)=>new AsyncFunction('d',`const {path,env,request,authenticate,readBody,json,profile,kstDate,previousKstDate,attendanceSettings,grantHighGradeRerollDrop,requirePermission,mineralExchangeSettings,writeAdminLog,coinChangeStatements,jointGuard,jointGuardEnd}=d;${section(api,start,end)}`);
const attendance=route("    if(path==='attendance/claim'","    const ultimateBulkResponse=");
const mineral=route("    if(path==='admin/mineral-exchange')","    if(path==='admin/rift-settings')");
const adminCoins=route("    if(path==='admin/coins'","    if(path==='burning-event/status')");
function deps(f,path,body={}){return {env:f.env,request:{method:path==='admin/mineral-exchange'?'PATCH':'POST'},authenticate:async()=>({id:1}),readBody:async()=>body,json:(body,status=200)=>({body,status}),profile:async(_e,u)=>u,kstDate:()=> '2026-11-06',previousKstDate:()=> '2026-11-05',attendanceSettings:async()=>({enabled:true,rewards:[7,7,7,7,7,7,7]}),grantHighGradeRerollDrop:async()=>{},requirePermission:async()=>({id:9}),mineralExchangeSettings:async()=>({dailyLimitCoin:100}),writeAdminLog:async()=>{},coinChangeStatements,jointGuard,jointGuardEnd,path};}
// These are the actual route blocks; only surrounding HTTP/config dependencies
// are supplied by the fixture, without replacing payment or receipt statements.
const call=(fn,d)=>fn({...d,env:d.env});

for(const dialect of ['postgres','sqlite']){
 test(dialect+': credits/debits retain every coin at safe-number, 10경 and DB boundaries',async t=>{
  const f=await exactWalletFixture(t,dialect);
  for(const balance of ['9007199254740991','9007199254740992','99999999999999999','100000000000000000','100000000000000001','9223372036854775800']){
   await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1',balance);
   await f.DB.batch(coinChangeStatements(f.DB,1,7,'boundary'));
   assert.equal(await f.exact(),(BigInt(balance)+7n).toString());
   const log=await f.one("SELECT CAST(balance_after AS TEXT) balance FROM coin_logs WHERE reason='boundary' ORDER BY balance_after DESC LIMIT 1");
   assert.equal(log.balance,await f.exact());
   await f.DB.batch(jointCoinDebit(f.DB,1,7,'debit'));assert.equal(await f.exact(),balance);
  }
 });
 test(dialect+': shared payments reject overflow/underflow and roll back failed ledger writes',async t=>{
  const f=await exactWalletFixture(t,dialect);
  for(const [balance,delta]of [[MAX_COIN_SQL,1],['0',-1]]){
   await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1',balance);
   await assert.rejects(f.DB.batch(coinChangeStatements(f.DB,1,delta,'invalid')));assert.equal(await f.exact(),balance);
  }
  await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1','100000000000000001');
  f.fail('INSERT INTO coin_logs');await assert.rejects(f.DB.batch(coinChangeStatements(f.DB,1,7,'failed')),/INJECTED/);
  assert.equal(await f.exact(),'100000000000000001');assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),0);
 });
 test(dialect+': joint purchases retry their saved receipt after failure and lost acknowledgement',async t=>{
  const f=await exactWalletFixture(t,dialect);
  await f.exec('CREATE TABLE joint_operations_v1(request_id TEXT PRIMARY KEY,user_id BIGINT,kind TEXT,input_hash TEXT,plan_json TEXT,status TEXT,created_at TEXT,completed_at TEXT)');
  let plans=0;const purchase=()=>runJointOperation(f.env,{id:1},{requestId:'exact-joint-purchase',kind:'EXACT_QA',input:{count:1},prepare:async()=>{plans++;return {cost:7};},statements:plan=>jointCoinDebit(f.DB,1,plan.cost,'purchase')});
  f.fail('INSERT INTO coin_logs');await assert.rejects(purchase());assert.equal(await f.exact(),'100000000000000001');
  f.loseCommit();await purchase();assert.equal(await f.exact(),'99999999999999994');assert.equal((await purchase()).replayed,true);
  assert.equal(plans,1);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),1);
 });
 test(dialect+': attendance amount, claim and ledger commit together and cannot double pay',async t=>{
  const f=await exactWalletFixture(t,dialect);await f.exec('CREATE TABLE attendance_logs(user_id BIGINT,attendance_date TEXT,reward_coin BIGINT,streak_day BIGINT,PRIMARY KEY(user_id,attendance_date))');
  const d=deps(f,'attendance/claim');
  f.fail('INSERT INTO coin_logs');await assert.rejects(call(attendance,d),/INJECTED/);assert.equal(await f.exact(),'100000000000000001');assert.equal(Number((await f.one('SELECT COUNT(*) n FROM attendance_logs')).n),0);
  f.loseCommit();assert.equal((await call(attendance,d)).status,409);assert.equal(await f.exact(),'100000000000000008');
  assert.equal((await call(attendance,d)).status,409);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),1);
  assert.equal((await f.one('SELECT CAST(balance_after AS TEXT) balance FROM coin_logs')).balance,await f.exact());
 });
 test(dialect+': mineral approval adds to exact current wallet and retries once after rollback',async t=>{
  const f=await exactWalletFixture(t,dialect);await f.exec("CREATE TABLE mineral_exchange_requests(id BIGINT PRIMARY KEY,user_id BIGINT,requested_kst_date TEXT,coin_amount BIGINT,status TEXT,reviewed_by BIGINT,reviewed_at TEXT,updated_at TEXT);INSERT INTO mineral_exchange_requests VALUES(8,1,'2026-11-06',7,'PENDING',NULL,NULL,NULL)");
  const d=deps(f,'admin/mineral-exchange',{id:8,action:'APPROVE'});
  f.fail('INSERT INTO coin_logs');await assert.rejects(call(mineral,d),/INJECTED/);assert.equal((await f.one('SELECT status FROM mineral_exchange_requests')).status,'PENDING');assert.equal(await f.exact(),'100000000000000001');
  assert.equal((await call(mineral,d)).status,200);assert.equal(await f.exact(),'100000000000000008');assert.equal((await call(mineral,d)).status,409);
  assert.equal((await f.one('SELECT CAST(balance_after AS TEXT) balance FROM coin_logs')).balance,await f.exact());
 });
 test(dialect+': administrator coin grant retains wallet precision and ledger atomicity',async t=>{
  const f=await exactWalletFixture(t,dialect),d=deps(f,'admin/coins',{userId:1,amount:7,reason:'QA'});
  f.fail('INSERT INTO coin_logs');await assert.rejects(call(adminCoins,d),/INJECTED/);assert.equal(await f.exact(),'100000000000000001');
  assert.equal((await call(adminCoins,d)).status,200);assert.equal(await f.exact(),'100000000000000008');
  assert.equal((await f.one('SELECT CAST(balance_after AS TEXT) balance FROM coin_logs')).balance,await f.exact());
 });
}

function messageFunctions(){
 const context=vm.createContext({crypto,console,messageRewardClaimToken:()=>crypto.randomUUID(),ensureVerifiedRewardMessageV1276:async()=>{},verifiedMessageRewardSpec:type=>type==='COIN'?{label:'코인',inventory:false}:null});
 vm.runInContext(section(api,'async function claimMessageRewardDirectV1222(','let prestigeCardStorageReadyPromise='),context);
 return context;
}
async function messageFixture(t){
 const f=await exactWalletFixture(t);await f.exec(`CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT,is_read INTEGER,read_at TEXT,hidden_at TEXT);INSERT INTO user_messages VALUES(2,1,0,NULL,NULL);
 CREATE TABLE user_message_rewards(id BIGINT PRIMARY KEY,message_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);INSERT INTO user_message_rewards VALUES(3,2,1,'COIN',7,NULL);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT);
 CREATE TABLE wago_extension_reward_receipts(message_id BIGINT,user_id BIGINT,amount BIGINT,balance_before BIGINT,balance_after BIGINT);`);
 const c=messageFunctions();f.claim=async()=>c.claimMessageRewardDirectV1222(f.env,{id:1},await f.one('SELECT * FROM user_message_rewards'),2);
 f.recover=()=>c.canSafelyRecoverFailedMessageRewardV1222(f.env,{id:1},{reward_type:'COIN',reward_amount:7},2);
 return f;
}
test('message claim records exact before/after at 10경+1 and survives rollback and replay',async t=>{
 const f=await messageFixture(t);f.fail('INSERT INTO coin_logs');await assert.rejects(f.claim(),/INJECTED/);assert.equal(await f.exact(),'100000000000000001');assert.equal((await f.one('SELECT claimed_at FROM user_message_rewards')).claimed_at,null);
 f.loseCommit();await assert.rejects(f.claim(),/LOST_COMMIT/);assert.equal((await f.claim()).duplicate,true);assert.equal(await f.exact(),'100000000000000008');
 const receipt=await f.one('SELECT CAST(balance_before AS TEXT) before,CAST(balance_after AS TEXT) after FROM user_message_reward_claim_receipts_v1222');assert.deepEqual(receipt,{before:'100000000000000001',after:'100000000000000008'});
 assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),1);
});
test('failed-message recovery distinguishes adjacent integers that JS Number aliases',async t=>{
 const f=await messageFixture(t);await f.exec('INSERT INTO wago_extension_reward_receipts VALUES(2,1,7,100000000000000001,100000000000000001)');assert.equal(await f.recover(),true);
 await f.exec('UPDATE users SET coin=100000000000000002');assert.equal(await f.recover(),false);
 await f.exec('UPDATE users SET coin=100000000000000001;UPDATE wago_extension_reward_receipts SET balance_after=100000000000000002');assert.equal(await f.recover(),false);
});
test('captain reward ledger and response keep exact coin at 10경+1',async t=>{
 const f=await exactWalletFixture(t);await f.exec('CREATE TABLE captain_reward_claims(id BIGINT,status TEXT,error_message TEXT,updated_at TEXT);INSERT INTO captain_reward_claims VALUES(1,\'PENDING\',NULL,NULL)');
 const s=read('functions/_captain.js'),context=vm.createContext({addCoins,coinValue});vm.runInContext(section(s,'async function rewardBalances(','async function claimCaptainReward('),context);
 f.fail('INSERT INTO coin_logs');await assert.rejects(context.grantReward(f.env,1,{coin:7},'CAPTAIN_VICTORY',1,'qa'),/INJECTED/);assert.equal(await f.exact(),'100000000000000001');
 const result=await context.grantReward(f.env,1,{coin:7},'CAPTAIN_VICTORY',1,'qa');assert.equal(result.coinBalance,'100000000000000008');assert.equal((await f.one('SELECT CAST(balance_after AS TEXT) balance FROM coin_logs')).balance,result.coinBalance);
});
test('arcana draw ledger preserves large wallet and reuses completed receipt',async t=>{
 const f=await magicFixture(true);t.after(()=>f.close());await f.p('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1','100000000000000001').run();
 const r=await f.call('magic/draw',{count:1,requestId:'qa-large-arcana-coin'});assert.equal(r.status,200,await r.clone().text());const body=await r.json();
 const expected=(100000000000000001n-BigInt(body.totalCoinCost)).toString();assert.equal((await f.p('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=1').first()).coin,expected);
 assert.equal((await f.p('SELECT CAST(balance_after AS TEXT) coin FROM coin_logs').first()).coin,expected);assert.equal((await f.call('magic/draw',{count:1,requestId:'qa-large-arcana-coin'})).status,200);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('arcana large-wallet failed ledger restores payment; lost commit never refunds a completed draw',async t=>{
 const f=await magicFixture(true);t.after(()=>f.close());await f.p('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1','100000000000000001').run();
 const body={count:1,requestId:'qa-large-arcana-recovery'},exact=async()=> (await f.p('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=1').first()).coin;
 f.fail('INSERT INTO coin_logs');assert.equal((await f.call('magic/draw',body)).status,500);f.fail('');assert.equal(await exact(),'100000000000000001');
 const batch=f.DB.batch.bind(f.DB);let lost=true;f.DB.batch=async list=>{const result=await batch(list);if(lost&&list.some(s=>s.source.includes("SET status='COMPLETED'"))){lost=false;throw Error('LOST_COMMIT');}return result;};
 const r=await f.call('magic/draw',body);assert.equal(r.status,200,await r.clone().text());const result=await r.json(),expected=(100000000000000001n-BigInt(result.totalCoinCost)).toString();assert.equal(await exact(),expected);
 assert.equal((await f.call('magic/draw',body)).status,200);assert.equal(await exact(),expected);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('pack draw grant proof uses the exact coin selected from the database',()=>{
 assert.match(api,/SELECT \*,CAST\(coin AS TEXT\) AS exact_coin FROM users/);
 const s=section(api,'        const expectedCoin=','        const expectedShards=');
 const compute=new Function('fresh','cost','addCoins',s+'return expectedCoin;');assert.equal(compute({coin:1e17,exact_coin:'100000000000000001'},7,addCoins),'99999999999999994');
 assert.match(api,/coinBefore:coinValue\(fresh.exact_coin\),coinAfter:expectedCoin/);
});

test('admin user adjustment uses exact signed arithmetic and refuses imprecise amount input',async t=>{
 const f=await exactWalletFixture(t);await f.exec('ALTER TABLE users ADD COLUMN banned_until TEXT;ALTER TABLE users ADD COLUMN ban_reason TEXT');
 const action=route("    if(path==='admin/users/action'","    if(path==='admin/users/inventory-audit'");
 const d=deps(f,'admin/users/action',{userId:1,action:'COIN',amount:-7,reason:'QA'});
 f.fail('INSERT INTO coin_logs');await assert.rejects(call(action,d),/INJECTED/);assert.equal(await f.exact(),'100000000000000001');
 assert.equal((await call(action,d)).status,200);assert.equal(await f.exact(),'99999999999999994');
 assert.equal((await f.one('SELECT CAST(balance_after AS TEXT) balance FROM coin_logs')).balance,await f.exact());
 const bad=deps(f,'admin/users/action',{userId:1,action:'COIN',amount:1e17});assert.equal((await call(action,bad)).status,400);assert.equal(await f.exact(),'99999999999999994');
});
