import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PLAN as original,decide,hash} from './grant.mjs';
import {mercenaryLevelStateFromStorage} from '../../shared/mercenary-level-v1.mjs';
const file=new URL('./grant.mjs',import.meta.url),source=await fs.readFile(file,'utf8'),policy=JSON.parse(await fs.readFile(new URL('./test-policy.json',import.meta.url),'utf8'));
const token='a'.repeat(64),options=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(t,mixed=false){
 const plan=structuredClone(original);plan.target.identityHash=hash({provider:'PLAYDK',providerUserId:'synthetic-4977'});
 if(mixed){for(const [code,level,mask,revision,copies] of [['V-950',11,3,7,4],['V-982',20,15,9,2]]){const target=plan.targets.find(x=>x.code===code);target.expectedCard={user_id:4977,mercenary_code:code,total_copies:copies,duplicate_count:copies-1,first_obtained_at:'original',last_obtained_at:'previous'};target.expectedLevelRow={user_id:4977,mercenary_code:code,level,experience:level===20?0:75,breakthrough_mask:mask,revision,updated_at:'previous'};Object.assign(target,decide(target.expectedCard,target.expectedLevelRow));}}
 const rewritten=source.replace("JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'))",JSON.stringify(plan)).replace(/from '(\.\.\/\.\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,file).href}'`);
 const api=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64')),db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb,updated_at timestamptz);
 CREATE TABLE ranked_duo_accounts_v1(user_id bigint PRIMARY KEY,source_version bigint);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer,duplicate_count integer,first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer CHECK(level BETWEEN 1 AND 20),experience bigint,breakthrough_mask integer,revision integer,updated_at text,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text);
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text);
 CREATE TABLE workshop_craft_logs_v1668(request_id text PRIMARY KEY,output_type text,output_ref text,output_quantity bigint,success integer);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint PRIMARY KEY,balance bigint);
 CREATE FUNCTION sync_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE account_sync_versions_v1 SET revision=revision+1,domains=domains||jsonb_build_object('collection',(revision+1)::text) WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER holdings_sync AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION sync_collection();
 CREATE FUNCTION touch_ranked() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER card_ranked AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION touch_ranked();
 CREATE TRIGGER level_ranked AFTER INSERT OR UPDATE ON user_mercenary_levels_v1 FOR EACH ROW EXECUTE FUNCTION touch_ranked();
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0),(4977,'하이희야♡','USER','ACTIVE',123456789,23,45);
 INSERT INTO user_second_verifications VALUES(4977,'PLAYDK','synthetic-4977');
 INSERT INTO account_sync_versions_v1 VALUES(4977,10,'{"collection":"7","loadout":"8","wallet":"9"}',CURRENT_TIMESTAMP);
 INSERT INTO ranked_duo_accounts_v1 VALUES(4977,4);
 INSERT INTO user_mercenary_cards_v1 VALUES(4977,'V-999',2,1,'original','previous');
 INSERT INTO user_mercenary_levels_v1 VALUES(4977,'V-999',11,25,3,7,'previous');
 INSERT INTO user_mercenary_growth_v1 VALUES(4977,'V-999',123);
 INSERT INTO user_mercenary_loadout_v1 VALUES(4977,'V-999');
 INSERT INTO cnine_user_inventory VALUES(4977,'MASTER_STAR',12345);
 INSERT INTO pig_coin_wallets_v1 VALUES(4977,999);
 INSERT INTO app_meta VALUES('mercenary_dual_loadout_v2:4977','{"PVE":{"mercenaryCodes":["V-999"]}}','previous');
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-974',3,3,3,'old'),('V-950',40,40,41,'old'),('V-982',13,13,16,'old');
 INSERT INTO mercenary_limited_issues_v1 VALUES('previous','prior-request',23,'V-974',1,'original');
 `);
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',['mercenary_level_policy_v1',JSON.stringify(policy),'previous']);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(4977,$1,$2,$3)',[token,api.OP,Date.now()+120000]);
 for(const target of plan.targets){if(target.expectedCard){const c=target.expectedCard;await db.query('INSERT INTO user_mercenary_cards_v1 VALUES($1,$2,$3,$4,$5,$6)',Object.values(c));}if(target.expectedLevelRow){await db.query('INSERT INTO user_mercenary_levels_v1 VALUES($1,$2,$3,$4,$5,$6,$7)',Object.values(target.expectedLevelRow));}}
 const client={query:(s,a)=>s.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(s,a)};
 const full=async()=>({state:await api.snapshot(client),artifacts:await api.artifacts(client)});
 const transact=async(c=client,opts=options(),expected=api.HASH)=>{await db.exec('BEGIN');try{const result=await api.grant(c,expected,opts);await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}};
 return {db,client,api,full,transact};
}
test('unowned targets receive one copy each and MAX 21; stock, currencies, other holdings and loadouts survive; replay only SELECTs',async t=>{
 const f=await fixture(t),before=await f.full(),r=await f.transact();assert.equal(r.verification.totalGranted,3);assert(r.verification.grants.every(g=>g.currentCopies===1&&g.currentLevel===21));
 const after=await f.full();assert.deepEqual(f.api.protectedState(after.state),f.api.protectedState(before.state));for(const c of f.api.CODES){const row=after.state.levels.find(x=>x.mercenary_code===c);assert.equal(row.level,20);assert.equal(mercenaryLevelStateFromStorage(row).level,21);assert.equal(row.breakthrough_mask,15);}
 const replay=await f.api.grant({query:(s,a)=>{assert.match(s,/^SELECT\b/);return f.client.query(s,a);}});assert(replay.replayed);assert.deepEqual(await f.full(),after);
});
test('mixed ownership only grants the absent card, levels existing copies without increment, and preserves an already MAX row exactly',async t=>{
 const f=await fixture(t,true),before=await f.full(),r=await f.transact(),after=await f.full();assert.equal(r.verification.totalGranted,1);
 for(const code of ['V-950','V-982'])assert.deepEqual(after.state.cards.find(c=>c.mercenary_code===code),before.state.cards.find(c=>c.mercenary_code===code));
 assert.deepEqual(after.state.levels.find(c=>c.mercenary_code==='V-982'),before.state.levels.find(c=>c.mercenary_code==='V-982'));assert(r.verification.grants.every(g=>g.currentLevel===21));
});
test('failure at receipt rolls back all three grants, levels, audit and sync',async t=>{
 const f=await fixture(t),before=await f.full();await assert.rejects(()=>f.transact({query:(s,a)=>s.startsWith('INSERT INTO app_meta(')?f.client.query('SELECT 1/0'):f.client.query(s,a)}),/division by zero/);assert.deepEqual(await f.full(),before);
});
test('changed holding, wrong identity, missing lease and wrong plan cannot overwrite live activity',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.transact(f.client,options(),'wrong'),/Reviewed plan/);await assert.rejects(()=>f.transact(f.client,{...options(),lockDeadline:0}),/lease/);
 await f.db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(4977,'V-974',1,0,'concurrent','concurrent')");const before=await f.full();await assert.rejects(()=>f.transact(),/Holding changed/);assert.deepEqual(await f.full(),before);
 await f.db.exec("UPDATE user_second_verifications SET provider_user_id='someone-else' WHERE user_id=4977");await assert.rejects(()=>f.transact(),/identityHash changed/);
});
test('replaying a completed request never resets subsequent legitimate growth or creates duplicate cards',async t=>{
 const f=await fixture(t);await f.transact();await f.db.exec("UPDATE user_mercenary_levels_v1 SET level=16,breakthrough_mask=7,experience=10,revision=revision+1 WHERE user_id=4977 AND mercenary_code='V-950'");const before=await f.full();const r=await f.api.grant({query:(s,a)=>{assert.match(s,/^SELECT\b/);return f.client.query(s,a);}});assert(r.replayed);assert.deepEqual(await f.full(),before);
});
