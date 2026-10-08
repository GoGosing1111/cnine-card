import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {jointFixture} from './helpers/joint-db.mjs';
import {RANKS} from '../shared/account-ranks-v1.mjs';
import {LEGACY_MAX_RANK_TICKS,MAX_RANK_TICKS,publicAccountRank,ensureAccountRank,accountRankAward} from '../functions/_account_rank.js';
import {withAvatarDropScope,resolveAvatarDropRate,rankDropIncreasePercent} from '../functions/_avatar_drop.js';
import {__avatarDropPoolTest} from '../functions/_drop_pool.js';
import {migrateRankCap,publishRankNotice,inspectRankReform,MIGRATION_KEY,NOTICE_KEY,CAMPAIGN} from '../scripts/ops/account-rank-reform-20261008.mjs';
const ticks=level=>(2*(level-1)**2+62*(level-1))*600*8;

test('approved reform keeps old Marshal at Master Sergeant and every next-level cost increases',()=>{
 const old=publicAccountRank(LEGACY_MAX_RANK_TICKS);
 assert.equal(old.level,80);assert.equal(old.code,'MASTER_SERGEANT');assert.deepEqual(old.progress,{current:400,required:3040,percent:13.15,maxed:false});
 assert.equal(MAX_RANK_TICKS,669312000);
 let previous=0;
 for(let level=1;level<250;level++){const cost=publicAccountRank(ticks(level)).progress.required;assert.ok(cost>previous);previous=cost;}
 for(const r of RANKS){
  const policy=publicAccountRank(ticks(r.min));
  assert.equal(policy.coinBp,r.min<170?0:500+(r.index-13)*25);
  assert.equal(policy.dropBp,r.min<215?0:(r.index-15)*100);
  if(r.min>=80){assert.equal(policy.attackBp,1000);assert.equal(policy.hpBp,1500);assert.equal(policy.presetSlots,5);}
 }
 assert.equal(publicAccountRank(ticks(249)).progress.required,8448);
});

test('old capped XP continues with only new receipts, atomically and once per event',async t=>{
 const f=await jointFixture(t);await ensureAccountRank(f.env);
 await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(7,?)',LEGACY_MAX_RANK_TICKS).run();
 await f.p("INSERT INTO account_rank_receipts_v1(user_id,source,event_id,ticks,token) VALUES(7,'HUNT','historic',999999999,'historic-token')").run();
 const award=()=>accountRankAward(f.env,7,'HUNT','new-hunt');
 f.fail('UPDATE account_rank_progress_v1');await assert.rejects(async()=>f.env.DB.batch(await award()));f.fail('');
 assert.equal((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks,LEGACY_MAX_RANK_TICKS);
 await f.env.DB.batch(await award());await f.env.DB.batch(await award());
 assert.equal((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks,LEGACY_MAX_RANK_TICKS+4800);
 assert.equal((await f.p('SELECT COUNT(*) n FROM account_rank_receipts_v1').first()).n,2);
});

test('rank drop reads once per request, stacks relatively and excludes competitive and guaranteed rewards',async t=>{
 const f=await jointFixture(t);await ensureAccountRank(f.env);
 await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(7,?)',ticks(215)).run();
 let reads=0;const prepare=f.DB.prepare.bind(f.DB);f.DB.prepare=sql=>{if(sql.startsWith('SELECT total_ticks'))reads++;return prepare(sql);};
 let scope=withAvatarDropScope(f.env);
 for(const source of ['HUNT','APOCALYPSE','SCRAPYARD','COW_ROOM','ESCORT','RIFT'])assert.equal((await resolveAvatarDropRate(scope,7,10,source)).total,10.1);
 assert.equal(reads,1);
 for(const source of ['PVP','TOWER','RAID','CLAN','SIEGE','SEAL','DRAW','PACK','COW_PORTAL',undefined])assert.equal((await resolveAvatarDropRate(scope,7,10,source)).total,10);
 assert.equal(reads,1);
 await f.p('UPDATE account_rank_progress_v1 SET total_ticks=? WHERE user_id=7',MAX_RANK_TICKS).run();
 assert.equal(await rankDropIncreasePercent(scope,7,'HUNT'),1,'one settlement keeps its snapshot');
 scope=withAvatarDropScope(f.env);assert.equal((await resolveAvatarDropRate(scope,7,10,'HUNT')).total,10.5);
 for(const [level,expected] of [[214,0],[215,1],[225,2],[235,3],[245,4],[250,5]]){
  await f.p('UPDATE account_rank_progress_v1 SET total_ticks=? WHERE user_id=7',ticks(level)).run();
  assert.equal(await rankDropIncreasePercent(withAvatarDropScope(f.env),7,'PVE_AUTO'),expected);
 }
 for(const base of [0,100])assert.equal((await resolveAvatarDropRate({},7,base,'HUNT')).total,base);
 assert.equal((await resolveAvatarDropRate(withAvatarDropScope(f.env),7,99,'HUNT')).total,100);
});

test('rank pool chance gains consume no-drop share, preserving coin odds, quantity and guarantees',()=>{
 const {rollPool}=__avatarDropPoolTest;
 const item={id:1,is_enabled:1,chance_percent:10,weight:10,reward_type:'INVENTORY_ITEM',reward_ref:'QA',min_quantity:2,max_quantity:2,daily_limit:4};
 const coin={...item,id:2,reward_type:'COIN',weight:20};
 const pool={id:1,code:'QA',rolls:1,roll_mode:'INDEPENDENT'};
 assert.equal(rollPool(pool,[item,coin],{},()=>.102).length,0);
 const rewards=rollPool(pool,[item,coin],{rankDropPercent:5},()=>.102);assert.equal(rewards.length,1);assert.equal(rewards[0].entryId,1);assert.equal(rewards[0].quantity,2);assert.equal(rewards[0].dailyLimit,4);
 const weighted={...pool,roll_mode:'WEIGHTED_ONE',no_drop_weight:70},counts=[0,0,0];
 for(let i=0;i<10000;i++){const r=rollPool(weighted,[item,coin],{rankDropPercent:5},()=>(i+.5)/10000)[0];counts[r?.entryId||0]++;}
 assert.deepEqual(counts,[6950,1050,2000]);
 for(const roll of [.01,.2,.5,.99])assert.deepEqual(rollPool({...weighted,no_drop_weight:0},[item,coin],{rankDropPercent:5},()=>roll),rollPool({...weighted,no_drop_weight:0},[item,coin],{},()=>roll));
});

async function opsFixture(t){
 const c=new PGlite();t.after(()=>c.close());
 await c.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE account_rank_progress_v1(user_id BIGINT PRIMARY KEY,total_ticks BIGINT CHECK(total_ticks>=0 AND total_ticks<=${LEGACY_MAX_RANK_TICKS}));
 INSERT INTO account_rank_progress_v1 VALUES(1,${LEGACY_MAX_RANK_TICKS}),(2,1200);
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);
 INSERT INTO users VALUES(1,'OWNER','ACTIVE'),(2,'USER','ACTIVE'),(3,'USER','BANNED');
 CREATE TABLE user_messages(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return c;
}
test('PostgreSQL cap migration preserves all XP; notice is atomic, active-only and replay-safe',async t=>{
 const c=await opsFixture(t),before=(await inspectRankReform(c)).progress;
 await assert.rejects(()=>publishRankNotice(c),/migration/);
 assert.equal((await c.query('SELECT * FROM app_meta')).rows.length,0);
 const migration=await migrateRankCap(c);assert.deepEqual(migration.before,before);assert.deepEqual(migration.after,before);
 assert.equal((await migrateRankCap(c)).replayed,true);
 await c.query('UPDATE account_rank_progress_v1 SET total_ticks=$1 WHERE user_id=1',[LEGACY_MAX_RANK_TICKS+4800]);
 await assert.rejects(()=>c.query('UPDATE account_rank_progress_v1 SET total_ticks=$1 WHERE user_id=1',[MAX_RANK_TICKS+1]),/check constraint/);
 await c.exec("ALTER TABLE admin_logs ADD CONSTRAINT qa_failure CHECK(action_type<>'ACCOUNT_RANK_REFORM_NOTICE')");
 await assert.rejects(()=>publishRankNotice(c),/qa_failure/);
 assert.equal((await c.query('SELECT * FROM user_messages')).rows.length,0);assert.equal((await c.query('SELECT * FROM app_meta WHERE key=$1',[NOTICE_KEY])).rows.length,0);
 await c.exec('ALTER TABLE admin_logs DROP CONSTRAINT qa_failure');
 const notice=await publishRankNotice(c);assert.equal(notice.recipients,2);assert.equal(notice.rewardMessages,0);
 assert.equal((await publishRankNotice(c)).replayed,true);
 const messages=(await c.query('SELECT * FROM user_messages ORDER BY user_id')).rows;
 assert.deepEqual(messages.map(m=>Number(m.user_id)),[1,2]);assert.ok(messages.every(m=>m.campaign_key===CAMPAIGN&&m.message_type==='NOTICE'&&m.body.includes('8배')));
 assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,1);
 assert.equal((await c.query('SELECT * FROM app_meta WHERE key=$1',[MIGRATION_KEY])).rows.length,1);
});
