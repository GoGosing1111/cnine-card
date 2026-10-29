import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {mercenaryLevelDraft,mercenaryGrowthDraft,mercenaryLevelStateFromStorage,levelProgress,attachMercenaryLevel} from '../shared/mercenary-level-v1.mjs';
import {readMercenaryLevelState,releasedMercenaryLevelSummary} from '../functions/_mercenary_level_policy.js';
const file=new URL('../scripts/ops/eumsooni-awakened-omega-level21-20261029.mjs',import.meta.url);
const original=await fs.readFile(file,'utf8');
const synthetic=createHash('sha256').update(JSON.stringify({provider:'PLAYDK',provider_user_id:'test-65'})).digest('hex');
const source=original.replaceAll('2f77e6e1664c782d529261c6fe33038227b5a88eba0f86f414eb5a0f6bba0cc3',synthetic).replace(/from '(\.\.\/\.\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,file).href}'`);
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const token='a'.repeat(64),options=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies bigint,duplicate_count bigint,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer CHECK(level BETWEEN 1 AND 20),experience bigint,breakthrough_mask integer,revision integer,updated_at text,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb,updated_at timestamptz);
 CREATE TABLE ranked_duo_accounts_v1(user_id bigint PRIMARY KEY,source_version bigint);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE FUNCTION touch_duo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER level_duo AFTER INSERT OR UPDATE ON user_mercenary_levels_v1 FOR EACH ROW EXECUTE FUNCTION touch_duo();
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0),(65,'음순이','USER','ACTIVE',123456789,23,45);
 INSERT INTO user_second_verifications VALUES(65,'PLAYDK','test-65');
 INSERT INTO cnine_user_inventory VALUES(65,'MASTER_STAR',123),(65,'MERCENARY_SSS_LIMITED_SHARD',40);
 INSERT INTO user_mercenary_cards_v1 VALUES(65,'V-972',1,0),(65,'V-996',1,0);
 INSERT INTO user_mercenary_levels_v1 VALUES(65,'V-996',10,25,1,3,'before');
 INSERT INTO user_mercenary_growth_v1 VALUES(65,'V-972',99);
 INSERT INTO user_mercenary_loadout_v1 VALUES(65,'V-996');

 INSERT INTO account_sync_versions_v1 VALUES(65,10,'{"collection":"7","loadout":"8","wallet":"9"}',CURRENT_TIMESTAMP);
 INSERT INTO ranked_duo_accounts_v1 VALUES(65,5);
 INSERT INTO app_meta VALUES('mercenary_pvp_loadout_v1:65','{"mercenaryCode":"V-972"}','before'),('mercenary_dual_loadout_v2:65','{"version":2,"PVE":{"mercenaryCodes":["V-972","V-035"],"revision":3}}','before');`);
 const policy=mercenaryLevelDraft();policy.mode='ON';policy.revision=1;for(const k of Object.keys(policy.xpPerCard))policy.xpPerCard[k]=100;for(const r of policy.levels)r.requiredXp=300;for(const r of policy.milestones)Object.assign(r,{successChancePpm:100000,bonus:{type:'ATTACK_PERCENT',value:1}});policy.growth=mercenaryGrowthDraft();for(const k of Object.keys(policy.growth.perLevel))policy.growth.perLevel[k]=1;for(const r of policy.growth.milestones)for(const k of Object.keys(r))if(k!=='level')r[k]=1;
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',['mercenary_level_policy_v1',JSON.stringify(policy),'before']);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(65,$1,$2,$3)',[token,api.OP,Date.now()+120000]);
 const full=async()=>({state:await api.snapshot(db),artifacts:await api.artifacts(db)});
 const transact=async(client=db,opts=options())=>{await db.exec('BEGIN');try{const r=await api.grant(client,opts);await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}};
 const env={DB:{prepare(sql){
  return {bind(...args){
   let i=0;const query=sql.replace(/\?/g,()=>'$'+(++i));
   return {first:async()=>(await db.query(query,args)).rows[0]||null,all:async()=>({results:(await db.query(query,args)).rows})};
  }};
 }}};
 return {db,policy,full,transact,env};
}
test('existing Awakened Omega with no growth row reaches displayed MAX 21 with all four breakthroughs; actual account reads and battle snapshot agree',async t=>{
 const f=await fixture(t),before=await f.full(),result=await f.transact();assert.equal(result.verification.currentLevel,21);assert.equal(result.verification.complete,true);
 const stored=(await f.db.query("SELECT * FROM user_mercenary_levels_v1 WHERE user_id=65 AND mercenary_code='V-972'")).rows[0];assert.equal(Number(stored.level),20);assert.equal(Number(stored.breakthrough_mask),15);assert.equal(Number(stored.experience),0);
 const state=await readMercenaryLevelState(f.env,65,'V-972');assert.deepEqual(state,api.PLAN.after);assert(levelProgress(f.policy,state,api.PLAN).complete);
 assert.equal((await releasedMercenaryLevelSummary(f.env,65)).rows.find(r=>r.code==='V-972').level,21);assert.equal(attachMercenaryLevel({code:'V-972',rank:'SSS'},f.policy,stored).mercenaryLevel.level,21);
 const after=await f.full();for(const key of ['user','inventory','cards','legacyGrowth','loadout','settings','stock'])assert.deepEqual(after.state[key],before.state[key]);assert.equal(after.artifacts.audit.length,1);assert.equal(result.receipt.protectedBeforeHash,result.receipt.protectedAfterHash);
 const replay=await api.grant({query(sql,args){assert.match(sql,/^SELECT\b/);return f.db.query(sql,args);}});assert(replay.replayed);assert.deepEqual(await f.full(),after);
});
test('SQL failure at receipt rolls back level, XP, breakthroughs, sync, duo and audit',async t=>{
 const f=await fixture(t),before=await f.full();
 await assert.rejects(()=>f.transact({query:(sql,args)=>sql.startsWith('INSERT INTO app_meta')?f.db.query('SELECT 1/0'):f.db.query(sql,args)}),/division by zero/);
 assert.deepEqual(await f.full(),before);
});
test('missing lease and changed growth cannot overwrite account activity',async t=>{
 const f=await fixture(t),before=await f.full();await assert.rejects(()=>f.transact(f.db,{leaseToken:token,lockDeadline:0}));assert.deepEqual(await f.full(),before);
 await f.db.exec("INSERT INTO user_mercenary_levels_v1 VALUES(65,'V-972',1,150,0,1,'concurrent')");const changed=await f.full();await assert.rejects(()=>f.transact(),/Account growth changed/);assert.deepEqual(await f.full(),changed);
});
test('identity mismatch prevents modifying another account',async t=>{
 const f=await fixture(t);await f.db.exec("UPDATE user_second_verifications SET provider_user_id='different-account' WHERE user_id=65");const before=await f.full();await assert.rejects(()=>f.transact());assert.deepEqual(await f.full(),before);
});
