import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {DEFENSE_KEY,defaultDefenseSettings,validateDefenseSettings} from '../shared/monster-defense-v1.mjs';
import {DEFENSE_COIN_MAX,validateDefenseReward,freezeDefenseReward} from '../shared/monster-defense-rewards-v1.mjs';
import {defenseDraftKey,mergeDefenseDraft} from '../admin/monster-defense.mjs';
import {settleDefenseRewards} from '../functions/_monster_defense_rewards.js';
import {defenseRewardFixture} from './helpers/monster-defense-reward-db.mjs';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
import {OP,SCROLLS,TARGET,requestedSettings,apply,inspect} from '../scripts/ops/monster-defense-settings-20261026.mjs';
const config=()=>requestedSettings({...defaultDefenseSettings(),mode:'ON'});
test('coin amounts above one trillion round-trip exactly; unsafe integers remain rejected',()=>{
 for(const coin of [0,1e12+1,1.5e12,3e12,DEFENSE_COIN_MAX])assert.equal(validateDefenseReward({coin,masterStars:0,items:[]}).coin,coin);
 for(const coin of [-1,.1,DEFENSE_COIN_MAX+1,Infinity,NaN,'3000000000000'])assert.throws(()=>validateDefenseReward({coin,masterStars:0,items:[]}));
 assert.deepEqual(validateDefenseSettings(config()),config());
});
test('draft merge preserves invalid raw inputs, unrelated remote edits and explicit local conflicts; account keys are isolated',()=>{
 const base={coin:'0',stars:'0',hp:'100',items:[]},local={...base,coin:'3000000000000',hp:'',items:[{code:'WEAPON_ENHANCEMENT_SCROLL'}]},remote={...base,stars:'5'};
 assert.deepEqual(mergeDefenseDraft(base,local,remote),{fields:{...local,stars:'5'},conflicts:[]});
 assert.deepEqual(mergeDefenseDraft(base,local,{...remote,coin:'42'}).conflicts,['coin']);
 assert.deepEqual(mergeDefenseDraft(base,local,{...local,stars:'5'}).conflicts,[]);
 assert.notEqual(defenseDraftKey(1),defenseDraftKey(2));assert.equal(defenseDraftKey(null),null);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} all five trillion-scale rewards pay once with exact balances and overflow rolls back`,async()=>{
 const f=await defenseRewardFixture(postgres);try{
  for(const code of SCROLLS)await f.run(`INSERT INTO inventory_items VALUES('${code}','강화주문서','',1)`);
  const s=config();await f.writeSettings(s);let sum=1000;
  const room=i=>({id:String(i+1).padStart(12,'0'),creationRequest:'high-coin-'+i,createdAt:100,startedAt:200,finishedAt:300,phase:'VICTORY',difficulty:TARGET[i][0],accountRoster:true,capacity:3,wave:30,coreHp:1,encounter:{waves:30,name:TARGET[i][0]},players:[1,2,3].map(id=>({id:String(id)})),rewardParticipants:['1','2','3'],rewardPolicy:freezeDefenseReward(s,TARGET[i][0])});
  for(let i=0;i<TARGET.length;i++){const r=room(i),result=await settleDefenseRewards(f.env,r);sum+=TARGET[i][1];assert.equal(result[1].coin,TARGET[i][1]);assert.deepEqual(await settleDefenseRewards(f.env,r),result);assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),sum);}
  assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),15);
  await f.run('UPDATE users SET coin=9007199254740991 WHERE id=3');const r={...room(4),id:'FFFFFFFFFFFF'};await assert.rejects(settleDefenseRewards(f.env,r));assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),sum);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),15);
 }finally{await f.close();}
});
test('actual OWNER settings API accepts exact five amounts, scroll rules and difficulty values, with CAS and editor identity',async()=>{
 const h=await monsterDefenseFixture();try{
  await h.db.batch(SCROLLS.map(code=>({sql:'INSERT INTO inventory_items(code,name,is_active) VALUES(?,?,1)',args:[code,code]})));
  const old=await h.api(1,'admin/defense/settings');assert.equal(old.editorId,1);
  const settings=requestedSettings({...old.settings,mode:'ON'}),requestId=crypto.randomUUID();const saved=await h.api(1,'admin/defense/settings',{settings,requestId});assert.equal(saved.status,200);
  assert.deepEqual(saved.settings,{...settings,revision:settings.revision+1});assert.equal((await h.api(1,'admin/defense/settings',{settings,requestId})).replayed,true);
  assert.equal((await h.api(1,'admin/defense/settings',{settings,requestId:crypto.randomUUID()})).status,409);
  const read=await h.api(1,'admin/defense/settings');assert.deepEqual(read.settings,saved.settings);assert.equal((await h.api(2,'admin/defense/settings')).status,403);
 }finally{await h.dispose();}
});
test('reviewed settings operation guards current state, rolls back all writes on failure, and replays SELECT-only',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id BIGINT,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',99);CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);CREATE TABLE admin_logs(id BIGSERIAL,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
  for(const code of SCROLLS)await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[code,code]);
  const original={...defaultDefenseSettings(),mode:'ON',revision:15,testUserIds:[1],customPreserved:'sentinel',lastRequest:{id:'previous'}};await db.query('INSERT INTO app_meta VALUES($1,$2,NULL)',[DEFENSE_KEY,JSON.stringify(original)]);await db.query("INSERT INTO app_meta VALUES('unrelated','unchanged',NULL)");
  const before=await inspect(db);await assert.rejects(apply(db,{expectedRaw:'stale'}),/changed/);assert.deepEqual(await inspect(db),before);
  assert((await apply(db,{expectedRaw:before.raw})).rolledBack);assert.deepEqual(await inspect(db),before);
  await db.exec(`ALTER TABLE app_meta ADD CONSTRAINT fail_receipt CHECK(key<>'${OP}')`);await assert.rejects(apply(db,{expectedRaw:before.raw,dryRun:false}));await db.exec('ALTER TABLE app_meta DROP CONSTRAINT fail_receipt');assert.deepEqual(await inspect(db),before);assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,0);
  const done=await apply(db,{expectedRaw:before.raw,dryRun:false});assert(done.committed);assert.equal(done.receipt.after.customPreserved,'sentinel');assert.deepEqual(done.receipt.after.growth,original.growth);assert.deepEqual(done.receipt.after.testUserIds,[1]);assert.equal((await db.query('SELECT coin FROM users')).rows[0].coin,99);
  assert.equal((await db.query("SELECT value FROM app_meta WHERE key='unrelated'")).rows[0].value,'unchanged');
  const replay=await apply({query(sql,args){assert.match(sql,/^SELECT\b/);return db.query(sql,args);}});assert(replay.replayed);assert.equal(replay.auditId,done.receipt.auditId);
 }finally{await db.close();}
});
