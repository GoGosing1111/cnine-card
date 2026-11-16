import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {retireHyperTickets,retirementSnapshot,OP,POLICY,CONSTRAINTS} from '../scripts/ops/hyper-ticket-retirement-20261117.mjs';
import {RETIRED_HYPER_TICKET as ITEM} from '../shared/hyper-ticket-retirement-v1.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {settleLegionHuntRewards} from '../functions/_legion_hunt_rewards.js';
const retired={code:'INVENTORY_ITEM:'+ITEM,type:'INVENTORY_ITEM',ref:ITEM,name:'하이퍼버닝 발동권',enabled:true,weight:1,minQuantity:1,maxQuantity:1,quantity:2};
const other={code:'INVENTORY_ITEM:VEHICLE_PART_FRAME',type:'INVENTORY_ITEM',ref:'VEHICLE_PART_FRAME',name:'강화 차체 프레임',enabled:true,weight:1,minQuantity:3,maxQuantity:3,quantity:3};
test('old hunt policy cannot roll retired tickets, and old ground/bag entries are removed without touching combat or other loot',()=>{
 const state={id:'retired-test',policy:{id:'normal',items:[retired,other],dropChance:1,bossDropChance:1,dropLifeMs:9000},timeLimit:1000,eventTimes:[10,20,30],timeline:[{seq:1,combatAtMs:10,huntKill:true},{seq:2,combatAtMs:20,huntKill:true},{seq:3,combatAtMs:30,type:'RESULT'}],outcome:{winner:'A'},startedAt:0,lastAck:1,
 drops:[['old',{id:'old',item:retired,state:'GROUND',token:'t'}]],observed:[[1,'old']],inventory:[[retired.code,retired],[other.code,other]],claims:[]};
 const original=structuredClone(state),s=restoreHuntSession(state,{now:()=>100,random:()=>0});
 assert.equal(s.reveal(1).drop,null);assert.equal(s.reveal(2).drop.item.ref,other.ref);
 assert.deepEqual(s.exportState().inventory,[[other.code,other]]);assert.deepEqual(s.exportState().policy.items,[other]);assert.deepEqual(state,original);
 assert.deepEqual(s.finish(3).inventory,[other]);
});
test('an old pending hunt receipt settles remaining loot once with the retired ticket inactive',async()=>{
 const f=await legionFixture({postgres:true});try{
  const policy=await f.configure(),raw=(await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(POLICY).first()).value;
  await f.DB.prepare('INSERT INTO inventory_items VALUES(?,?,?,?,0)').bind(ITEM,'하이퍼버닝 발동권','SPECIAL','assets/retired.svg').run();
  const run={rewardStatus:'PENDING',liveRewards:true,state:{id:'old-pending',policy:{},receipt:{reason:'INTERRUPTED',inventory:[retired,other]}}},key='legion_hunt_owner_session_v1:2',before=JSON.stringify(run);
  await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(key,before).run();
  const result=await settleLegionHuntRewards(f.env,f.player,{key,before,run,policyRaw:raw});
  assert.deepEqual(result.inventory,[other]);assert.equal(result.rewards.length,1);
  assert.equal(Number((await f.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?').bind(other.ref).first()).quantity),3);
  assert.equal(await f.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE item_code=?').bind(ITEM).first(),null);
  const saved=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value);assert.equal(saved.rewardStatus,'SETTLED');assert.deepEqual(saved.state.receipt.inventory,[other]);
  await assert.rejects(()=>settleLegionHuntRewards(f.env,f.player,{key,before,run,policyRaw:raw}),e=>e.code==='HUNT_REWARD_RETRY');
  assert.equal(Number((await f.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?').bind(other.ref).first()).quantity),3);
 }finally{await f.close();}
});
test('all-user recall is atomic, replayable and prohibits future grants or catalog reactivation',async()=>{
 const pg=new PGlite(),db={query:async(sql,args)=>{const r=await pg.query(sql,args);return{...r,rowCount:r.affectedRows??r.rows.length};}};
 try{
 await pg.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,status TEXT,role TEXT,coin BIGINT);INSERT INTO users VALUES(1,'ACTIVE','OWNER',77),(2,'BANNED','USER',88),(3,'ACTIVE','USER',99);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER,updated_at TEXT);CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO inventory_items VALUES('${ITEM}',1,'old'),('MASTER_STAR',1,'old');INSERT INTO cnine_user_inventory VALUES(1,'${ITEM}',1,0,'old','old'),(2,'${ITEM}',3,2,'old','old'),(3,'${ITEM}',0,0,'old','old'),(2,'MASTER_STAR',100,5,'old','old');`);
 const policy={revision:29,mode:'ON',difficulties:[{id:'normal',dropPercent:2}],items:[retired,other],testUserIds:[]};await db.query('INSERT INTO app_meta VALUES($1,$2,\'old\')',[POLICY,JSON.stringify(policy)]);
 await db.query("INSERT INTO app_meta VALUES('hyper_burning_event_settings_v1310','{\"enabled\":true,\"endsAt\":\"future\"}','old')");
 const original=await retirementSnapshot(db),protectedBefore=(await db.query("SELECT * FROM users ORDER BY id")).rows;
 await db.query('BEGIN');await assert.rejects(()=>retireHyperTickets(db,{backup:async()=>{},failAfterInventory:true}),/INJECTED/);await db.query('ROLLBACK');assert.deepEqual(await retirementSnapshot(db),original);
 await db.query('BEGIN');const dry=await retireHyperTickets(db,{backup:async()=>{}});assert.equal(dry.quantity,'4');await db.query('ROLLBACK');assert.deepEqual(await retirementSnapshot(db),original);
 assert.equal((await db.query('SELECT conname FROM pg_constraint WHERE conname=ANY($1)',[CONSTRAINTS])).rows.length,0);
 await db.query('BEGIN');let backup;const done=await retireHyperTickets(db,{backup:async value=>backup=value,expectedUserIds:['1','2','3']});await db.query('COMMIT');assert.deepEqual(backup.before,original);
 assert.equal(done.accounts,2);assert.equal(done.quantity,'4');assert.equal(done.dropEntriesRemoved,1);assert.equal(done.policyRevisionAfter,30);
 const after=await retirementSnapshot(db);assert(after.inventory.every(r=>r.quantity==='0'&&r.unseen_quantity==='0'));assert.equal(after.item[0].is_active,0);assert.deepEqual(JSON.parse(after.policy[0].value).items,[other]);
 assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows,protectedBefore);assert.equal((await db.query("SELECT quantity FROM cnine_user_inventory WHERE item_code='MASTER_STAR'")).rows[0].quantity,100);
 assert.equal((await db.query("SELECT value FROM app_meta WHERE key='hyper_burning_event_settings_v1310'")).rows[0].value,'{"enabled":true,"endsAt":"future"}');
 for(const sql of [`UPDATE cnine_user_inventory SET quantity=1 WHERE item_code='${ITEM}'`,`INSERT INTO cnine_user_inventory VALUES(4,'${ITEM}',1,1,NULL,NULL)`,`UPDATE inventory_items SET is_active=1 WHERE code='${ITEM}'`])await assert.rejects(()=>db.query(sql),e=>e.code==='23514');
 const ledger=(await db.query('SELECT user_id,change_amount,balance_after FROM inventory_logs ORDER BY user_id')).rows;assert.deepEqual(ledger,[{user_id:1,change_amount:-1,balance_after:0},{user_id:2,change_amount:-3,balance_after:0}]);
 const replay=await retireHyperTickets(db,{backup:async()=>{throw Error('Must not write');}});assert.equal(replay.replayed,true);assert.equal(replay.auditId,done.auditId);assert.equal((await db.query('SELECT * FROM inventory_logs')).rows.length,2);
 }finally{await pg.close();}
});
