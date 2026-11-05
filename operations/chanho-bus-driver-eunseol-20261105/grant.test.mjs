import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const original=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));
const plan={...original,target:{...original.target,identityHash:hash({provider:'PLAYDK',providerUserId:'test-4597'})}};
const source=(await fs.readFile(new URL('./grant.mjs',import.meta.url),'utf8')).replace("JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'))",JSON.stringify(plan)).replaceAll(original.target.identityHash,plan.target.identityHash);
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
 CREATE TABLE character_titles(id bigint PRIMARY KEY,code text,name text,unlock_type text,is_active integer,is_public integer);
 CREATE TABLE user_character_titles(user_id bigint,title_id bigint,source_type text,source_id text,unlocked_at text,expires_at text,PRIMARY KEY(user_id,title_id));
 CREATE TABLE user_title_loadout(user_id bigint PRIMARY KEY,title_id bigint);
 CREATE TABLE ranked_duo_accounts_v1(user_id bigint PRIMARY KEY,source_version bigint);
 INSERT INTO character_titles VALUES(655095,'RAID_BUS_DRIVER','버스기사','MANUAL',1,1);
 INSERT INTO user_character_titles VALUES(22,655095,'ADMIN','1','earlier',NULL),(4597,1,'ADMIN','1','old',NULL);
 INSERT INTO user_title_loadout VALUES(4597,1);
 INSERT INTO ranked_duo_accounts_v1 VALUES(4597,7);
 CREATE FUNCTION sync_ranked() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER title_ranked AFTER INSERT OR UPDATE ON user_character_titles FOR EACH ROW EXECUTE FUNCTION sync_ranked();
 CREATE TRIGGER mercenary_ranked AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION sync_ranked();
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint PRIMARY KEY,balance bigint);
 CREATE FUNCTION sync_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{collection}',to_jsonb((revision+1)::text)) WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER holdings_sync AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION sync_collection();
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0),(4597,'찬호','USER','ACTIVE',234567,4,5);
 INSERT INTO user_second_verifications VALUES(4597,'PLAYDK','test-4597');
 INSERT INTO account_sync_versions_v1 VALUES(4597,1,'{"collection":1,"wallet":1}');
 INSERT INTO user_mercenary_cards_v1 VALUES(4597,'V-988',2,1,'old','old');
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-973',3,3,5,'old-stock'),('SSS_MIRACLE_CUBE:V-973',5,0,1,'cube-stock');
 INSERT INTO mercenary_limited_issues_v1 VALUES('existing','previous',1249,'V-973',1,'old');
 INSERT INTO workshop_recipes_v1668 VALUES(973,'MERCENARY','V-973');
 INSERT INTO user_mercenary_loadout_v1 VALUES(4597,'V-988');
 INSERT INTO user_mercenary_levels_v1 VALUES(4597,'V-988',11);
 INSERT INTO user_mercenary_growth_v1 VALUES(4597,'V-988',500);
 INSERT INTO cnine_user_inventory VALUES(4597,'MASTER_STAR',123);
 INSERT INTO pig_coin_wallets_v1 VALUES(4597,33);
 INSERT INTO app_meta VALUES('mercenary_limited_shard_craft_v1:V-973','{"stockLimit":10,"isActive":false}','old'),('ranked_series_roster_v1:4597','{"code":"V-988"}','old');
 `);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(4597,$1,$2,$3)',[token,api.OP,Date.now()+120000]);
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};
 return {db,client};
}

const full=async c=>({state:await api.snapshot(c),artifacts:await api.artifacts(c)});
test('one permanent title and one Eunseol are atomic; other owners, stock, growth and loadouts are preserved; replay only reads',async()=>{
 const {db,client}=await fixture();try{
  const before=await api.snapshot(client);await db.exec('BEGIN');const r=await api.grant(client,api.HASH,options());await db.exec('COMMIT');
  assert.equal(r.receipt.copiesBefore,0);assert.equal(r.receipt.copiesAfter,1);assert.equal(r.receipt.titleGranted.expires_at,null);
  assert.deepEqual(api.protectedState(await api.snapshot(client)),api.protectedState(before));
  const replay=await api.grant({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return client.query(sql,args);}});
  assert(replay.replayed);assert.deepEqual(replay.receipt,r.receipt);assert.equal((await api.artifacts(client)).acquisitions.length,1);
 }finally{await db.close();}
});
test('failure after title or at final receipt rolls back title, card, acquisition, audit and sync',async()=>{
 const {db,client}=await fixture();try{for(const prefix of ['INSERT INTO user_mercenary_cards_v1(','INSERT INTO app_meta(']){
  const before=await full(client);await db.exec('BEGIN');
  await assert.rejects(api.grant({query:(sql,args)=>sql.startsWith(prefix)?client.query('SELECT 1/0'):client.query(sql,args)},api.HASH,options()),/division by zero/);
  await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }}finally{await db.close();}
});
test('wrong reviewed plan, missing lease and changed identity fail before any grant',async()=>{
 const {db,client}=await fixture();try{
  const before=await full(client);await assert.rejects(api.grant(client,'wrong',options()),/Reviewed plan/);
  await assert.rejects(api.grant(client,api.HASH,{}));assert.deepEqual(await full(client),before);
  await db.exec("UPDATE users SET nickname='changed' WHERE id=4597; BEGIN");
  await assert.rejects(api.grant(client,api.HASH,options()),/Recipient nickname changed/);await db.exec('ROLLBACK');
  assert.equal((await api.artifacts(client)).receipt,null);assert.equal((await api.snapshot(client)).titles.filter(t=>String(t.title_id)==='655095').length,0);
 }finally{await db.close();}
});
test('new holding or title since preflight is rejected instead of overwritten',async()=>{
 const {db,client}=await fixture();try{for(const sql of ["INSERT INTO user_character_titles VALUES(4597,655095,'ADMIN','1','new',NULL)","INSERT INTO user_mercenary_cards_v1 VALUES(4597,'V-973',2,1,'first','last')"]){
  await db.exec('BEGIN');await db.exec(sql);const before=await full(client);
  await assert.rejects(api.grant(client,api.HASH,options()),/changed since inspection/);assert.deepEqual(await full(client),before);await db.exec('ROLLBACK');
 }}finally{await db.close();}
});
