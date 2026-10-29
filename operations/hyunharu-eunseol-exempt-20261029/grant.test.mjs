import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const original=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));
const plan={...original,recipients:original.recipients.map(u=>({...u,identityHash:hash({provider:'PLAYDK',providerUserId:'test-218'})}))};
const source=(await fs.readFile(new URL('./grant.mjs',import.meta.url),'utf8')).replace("JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'))",JSON.stringify(plan));
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const token='a'.repeat(64),options=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer,duplicate_count integer,first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text);
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text);
 CREATE TABLE workshop_craft_logs_v1668(request_id text PRIMARY KEY,output_type text,output_ref text,output_quantity bigint,success integer);
 CREATE TABLE workshop_recipes_v1668(id bigint PRIMARY KEY,output_type text,output_ref text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint PRIMARY KEY,balance bigint);
 CREATE FUNCTION sync_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{collection}',to_jsonb((domains->>'collection')::bigint+1)) WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER holdings_sync AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION sync_collection();
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0),(218,'현하루','USER','ACTIVE',234567,4,5);
 INSERT INTO user_second_verifications VALUES(218,'PLAYDK','test-218');
 INSERT INTO account_sync_versions_v1 VALUES(218,1,'{"collection":1,"wallet":1}');
 INSERT INTO user_mercenary_cards_v1 VALUES(218,'V-988',2,1,'old','old');
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-973',3,3,5,'old-stock'),('SSS_MIRACLE_CUBE:V-973',5,0,1,'cube-stock');
 INSERT INTO mercenary_limited_issues_v1 VALUES('existing','previous',1249,'V-973',1,'old');
 INSERT INTO workshop_recipes_v1668 VALUES(973,'MERCENARY','V-973');
 INSERT INTO user_mercenary_loadout_v1 VALUES(218,'V-988');
 INSERT INTO user_mercenary_levels_v1 VALUES(218,'V-988',11);
 INSERT INTO user_mercenary_growth_v1 VALUES(218,'V-988',500);
 INSERT INTO cnine_user_inventory VALUES(218,'MASTER_STAR',123);
 INSERT INTO pig_coin_wallets_v1 VALUES(218,33);
 INSERT INTO app_meta VALUES('mercenary_limited_shard_craft_v1:V-973','{"stockLimit":10,"isActive":false}','old'),('ranked_series_roster_v1:218','{"code":"V-988"}','old');
 `);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(218,$1,$2,$3)',[token,api.OP,Date.now()+120000]);
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};
 return {db,client};
}
const full=async c=>({state:await api.state(c),artifacts:await api.artifacts(c)});
const protectedData=s=>({...s,cards:s.cards.filter(c=>c.mercenary_code!=='V-973'),sync:undefined});
test('exact account receives one Eunseol with stock, craft, growth and assets preserved; replay only reads',async()=>{
 const {db,client}=await fixture();try{
  const before=await api.state(client);await db.exec('BEGIN');const result=await api.grant(client,api.HASH,options());await db.exec('COMMIT');
  assert.equal(result.receipt.grants[0].copiesBefore,0);assert.equal(result.receipt.grants[0].copiesAfter,1);
  assert.deepEqual(protectedData(await api.state(client)),protectedData(before));
  const replay=await api.grant({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return client.query(sql,args);}});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);assert.equal((await api.artifacts(client)).acquisitions.length,1);
 }finally{await db.close();}
});
test('failure at final receipt rolls back holding, acquisition, audit and sync together',async()=>{
 const {db,client}=await fixture();try{
  const before=await full(client);await db.exec('BEGIN');
  await assert.rejects(api.grant({query:(sql,args)=>sql.startsWith('INSERT INTO app_meta(')?client.query('SELECT 1/0'):client.query(sql,args)},api.HASH,options()),/division by zero/);
  await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }finally{await db.close();}
});
test('existing copy is incremented once without resetting growth or acquisition date',async()=>{
 const {db,client}=await fixture();try{
  await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(218,'V-973',2,1,'original','old');INSERT INTO user_mercenary_levels_v1 VALUES(218,'V-973',16);INSERT INTO user_mercenary_growth_v1 VALUES(218,'V-973',77)");
  const before=await api.state(client);await db.exec('BEGIN');const r=await api.grant(client,api.HASH,options());await db.exec('COMMIT');
  const after=await api.state(client),h=after.cards.find(c=>c.mercenary_code==='V-973');
  assert.equal(r.receipt.grants[0].copiesAfter,3);assert.equal(h.first_obtained_at,'original');assert.equal(h.duplicate_count,2);assert.deepEqual(after.levels,before.levels);assert.deepEqual(after.growth,before.growth);
 }finally{await db.close();}
});
test('wrong plan, changed identity and absent account lease cannot grant',async()=>{
 const {db,client}=await fixture();try{
  await assert.rejects(api.grant(client,'wrong',options()),/Reviewed plan/);
  await db.exec("UPDATE users SET nickname='changed' WHERE id=218;BEGIN");
  await assert.rejects(api.grant(client,api.HASH,options()),/nickname changed/);await db.exec('ROLLBACK');
  await db.exec("UPDATE users SET nickname='현하루' WHERE id=218;DELETE FROM user_mutation_locks_v1520;BEGIN");
  await assert.rejects(api.grant(client,api.HASH,options()));await db.exec('ROLLBACK');
  assert.equal((await api.artifacts(client)).acquisitions.length,0);
 }finally{await db.close();}
});
