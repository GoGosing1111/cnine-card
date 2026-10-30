import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const plan=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));
plan.recipients[0].identityHash=hash({provider:'PLAYDK',provider_user_id:'test-65'});
const source=(await fs.readFile(new URL('./grant.mjs',import.meta.url),'utf8')).replace("JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'))",JSON.stringify(plan));
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const token='a'.repeat(64),options=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb);
 CREATE TABLE ranked_duo_accounts_v1(user_id bigint PRIMARY KEY,source_version bigint);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE character_equipment_items(id bigint PRIMARY KEY,code text,name text,slot text,is_active int,is_public int);
 CREATE TABLE user_equipment_instances(id bigserial PRIMARY KEY,user_id bigint,equipment_id bigint,source_type text,source_id text,request_id text,acquired_at text DEFAULT 'fixture-time');
 CREATE TABLE user_equipment_counts_v1(user_id bigint,equipment_id bigint,quantity bigint,PRIMARY KEY(user_id,equipment_id));
 CREATE TABLE equipment_forge_states_v1(instance_id bigint PRIMARY KEY,user_id bigint,level int);
 CREATE TABLE user_equipment_loadout(user_id bigint,slot text,instance_id bigint);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies int);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level int);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint,balance bigint);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE FUNCTION sync_equipment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO user_equipment_counts_v1 VALUES(NEW.user_id,NEW.equipment_id,1) ON CONFLICT(user_id,equipment_id) DO UPDATE SET quantity=user_equipment_counts_v1.quantity+1;
  UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{inventory}',to_jsonb((domains->>'inventory')::bigint+1)) WHERE user_id=NEW.user_id;
  UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=NEW.user_id;
  RETURN NEW; END $$;
 CREATE TRIGGER equipment_sync AFTER INSERT ON user_equipment_instances FOR EACH ROW EXECUTE FUNCTION sync_equipment();
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0),(65,'음순이','USER','ACTIVE',99999,12,34);
 INSERT INTO user_second_verifications VALUES(65,'PLAYDK','test-65');
 INSERT INTO account_sync_versions_v1 VALUES(65,10,'{"inventory":10,"wallet":8}');
 INSERT INTO ranked_duo_accounts_v1 VALUES(65,1);
 INSERT INTO cnine_user_inventory VALUES(65,'MASTER_STAR',9);
 INSERT INTO user_mercenary_cards_v1 VALUES(65,'V-972',1);
 INSERT INTO user_mercenary_levels_v1 VALUES(65,'V-972',20);
 INSERT INTO user_mercenary_growth_v1 VALUES(65,'V-972',0);
 INSERT INTO user_mercenary_loadout_v1 VALUES(65,'V-972');
 INSERT INTO pig_coin_wallets_v1 VALUES(65,55);
 INSERT INTO app_meta VALUES('mercenary_equipment_v1:65:PVE','{"revision":3,"slots":{"WEAPON":"1"}}','old');
 INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(65,156,'LEGION','old','previous-weapon'),(65,42,'ADMIN','old','other-equipment');
 INSERT INTO equipment_forge_states_v1 VALUES(1,65,10);
 INSERT INTO user_equipment_loadout VALUES(65,'TOP',2);
 `);
 for(const g of plan.grants)await db.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,$4,1,1)',[g.equipmentId,g.code,g.name,g.slot]);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(65,$1,$2,$3)',[token,api.OP,Date.now()+120000]);
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};
 return {db,client};
}
const full=async c=>({state:await api.state(c),artifacts:await api.artifacts(c)});
test('five exact tier-eight items added; existing enhanced item, loadouts and money preserved; replay only SELECTs',async()=>{
 const {db,client}=await fixture();try{
  const before=await api.state(client);await db.exec('BEGIN');const r=await api.grant(client,api.HASH,options());await db.exec('COMMIT');
  assert.deepEqual(r.receipt.grants.map(g=>[g.quantityBefore,g.quantityAfter]),[[1,2],[0,1],[0,1],[0,1],[0,1]]);
  assert.deepEqual(api.protectedState(await api.state(client)),api.protectedState(before));
  const replay=await api.grant({query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/);return client.query(sql,args);}});assert(replay.replayed);assert.deepEqual(replay.receipt,r.receipt);
 }finally{await db.close();}
});
test('failure writing final receipt rolls back all five items, counts, sync and audit',async()=>{
 const {db,client}=await fixture();try{
  const before=await full(client);await db.exec('BEGIN');await assert.rejects(api.grant({query:(sql,args)=>sql.startsWith('INSERT INTO app_meta(')?client.query('SELECT 1/0'):client.query(sql,args)},api.HASH,options()),/division by zero/);await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }finally{await db.close();}
});
test('inactive final item prevents a partial grant',async()=>{
 const {db,client}=await fixture();try{
  await db.exec('UPDATE character_equipment_items SET is_active=0 WHERE id=160');const before=await full(client);await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,options()));await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }finally{await db.close();}
});
test('changed identity, invalid plan and absent lease refuse grant',async()=>{
 const {db,client}=await fixture();try{
  await assert.rejects(api.grant(client,'wrong',options()),/Pinned plan/);await assert.rejects(api.grant(client,api.HASH),/lease/);
  await db.exec("UPDATE user_second_verifications SET provider_user_id='different' WHERE user_id=65");const before=await full(client);await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,options()));await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }finally{await db.close();}
});
