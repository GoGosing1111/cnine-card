import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {AMOUNT,TITLE} from './common.mjs';
const live='C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout';
const {__postgresCompatTest}=await import(pathToFileURL(live+'/functions/_postgres_d1_compat.js'));
const {claimMessageRewardBatch}=await import(pathToFileURL(live+'/functions/_message_reward_batch.js'));
const git=args=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:live,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
const deployed='6bccff691286065bf5d1101a92eb7b5a53d47541',source=git(['show',deployed+':functions/api/[[path]].js']);
const local=readFileSync(live+'/functions/api/[[path]].js','utf8'),norm=s=>s.replace(/\r\n/g,'\n');
const extract=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start+1);assert(start>=0&&end>start);return s.slice(start,end);};
const bounds=[['const VERIFIED_MESSAGE_REWARD_TYPES=','const COUPON_REWARD_MAX='],['async function claimMessageRewardDirectV1222(','async function canSafelyRecoverFailedMessageRewardV1222(']];
const [specs,claim]=bounds.map(([a,b])=>{const x=extract(source,a,b);assert.equal(norm(x),norm(extract(local,a,b)));return x;});
const digest=s=>createHash('sha256').update(norm(s)).digest('hex');
for(const file of ['functions/_postgres_d1_compat.js','functions/_message_reward_batch.js'])assert.equal(norm(git(['show',deployed+':'+file])),norm(readFileSync(live+'/'+file,'utf8')));
writeFileSync(new URL('claim-source-verification.json',import.meta.url),JSON.stringify({deployedCommit:deployed,specsHash:digest(specs),claimHash:digest(claim),compatAndBatchMatched:true,checkedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
const INITIAL='5104181794540984';
async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`
  CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE TABLE users(id bigint PRIMARY KEY,coin bigint,card_shards bigint DEFAULT 0);
  CREATE TABLE user_messages(id bigint PRIMARY KEY,user_id bigint,title text,is_read integer DEFAULT 0,read_at text,hidden_at text);
  CREATE TABLE user_message_rewards(id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
  CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claim_token text UNIQUE,balance_before bigint,balance_after bigint,source text,credited_at text);
  CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text);
  CREATE TABLE wago_extension_reward_receipts(message_id bigint,user_id bigint,balance_after bigint);
  INSERT INTO users VALUES(1,${INITIAL},4321),(2,777,123);
  INSERT INTO user_messages(id,user_id,title) VALUES(1,1,'${TITLE}');
  INSERT INTO user_message_rewards VALUES(1,1,1,'COIN',${AMOUNT},NULL);
 `);
 let fail=false;
 const client={async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
  if(fail&&text.includes('INSERT INTO coin_logs'))return pg.query('SELECT 1/0');
  const r=await pg.query(text,values);return {...r,rowCount:r.affectedRows??r.rows.length};
 }};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const context=vm.createContext({ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
 vm.runInContext(`${specs}\n${claim}\nthis.claim=claimMessageRewardDirectV1222;this.present=presentMessageReward;this.spec=verifiedMessageRewardSpec;`,context);
 const reward=(await pg.query('SELECT * FROM user_message_rewards WHERE id=1')).rows[0];
 return {pg,env,context,reward,claim:()=>context.claim(env,{id:1},reward,1),fail:v=>{fail=v;}};
}
async function exact(f){
 const expected=String(BigInt(INITIAL)+BigInt(AMOUNT));
 const user=(await f.pg.query('SELECT coin::text,card_shards::text FROM users WHERE id=1')).rows[0];assert.deepEqual(user,{coin:expected,card_shards:'4321'});
 assert.deepEqual((await f.pg.query('SELECT coin::text,card_shards::text FROM users WHERE id=2')).rows,[{coin:'777',card_shards:'123'}]);
 assert.deepEqual((await f.pg.query('SELECT change_amount::text,balance_after::text,reason FROM coin_logs')).rows,[{change_amount:AMOUNT,balance_after:expected,reason:'MESSAGE_REWARD#1'}]);
 assert.deepEqual((await f.pg.query('SELECT reward_amount::text,balance_before::text,balance_after::text FROM user_message_reward_claim_receipts_v1222')).rows,[{reward_amount:AMOUNT,balance_before:INITIAL,balance_after:expected}]);
 assert((await f.pg.query('SELECT claimed_at FROM user_message_rewards')).rows[0].claimed_at);
 assert((await f.pg.query('SELECT hidden_at FROM user_messages')).rows[0].hidden_at);
}
test('1000-trillion COIN attachment adds the exact amount once to a large buyer balance',async t=>{
 const f=await fixture(t);assert.equal(f.context.present(f.reward).reward_supported,true);assert.equal(f.context.present(f.reward).reward_label,'코인');
 assert.equal((await f.claim()).credited,true);assert.equal((await f.claim()).duplicate,true);await exact(f);
});
test('ledger failure rolls back wallet, message and claim receipt, then safely retries',async t=>{
 const f=await fixture(t);f.fail(true);await assert.rejects(f.claim(),/division by zero/);
 assert.equal((await f.pg.query('SELECT coin::text FROM users WHERE id=1')).rows[0].coin,INITIAL);
 for(const table of ['coin_logs','user_message_reward_claim_receipts_v1222'])assert.equal((await f.pg.query('SELECT * FROM '+table)).rows.length,0);
 assert.equal((await f.pg.query('SELECT claimed_at FROM user_message_rewards')).rows[0].claimed_at,null);assert.equal((await f.pg.query('SELECT hidden_at FROM user_messages')).rows[0].hidden_at,null);
 f.fail(false);assert.equal((await f.claim()).credited,true);await exact(f);
});
test('actual batch route rejects another user and retry cannot credit twice',async t=>{
 const f=await fixture(t),deps={specFor:f.context.spec,canRecover:async()=>false,claim:f.context.claim};
 const wrong=await claimMessageRewardBatch(f.env,{id:2},[1],deps);assert(wrong[0].error);
 const first=await claimMessageRewardBatch(f.env,{id:1},[1],deps);assert.equal(first[0].ok,true);
 const replay=await claimMessageRewardBatch(f.env,{id:1},[1],deps);assert.equal(replay[0].alreadyClaimed,true);await exact(f);
});
