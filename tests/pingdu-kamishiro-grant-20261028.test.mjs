import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const source=fs.readFileSync('scripts/ops/pingdu-kamishiro-20261028.mjs','utf8'),plan=JSON.parse(fs.readFileSync('scripts/ops/pingdu-kamishiro-20261028.json'));
const api=await import('data:text/javascript;base64,'+Buffer.from(source.replace("export const PLAN=JSON.parse(readFileSync(new URL('./pingdu-kamishiro-20261028.json',import.meta.url),'utf8'));",'export const PLAN='+JSON.stringify(plan)+';')).toString('base64'));
const token='a'.repeat(64),options=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(copies=0){const db=new PGlite();await db.exec(` CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint,card_shards bigint DEFAULT 0,magic_crystals bigint DEFAULT 0);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer,duplicate_count integer,first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit integer,issued integer);
 CREATE TABLE mercenary_limited_issues_v1(code text,serial integer,acquisition_id text,request_id text);
 CREATE TABLE workshop_craft_logs_v1668(id bigserial PRIMARY KEY,output_type text,output_ref text,output_quantity integer,success integer);
 CREATE TABLE workshop_recipes_v1668(id bigserial PRIMARY KEY,output_type text,output_ref text,stock_limit integer);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint PRIMARY KEY,balance bigint);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,admin_id bigint,created_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text);
 CREATE FUNCTION sync_wallet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{wallet}',to_jsonb((domains->>'wallet')::bigint+1)) WHERE user_id=NEW.id; RETURN NEW; END $$;
 CREATE TRIGGER users_wallet AFTER UPDATE OF coin ON users FOR EACH ROW EXECUTE FUNCTION sync_wallet();
 CREATE FUNCTION sync_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{collection}',to_jsonb((domains->>'collection')::bigint+1)) WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER cards_collection AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION sync_collection();

 INSERT INTO users VALUES(1,'핑크빛유두','ACTIVE','OWNER',12345,6,7);
 INSERT INTO account_sync_versions_v1 VALUES(1,1,'{"wallet":1,"collection":1}');
 INSERT INTO user_mercenary_loadout_v1 VALUES(1,'V-974');
 INSERT INTO cnine_user_inventory VALUES(1,'MATERIAL',10);
 INSERT INTO user_mercenary_levels_v1 VALUES(1,'V-969',12);
 INSERT INTO user_mercenary_growth_v1 VALUES(1,'V-969',100);
 INSERT INTO pig_coin_wallets_v1 VALUES(1,20);
 INSERT INTO app_meta VALUES('mercenary_limited_pack_v1','{"revision":3,"isActive":false}','old');
 INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-974',1,0,'old','old');`);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(1,$1,$2,$3)',[token,api.OP,Date.now()+600000]);
 if(copies)await db.query("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-969',$1,$2,'original-first','original-last')",[copies,copies-1]);
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};return {db,client};}
test('authorized Kamishiro grant increments once, preserves existing copies/state, and replays SELECT-only',async()=>{
 for(const count of [0,3]){const {db,client}=await fixture(count);try{await db.exec('BEGIN');const r=await api.grant(client,api.HASH,options());await db.exec('COMMIT');assert.equal(r.receipt.grants[0].copiesBefore,count);assert.equal(r.receipt.grants[0].copiesAfter,count+1);assert.equal(r.receipt.protectedBeforeHash,r.receipt.protectedAfterHash);
 const replay=await api.grant({query:(sql,args)=>{assert.match(sql,/^\s*SELECT\b/i);return client.query(sql,args);}});assert(replay.replayed);assert.deepEqual(replay.receipt,r.receipt);const a=await api.artifacts(client);for(const k of ['receipt','audit','acquisitions'])assert.equal(a[k].length,1);const state=await api.state(client);assert.equal(state.loadout[0].mercenary_code,'V-974');assert.equal(state.users[0].coin,'12345');if(count)assert.equal(state.cards.find(c=>c.mercenary_code==='V-969').first_obtained_at,'original-first');}finally{await db.close();}}
});
test('failure at each grant write rolls back cards, sync, ledger and receipt',async()=>{
 const {db,client}=await fixture();try{const before=await api.state(client);for(const table of ['user_mercenary_cards_v1','mercenary_card_acquisitions_v1','admin_logs','app_meta']){await db.exec('BEGIN');await assert.rejects(api.grant({query:(sql,args)=>{if(sql.startsWith('INSERT INTO '+table+'('))throw Error('INJECTED');return client.query(sql,args);}},api.HASH,options()),/INJECTED/);await db.exec('ROLLBACK');assert.deepEqual(await api.state(client),before);for(const rows of Object.values(await api.artifacts(client)))assert.equal(rows.length,0);}}finally{await db.close();}
});
test('wrong plan, expired/missing lease and changed identity cannot grant',async()=>{
 const {db,client}=await fixture();try{await assert.rejects(api.grant(client,'wrong',options()));await assert.rejects(api.grant(client,api.HASH,{...options(),lockDeadline:0}));await db.exec('BEGIN; DELETE FROM user_mutation_locks_v1520');await assert.rejects(api.grant(client,api.HASH,options()));await db.exec('ROLLBACK; BEGIN');await db.query("UPDATE users SET nickname='changed' WHERE id=1");await assert.rejects(api.grant(client,api.HASH,options()),/Recipient 1 nickname changed/);await db.exec('ROLLBACK');assert.equal(await api.receipt(client),null);}finally{await db.close();}
});
