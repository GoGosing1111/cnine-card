import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {claimMessageRewardBatch,messageRewardBatchIds} from '../functions/_message_reward_batch.js';

const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const api=read('functions/api/[[path]].js'),app=read('js/app.js');
const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('const COUPON_REWARD_MAX='));
const claim=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
const gifts=[['UNIQUE_ADVANCEMENT_PASS',1,'전직 패스권'],['STARLIGHT_ARMOR_CORE',30,'미스틱 에너지']];

function fixture(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  sqlite.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER,card_shards INTEGER);
    INSERT INTO users VALUES(1,10000000000,150),(2,500,200);
    CREATE TABLE user_messages(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT DEFAULT '기프트',is_read INTEGER DEFAULT 0,read_at TEXT,hidden_at TEXT);
    CREATE TABLE user_message_rewards(id INTEGER PRIMARY KEY,message_id INTEGER UNIQUE,user_id INTEGER,reward_type TEXT,reward_amount INTEGER,claimed_at TEXT);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id INTEGER PRIMARY KEY,message_id INTEGER UNIQUE,user_id INTEGER,reward_type TEXT,reward_amount INTEGER,claim_token TEXT UNIQUE,balance_before INTEGER,balance_after INTEGER,source TEXT,credited_at TEXT);
  `);
  function prepare(sql,values=[]){return {sql,values,bind(...v){return prepare(sql,v)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){return execute(this)}}}
  function execute(statement){
    if(DB.fail?.(statement.sql))throw new Error('injected inventory log failure');
    const result=sqlite.prepare(statement.sql).run(...statement.values);return {meta:{changes:Number(result.changes)}};
  }
  const DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(execute);sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
  const context=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
  vm.runInContext(`${specs}\n${claim}\nthis.claim=claimMessageRewardDirectV1222;this.spec=verifiedMessageRewardSpec;`,context);
  function reward(code,amount,id=1){
    sqlite.prepare('INSERT INTO user_messages(id,user_id) VALUES(?,1)').run(id);
    sqlite.prepare('INSERT INTO user_message_rewards(id,message_id,user_id,reward_type,reward_amount) VALUES(?,?,1,?,?)').run(id,id,code,amount);
    return sqlite.prepare('SELECT * FROM user_message_rewards WHERE id=?').get(id);
  }
  return {sqlite,DB,reward,context,claim:r=>context.claim({DB},{id:1},r,r.message_id)};
}

for(const [code,amount,label] of gifts){
  test(`${code}: supported inventory reward credits exactly once and never spends it`,async t=>{
    const f=fixture(t),r=f.reward(code,amount);
    assert.equal(f.context.spec(code).label,label);assert.equal(f.context.spec(code).inventory,true);
    const first=await f.claim(r);assert.equal(first.credited,true);assert.equal(first.itemCode,code);assert.equal(first.balanceAfter,amount);
    const replay=await f.claim(r);assert.equal(replay.duplicate,true);
    const item=f.sqlite.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory').get();
    assert.equal(item.quantity,amount);assert.equal(item.unseen_quantity,amount);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM inventory_logs').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT coin FROM users WHERE id=1').get().coin,10000000000);
    assert.ok(f.sqlite.prepare('SELECT claimed_at FROM user_message_rewards').get().claimed_at);
    assert.ok(f.sqlite.prepare('SELECT hidden_at FROM user_messages').get().hidden_at);
  });
  test(`${code}: failed write rolls back reward, receipt, and message then can retry`,async t=>{
    const f=fixture(t),r=f.reward(code,amount);f.DB.fail=sql=>sql.includes('INSERT INTO inventory_logs');
    await assert.rejects(f.claim(r),/injected/);
    for(const table of ['cnine_user_inventory','inventory_logs','user_message_reward_claim_receipts_v1222'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
    assert.equal(f.sqlite.prepare('SELECT claimed_at FROM user_message_rewards').get().claimed_at,null);
    assert.equal(f.sqlite.prepare('SELECT hidden_at FROM user_messages').get().hidden_at,null);
    f.DB.fail=null;assert.equal((await f.claim(r)).balanceAfter,amount);
  });
  test(`${code}: concurrent retries only grant one reward`,async t=>{
    const f=fixture(t),r=f.reward(code,amount);
    const results=await Promise.all([f.claim(r),f.claim(r)]);
    assert.equal(results.filter(result=>result.credited).length,1);
    assert.equal(f.sqlite.prepare('SELECT quantity FROM cnine_user_inventory').get().quantity,amount);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM inventory_logs').get().n,1);
  });
}

test('separate gift messages both enter serialized bulk claim with correct labels and cache refresh',async()=>{
  const messages=gifts.map(([reward_type,reward_amount],i)=>({id:i+1,reward_type,reward_amount}));
  const sent=[],alerts=[],cache=[];let active=0;
  const context=vm.createContext({document:{querySelectorAll:()=>[]},apiRequest:async(path,{body})=>{
    assert.equal(path,'messages/claim-batch');assert.equal(active,0);active++;const ids=JSON.parse(body).messageIds;sent.push(...ids);await Promise.resolve();active--;
    return {results:ids.map(id=>{const m=messages.find(x=>x.id===id);return {ok:true,rewardType:m.reward_type,rewardAmount:m.reward_amount}}),user:{}};
  },apiUserToLocal:value=>value,saveUser:()=>{},clearApiCache:key=>cache.push(key),alert:message=>alerts.push(message),renderShell:()=>{}});
  vm.runInContext(app.slice(app.indexOf('const MESSAGE_REWARD_META='),app.indexOf('async function loadMessages()'))+'\nthis.claimAll=claimAllMessageRewards;this.claimable=claimableMessageRewards;',context);
  assert.equal(context.claimable([...messages,{id:3,reward_type:'NOT_SUPPORTED',reward_amount:1},{...messages[0],claimed_at:'done'}]).length,2);
  await context.claimAll(messages,{});assert.deepEqual(sent,[1,2]);
  for(const [,amount,label] of gifts)assert.ok(alerts[0].includes(`${label} ${amount}개`));
  assert.ok(cache.includes('inventory'));
});

test('batch retains atomic receipts, isolates another account and resumes failed items',async t=>{
  const f=fixture(t);gifts.forEach(([code,amount],i)=>f.reward(code,amount,i+1));
  const deps={specFor:f.context.spec,canRecover:async()=>false,claim:f.context.claim};
  f.DB.fail=sql=>sql.includes('INSERT INTO inventory_logs');
  const failed=await claimMessageRewardBatch({DB:f.DB},{id:1},[1,2],deps);
  assert.equal(failed.filter(row=>row.needsVerification).length,2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM user_message_reward_claim_receipts_v1222').get().n,0);
  f.DB.fail=null;
  const stranger=await claimMessageRewardBatch({DB:f.DB},{id:2},[1,2],deps);
  assert.equal(stranger.filter(row=>row.error).length,2);
  const first=await claimMessageRewardBatch({DB:f.DB},{id:1},[1,2],deps);
  assert.equal(first.filter(row=>row.ok).length,2);
  const replay=await claimMessageRewardBatch({DB:f.DB},{id:1},[1,2],deps);
  assert.equal(replay.filter(row=>row.alreadyClaimed).length,2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM inventory_logs').get().n,2);
  assert.deepEqual(messageRewardBatchIds([1,1,2]),[1,2]);
  for(const value of [[],[0],['1'],[1.5],Array(21).fill(1)])assert.equal(messageRewardBatchIds(value),null);
});

test('gift rewards are allowed by verified sending route and use a fresh paired client cache',()=>{
  const route=api.slice(api.indexOf("if((path==='admin/verified-reward-message-send'"),api.indexOf("if(path==='admin/verified-coupon-send'"));
  for(const [code] of gifts)assert.ok(route.includes(`'${code}'`));
  assert.match(read('index.html'),/js\/app\.js\?v=2046-skill-chips/);
  assert.match(read('service-worker.js'),/soop-card-shell-v2046-skill-chips/);
});
