import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {CARD,TARGETS,upgradeLandBjAizen,revokeBongsoonSolarDrill,verifyLandBjMaintenance} from '../scripts/ops/land-bj-aizen-and-bongsoon-drill-20261004.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'핑크빛유두','ACTIVE','OWNER',999,88,77),(66,'미등록유저','ACTIVE','USER',123,45,67);
 CREATE TABLE soopketland_accounts(slot TEXT PRIMARY KEY,user_id BIGINT UNIQUE,bound_at TEXT);
 INSERT INTO soopketland_accounts VALUES('핑크빛유두',1,'original');
 CREATE TABLE members(id BIGINT PRIMARY KEY,is_active BIGINT);INSERT INTO members VALUES(1,1);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active BIGINT,card_status TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,breakthrough_fail_count BIGINT,first_obtained_at TEXT DEFAULT 'first',last_obtained_at TEXT DEFAULT 'last',PRIMARY KEY(user_id,card_id));
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT DEFAULT 'created',updated_at TEXT DEFAULT 'updated',PRIMARY KEY(user_id,item_code));
 CREATE TABLE master_star_mine_runs_v1(id TEXT PRIMARY KEY,user_id BIGINT,drill_code TEXT,reward BIGINT,policy_revision BIGINT,started_at_ms BIGINT,ready_at_ms BIGINT,claimed_at_ms BIGINT,claim_request_id TEXT);
 INSERT INTO master_star_mine_runs_v1 VALUES('ongoing',5426,'MINE_SOLAR_DRILL',100000,4,1791056257489,1791070657489,NULL,NULL);
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(5426,'MINE_SOLAR_DRILL',1,1),(5426,'MINE_GOLDEN_DRILL',1,0);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT);`);
 await db.query('INSERT INTO cards_effective_v1210 VALUES($1,$2,$3,1,1,$4)',[CARD.id,CARD.title,CARD.grade,'PUBLIC']);
 await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(1,$1,99,4,9),(66,$1,7,9,3)',[CARD.id]);
 for(const [i,u] of TARGETS.entries()){
  await db.query("INSERT INTO users VALUES($1,$2,'ACTIVE','USER',1234567890123,123,456)",[u.id,u.nickname]);
  await db.query("INSERT INTO soopketland_accounts VALUES($1,$2,'original')",[u.nickname,u.id]);
  await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES($1,$2,$3,$4,3),($1,$5,2,7,1)',[u.id,CARD.id,i+1,i===0?15:13+i%2,'OTHER']);
  await db.query("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES($1,'MASTER_STAR',3000000,100)",[u.id]);
 }
 return db;
}
async function snapshot(db){const state={};for(const table of ['users','soopketland_accounts','user_cards','cnine_user_inventory','master_star_mine_runs_v1','app_meta','admin_logs','inventory_logs'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;}

test('only registered BJ holdings below +15 upgrade; owner, other users, copies and balances survive',async t=>{
 const db=await fixture(t),before=await snapshot(db),r=await upgradeLandBjAizen(db,{commit:true}),after=await snapshot(db);
 assert.equal(r.upgraded,7);assert.equal(r.alreadyAt15,1);
 for(const table of ['users','soopketland_accounts','cnine_user_inventory','master_star_mine_runs_v1','inventory_logs'])assert.deepEqual(after[table],before[table]);
 const expected=before.user_cards.map(c=>TARGETS.some(u=>u.id===Number(c.user_id))&&c.card_id===CARD.id&&Number(c.breakthrough_level)<15?{...c,breakthrough_level:15,breakthrough_fail_count:0}:c);
 assert.deepEqual(after.user_cards,expected);
 assert.equal((await upgradeLandBjAizen(db,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);
});

test('bulk dry run and audit failure roll back every BJ; stale roster or absent copy blocks changes',async t=>{
 const db=await fixture(t);let before=await snapshot(db);
 assert.equal((await upgradeLandBjAizen(db)).committed,false);assert.deepEqual(await snapshot(db),before);
 const fail={query(sql,args){if(sql.startsWith('INSERT INTO admin_logs'))throw Error('audit unavailable');return db.query(sql,args);}};
 await assert.rejects(upgradeLandBjAizen(fail,{commit:true}),/audit unavailable/);assert.deepEqual(await snapshot(db),before);
 await db.exec("INSERT INTO soopketland_accounts VALUES('미등록유저',66,'new')");before=await snapshot(db);
 await assert.rejects(upgradeLandBjAizen(db,{commit:true}),/roster changed/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DELETE FROM soopketland_accounts WHERE user_id=66');await db.query('UPDATE user_cards SET quantity=0 WHERE user_id=4754 AND card_id=$1',[CARD.id]);before=await snapshot(db);
 await assert.rejects(upgradeLandBjAizen(db,{commit:true}),/Existing owned card/);assert.deepEqual(await snapshot(db),before);
});

test('solar revoke preserves active mining, other tools and currency; retry does not remove twice',async t=>{
 const db=await fixture(t),before=await snapshot(db),r=await revokeBongsoonSolarDrill(db,{commit:true}),after=await snapshot(db);
 assert.equal(r.removed,1);assert.equal(r.activeRunsPreserved.length,1);
 for(const table of ['users','user_cards','soopketland_accounts','master_star_mine_runs_v1'])assert.deepEqual(after[table],before[table]);
 const other=rows=>rows.filter(i=>i.item_code!=='MINE_SOLAR_DRILL');assert.deepEqual(other(after.cnine_user_inventory),other(before.cnine_user_inventory));
 const drill=after.cnine_user_inventory.find(i=>i.item_code==='MINE_SOLAR_DRILL');assert.equal(Number(drill.quantity),0);assert.equal(Number(drill.unseen_quantity),0);
 assert.equal(after.inventory_logs.length,1);assert.equal(Number(after.inventory_logs[0].change_amount),-1);
 assert.equal((await revokeBongsoonSolarDrill(db,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);
 await upgradeLandBjAizen(db,{commit:true});assert.equal((await verifyLandBjMaintenance(db)).status,'VERIFIED');
});

test('solar dry run and receipt failure roll back both balance and audit records',async t=>{
 const db=await fixture(t),before=await snapshot(db);
 assert.equal((await revokeBongsoonSolarDrill(db)).committed,false);assert.deepEqual(await snapshot(db),before);
 const fail={query(sql,args){if(sql.startsWith('INSERT INTO app_meta'))throw Error('receipt unavailable');return db.query(sql,args);}};
 await assert.rejects(revokeBongsoonSolarDrill(fail,{commit:true}),/receipt unavailable/);assert.deepEqual(await snapshot(db),before);
 assert.equal((await revokeBongsoonSolarDrill(db,{commit:true})).removed,1);
});
