import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const original=JSON.parse(await fs.readFile(new URL('plan.json',import.meta.url),'utf8'));
const frozenSource=JSON.parse(await fs.readFile(new URL('source.json',import.meta.url),'utf8'));
const parent={status:'COMPLETED',operationKey:original.parentOperation,auditId:'53979',grants:Array.from({length:96},(_,i)=>({userId:String(10000+i),amount:'500000000000000'}))};
const plan={...original,parentReceiptHash:hash(parent),logFloor:{coins:'0',audit:'0'}};
const source=(await fs.readFile(new URL('grant.mjs',import.meta.url),'utf8'))
 .replace("import plan from './plan.json' with {type:'json'};",'const plan='+JSON.stringify(plan)+';')
 .replace("import frozenSource from './source.json' with {type:'json'};",'const frozenSource='+JSON.stringify(frozenSource)+';')
 .replace("HASH='53516b762a196311b9801ed192248be69af6d05dca2e4f1f249e0acf44f2c42d'","HASH='"+hash(plan)+"'");
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const token='a'.repeat(64),opts=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint DEFAULT 0,magic_crystals bigint DEFAULT 0);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text,verified_at text);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint PRIMARY KEY,balance bigint);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,admin_id bigint,created_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text);
 CREATE FUNCTION sync_wallet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{wallet}',to_jsonb((domains->>'wallet')::bigint+1)) WHERE user_id=NEW.id; RETURN NEW; END $$;
 CREATE TRIGGER users_wallet AFTER UPDATE OF coin ON users FOR EACH ROW EXECUTE FUNCTION sync_wallet();
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0);
 `);
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[plan.parentOperation,JSON.stringify(parent),'previous']);
 for(const t of plan.targets){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,7,9) ON CONFLICT(id) DO UPDATE SET nickname=EXCLUDED.nickname,role=EXCLUDED.role,status=EXCLUDED.status,coin=EXCLUDED.coin',[t.id,t.nickname,t.role,t.status,String(1000n+BigInt(t.id))]);
  await db.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK',$2,'2026-11-01 00:00:00')",[t.id,t.dkUuid]);
  await db.query("INSERT INTO account_sync_versions_v1 VALUES($1,1,'{\"wallet\":1,\"collection\":1,\"messages\":1}')",[t.id]);
  await db.query('INSERT INTO user_mutation_locks_v1520 VALUES($1,$2,$3,$4)',[t.id,token,api.OP,Date.now()+120000]);
  await db.query("INSERT INTO cnine_user_inventory VALUES($1,'MASTER_STAR',17)",[t.id]);
  await db.query("INSERT INTO user_mercenary_cards_v1 VALUES($1,'V-979',2)",[t.id]);
  await db.query("INSERT INTO user_mercenary_levels_v1 VALUES($1,'V-979',10)",[t.id]);
  await db.query("INSERT INTO user_mercenary_growth_v1 VALUES($1,'V-979',200)",[t.id]);
  await db.query("INSERT INTO user_mercenary_loadout_v1 VALUES($1,'V-979')",[t.id]);
  await db.query('INSERT INTO pig_coin_wallets_v1 VALUES($1,3)',[t.id]);
  await db.query("INSERT INTO app_meta VALUES($1,'{\"restricted\":1000,\"cursor\":0}','old')",['support_package_coin_v1:'+t.id]);
 }
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};
 return {db,client};
}
test('all three specified verified authors get exactly 500 trillion once; spending is not restored by replay',async()=>{
 const {db,client}=await fixture();try{
  const before=await api.snapshot(client);await db.exec('BEGIN');const result=await api.grant(client,api.HASH,opts());await db.exec('COMMIT');
  assert.equal(result.receipt.grants.length,3);assert.equal(result.receipt.totalAmount,'1500000000000000');
  for(const g of result.receipt.grants)assert.equal(BigInt(g.after)-BigInt(g.before),500000000000000n);
  assert.deepEqual(api.protectedState(await api.snapshot(client)),api.protectedState(before));
  const first=api.IDS[0];await db.query('UPDATE users SET coin=coin-100 WHERE id=$1',[first]);
  const afterSpending=await api.snapshot(client);
  const replay=await api.grant({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);assert(!/FOR UPDATE|FOR SHARE|pg_advisory/.test(sql));return client.query(sql,args);}});
  assert(replay.replayed);assert.deepEqual(replay.receipt,result.receipt);assert.deepEqual(await api.snapshot(client),afterSpending);assert.equal((await api.artifacts(client)).coins.length,3);
 }finally{await db.close();}
});
test('a late real SQL failure rolls back all three balances, logs, audit and synchronization',async()=>{
 const {db,client}=await fixture();try{
  const before=await api.snapshot(client);await db.exec('BEGIN');
  await assert.rejects(api.grant({query:(sql,args)=>sql.startsWith('INSERT INTO app_meta(')?client.query('SELECT 1/0'):client.query(sql,args)},api.HASH,opts()),/division by zero/);
  await db.exec('ROLLBACK');assert.deepEqual(await api.snapshot(client),before);assert.deepEqual(await api.artifacts(client),{receipt:null,coins:[],audits:[]});
 }finally{await db.close();}
});
test('changed DK identity, inactive account, and an unsafe resulting balance reject the whole grant',async()=>{
 const {db,client}=await fixture();try{
  const t=plan.targets[0];await db.query("UPDATE user_second_verifications SET provider_user_id='wrong' WHERE user_id=$1",[t.id]);
  await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,opts()),/identityHash changed/);await db.exec('ROLLBACK');
  await db.query('UPDATE user_second_verifications SET provider_user_id=$1 WHERE user_id=$2',[t.dkUuid,t.id]);
  await db.query("UPDATE users SET status='BANNED' WHERE id=$1",[t.id]);await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,opts()),/status changed/);await db.exec('ROLLBACK');
  await db.query("UPDATE users SET status='ACTIVE',coin=$1 WHERE id=$2",[String(Number.MAX_SAFE_INTEGER),t.id]);await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,opts()),/Unsupported resulting balance/);await db.exec('ROLLBACK');
  assert.equal((await api.artifacts(client)).coins.length,0);
 }finally{await db.close();}
});
test('wrong plan or missing account lease cannot pay any account',async()=>{
 const {db,client}=await fixture();try{
  await assert.rejects(api.grant(client,'wrong',opts()));await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1',[api.IDS[0]]);
  await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,opts()),/Missing account lease/);await db.exec('ROLLBACK');assert.equal(await api.receipt(client),null);
 }finally{await db.close();}
});

test('original 96-user receipt is preserved and a previously paid supplementary recipient blocks the whole transaction',async()=>{
 const {db,client}=await fixture();try{
  const key='ops:playdk:1441569:other-supplement';await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify({status:'COMPLETED',grants:[{userId:plan.targets[0].id}]}),'previous']);
  const before=await api.snapshot(client);await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,opts()),/already paid for this post/);await db.exec('ROLLBACK');assert.deepEqual(await api.snapshot(client),before);assert.equal(await api.receipt(client),null);
  assert.deepEqual(JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[plan.parentOperation])).rows[0].value),parent);
 }finally{await db.close();}
});
