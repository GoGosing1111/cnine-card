import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {OP,hash,grant,verify,snapshot,artifacts,accountingEnv} from './grant.mjs';import {readPackageCoinAccounting,requirePredictionCoins} from '../../tmp/duo-settlement-recovery-20261027/functions/_package_coin_accounting.js';
const token='a'.repeat(64),options=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(t){const db=new PGlite();t.after(()=>db.close());await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT DEFAULT 7);
CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT);
CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TIMESTAMPTZ);
CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TIMESTAMPTZ);
CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,PRIMARY KEY(user_id,item_code));
CREATE TABLE account_sync_versions_v1(user_id BIGINT PRIMARY KEY,revision BIGINT,domains JSONB);
CREATE TABLE user_mutation_locks_v1520(user_id BIGINT PRIMARY KEY,token TEXT,action_path TEXT,lease_until_ms BIGINT);
CREATE FUNCTION sync_coin() RETURNS TRIGGER AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_build_object('wallet',revision+1) WHERE user_id=NEW.id; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER wallet_sync AFTER UPDATE OF coin ON users FOR EACH ROW EXECUTE FUNCTION sync_coin();
INSERT INTO users VALUES(1,'OWNER','ACTIVE','OWNER',1,8);`);
 const targets=[];for(const [id,quantity] of [['2',2],['3',1]]){const idn=Number(id),amount=(400000000000000n*BigInt(quantity)).toString(),nickname='검수'+id;
  const order={id:id+'_1234567890123456',userId:idn,nickname,quantity,status:'FULFILLED',processedAt:Date.parse('2026-11-01T09:00:00+09:00'),fulfillment:{coins:Number(amount)}},raw=JSON.stringify(order),key='support_package_order_v1:'+order.id;
  await db.query("INSERT INTO users(id,nickname,status,role,coin) VALUES($1,$2,'ACTIVE','USER',1000000001234)",[id,nickname]);await db.query("INSERT INTO user_second_verifications VALUES($1,'TEST',$2)",[id,id]);await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,raw]);
  const log=(await db.query('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2,$3,$4) RETURNING id::text,user_id::text,change_amount::text,balance_after::text,reason',[id,amount,(BigInt(amount)+1234n).toString(),'시즌패스 패키지 구매 '+order.id])).rows[0];
  await db.query("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2,1000000001234,'정상 소비')",[id,(-BigInt(amount)+1000000000000n).toString()]);
  await db.query("INSERT INTO cnine_user_inventory VALUES($1,'WEAPON_ENHANCEMENT_SCROLL',4)",[id]);await db.query("INSERT INTO account_sync_versions_v1 VALUES($1,1,'{\"wallet\":1}')",[id]);await db.query('INSERT INTO user_mutation_locks_v1520 VALUES($1,$2,$3,$4)',[id,token,OP,Date.now()+300000]);
  if(id==='3')await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['support_package_coin_v1:'+id,JSON.stringify({version:1,revision:1,cursor:0,restricted:Number(amount),auctionReserved:{},precredited:order.id})]);
  targets.push({id,nickname,status:'ACTIVE',role:'USER',identityHash:hash({provider:'TEST',providerUserId:id}),orders:[{key,raw,hash:hash(raw),quantity,beforeCoins:amount,amount:(100000000000000n*BigInt(quantity)).toString(),log}],amount:(100000000000000n*BigInt(quantity)).toString()});
 }
 const plan={operationKey:OP,dateKst:'2026-11-01',delivery:'DIRECT',sendMessages:false,targetCoinsPerPurchase:'500000000000000',logFloor:{coins:'4',audit:'0'},targets,totalAmount:'300000000000000'};
 const wrapped={query:(sql,args)=>sql.startsWith("SELECT to_char(CURRENT_TIMESTAMP")?Promise.resolve({rows:[{kst:'2026-11-01'}]}):db.query(sql,args)};return {db:wrapped,raw:db,plan};
}
async function state(db,plan){return {snapshot:await snapshot(db,plan),artifacts:await artifacts(db,plan),accounting:await Promise.all(plan.targets.map(t=>readPackageCoinAccounting(accountingEnv(db),t.id)))};}
test('actual paid quantity determines the difference; spent coins stay spent; restricted accounting and SELECT-only replay stay exact',async t=>{const {db,plan}=await fixture(t);await db.query('BEGIN');const r=await grant(db,plan,options());await db.query('COMMIT');assert.equal(r.verification.totalAmount,'300000000000000');assert.deepEqual(r.receipt.grants.map(g=>g.amount),['200000000000000','100000000000000']);
 for(const target of plan.targets){const s=await readPackageCoinAccounting(accountingEnv(db),target.id);assert.equal(s.totalExact,(1000000001234n+BigInt(target.amount)).toString());assert.equal(s.availableExact,'1234');assert.throws(()=>requirePredictionCoins(s,1235),{code:'PREDICTION_PACKAGE_COIN'});}
 const before=await state(db,plan),reread=await grant({query:(s,a)=>{assert.match(s,/^SELECT\b/);return db.query(s,a);}},plan);assert(reread.replayed);assert.deepEqual(await state(db,plan),before);assert((await verify(db,plan)).verified);
});
test('partial failure at the second recipient, accounting, audit or receipt rolls all recipients back',async t=>{const {db,plan}=await fixture(t),before=await state(db,plan);
 for(const [prefix,nth] of [['UPDATE users',2],['INSERT INTO coin_logs',1],['INSERT INTO app_meta',1],['INSERT INTO admin_logs',1],['INSERT INTO app_meta',3]]){let n=0;await db.query('BEGIN');await assert.rejects(grant({query:(s,a)=>s.startsWith(prefix)&&++n===nth?Promise.reject(Error('INJECTED')):db.query(s,a)},plan,options()),/INJECTED/);await db.query('ROLLBACK');assert.equal(n,nth);assert.deepEqual(await state(db,plan),before);}
});
test('wrong identity, missing account lease, changed original payment and bigint overflow cannot issue a grant',async t=>{const {db,plan}=await fixture(t);
 for(const sql of ["UPDATE user_second_verifications SET provider_user_id='wrong' WHERE user_id=2","DELETE FROM user_mutation_locks_v1520 WHERE user_id=2","UPDATE app_meta SET value='{}' WHERE key='support_package_order_v1:2_1234567890123456'","UPDATE users SET coin=9223372036854775807 WHERE id=2"]){await db.query('BEGIN');await db.query(sql);await assert.rejects(grant(db,plan,options()));await db.query('ROLLBACK');assert.equal((await artifacts(db,plan)).receipt,null);}
});
