import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PLAN,GRANT,REVOKE,HASH,DEADLINE,PVP_KEY,grant,revoke,state,receipt,verify} from '../scripts/ops/bongsoon-general-jok-loan-20261026.mjs';
const TOKEN='a'.repeat(64);
async function fixture(t){
 const clock=Date.now;Date.now=()=>DEADLINE-60000;t.after(()=>{Date.now=clock;});
 const c=new PGlite();t.after(()=>c.close());
 await c.exec(`
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coins bigint);
 CREATE TABLE user_second_verifications(user_id bigint,provider text,provider_user_id text);
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies bigint,duplicate_count bigint,first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after bigint,duplicate_count_after bigint,created_at text);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text,revision integer,updated_at text);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level integer,experience bigint,revision integer);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer,experience bigint,breakthrough_mask integer,revision integer,updated_at text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text,issued bigint,max_supply bigint);
 CREATE TABLE mercenary_limited_issues_v1(code text,serial bigint,user_id bigint);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text DEFAULT 'fixture');
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint,updated_at text);
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0),(5426,'나무늘봉순','USER','ACTIVE',123456),(7,'Other','USER','ACTIVE',20);
 INSERT INTO user_second_verifications VALUES(5426,'PLAYDK','8be68ada');
 INSERT INTO user_mercenary_cards_v1 VALUES(5426,'V-999',2,1,'before','before'),(7,'V-974',1,0,'before','before');
 INSERT INTO user_mercenary_loadout_v1 VALUES(5426,'V-999',10,'before');
 INSERT INTO user_mercenary_growth_v1 VALUES(5426,'V-974',12,123,4);
 INSERT INTO user_mercenary_levels_v1 VALUES(5426,'V-974',15,456,1,7,'before');
 INSERT INTO cnine_user_inventory VALUES(5426,'TEST',99,1,'before','before');
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-974',5,5);
 INSERT INTO mercenary_limited_issues_v1 VALUES('V-974',1,7);
 INSERT INTO app_meta VALUES('mercenary_limited_pack_v1','{"enabled":false}','before');
 `);
 await c.query('INSERT INTO app_meta VALUES($1,$2,$3)',[PVP_KEY,JSON.stringify({mercenaryCode:'V-999',revision:8}),'before']);
 await c.query('INSERT INTO user_mutation_locks_v1520 VALUES($1,$2,$3,$4,$5)',[PLAN.userId,TOKEN,GRANT,DEADLINE+60000,'before']);
 return {c,options:{leaseToken:TOKEN,lockDeadline:DEADLINE+60000}};
}
const due=o=>({...o,previewClock:DEADLINE});
async function tx(c,fn){await c.query('BEGIN');try{const r=await fn();await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
const readonly=c=>({query(s,p){assert.match(s.trim(),/^SELECT\b/);return c.query(s,p);}});
test('grant exactly one; preserve account and stock; replay performs SELECT only',async t=>{
 const {c,options}=await fixture(t),before=await state(c);
 const r=await tx(c,()=>grant(c,HASH,options));assert.equal(r.verification.currentCopies,1);assert.equal(r.receipt.copiesBefore,0);
 const after=await state(c);assert.deepEqual({...after,cards:before.cards},before);
 assert.equal((await grant(readonly(c),HASH)).replayed,true);
 assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,1);
});
test('early recall fails; due recall clears only V-974 selections and preserves progression/history',async t=>{
 const {c,options}=await fixture(t);await tx(c,()=>grant(c,HASH,options));
 await assert.rejects(tx(c,()=>revoke(c,HASH,options)),/Not yet/);
 await c.query("UPDATE user_mercenary_loadout_v1 SET mercenary_code='V-974' WHERE user_id=5426");
 await c.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({mercenaryCode:'V-974',revision:8}),PVP_KEY]);
 const before=await state(c),r=await tx(c,()=>revoke(c,HASH,due(options))),after=await state(c);
 assert.equal(r.verification.currentCopies,0);assert.equal(r.receipt.removed,1);assert.deepEqual(r.receipt.clearedModes,['PVE','PVP']);
 assert.equal(after.loadout[0].mercenary_code,null);assert.equal(after.loadout[0].revision,11);assert.deepEqual(JSON.parse(after.pvp[0].value),{mercenaryCode:null,revision:9});
 for(const k of ['growth','levels','inventory','user','settings','stock','issues'])assert.deepEqual(after[k],before[k]);
 assert.equal((await revoke(readonly(c),HASH)).replayed,true);assert.equal((await grant(readonly(c),HASH)).verification.revoked,true);
 assert.equal((await c.query('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT])).rows.length,1);
 assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,2);
});
test('an independent extra copy survives recall and remains equipped',async t=>{
 const {c,options}=await fixture(t);await tx(c,()=>grant(c,HASH,options));
 await c.query("UPDATE user_mercenary_cards_v1 SET total_copies=2,duplicate_count=1 WHERE user_id=5426 AND mercenary_code='V-974'");
 await c.query("UPDATE user_mercenary_loadout_v1 SET mercenary_code='V-974' WHERE user_id=5426");
 const before=await state(c),r=await tx(c,()=>revoke(c,HASH,due(options))),after=await state(c);
 assert.equal(r.verification.currentCopies,1);assert.deepEqual(after.loadout,before.loadout);assert.deepEqual(after.pvp,before.pvp);
});
test('PVP-only recall invalidates cache without changing the other PVE selection',async t=>{
 const {c,options}=await fixture(t);await tx(c,()=>grant(c,HASH,options));
 await c.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({mercenaryCode:'V-974',revision:8}),PVP_KEY]);
 const r=await tx(c,()=>revoke(c,HASH,due(options))),after=await state(c);
 assert.deepEqual(r.receipt.clearedModes,['PVP']);assert.equal(after.loadout[0].mercenary_code,'V-999');assert.equal(after.loadout[0].revision,10);assert.notEqual(after.loadout[0].updated_at,'before');
});
test('already absent holding is recorded without subtracting another mercenary',async t=>{
 const {c,options}=await fixture(t);await tx(c,()=>grant(c,HASH,options));
 await c.query("DELETE FROM user_mercenary_cards_v1 WHERE user_id=5426 AND mercenary_code='V-974'");
 const before=await state(c),r=await tx(c,()=>revoke(c,HASH,due(options)));
 assert.equal(r.receipt.removed,0);assert.deepEqual(await state(c),before);assert.equal((await verify(c)).revoked,true);
});
test('grant and recall failures roll back ownership, receipts and audit together',async t=>{
 const {c,options}=await fixture(t),before=await state(c);
 const failAt=pattern=>({query(s,p){if(pattern.test(s))throw Error('injected failure');return c.query(s,p);}});
 await assert.rejects(tx(c,()=>grant(failAt(/INSERT INTO mercenary_card_acquisitions/),HASH,options)),/injected/);
 assert.deepEqual(await state(c),before);assert.equal(await receipt(c,GRANT),null);
 await tx(c,()=>grant(c,HASH,options));const granted=await state(c);
 await assert.rejects(tx(c,()=>revoke(failAt(/INSERT INTO app_meta/),HASH,due(options))),/injected/);
 assert.deepEqual(await state(c),granted);assert.equal(await receipt(c,REVOKE),null);assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,1);
});
test('wrong identity or account lease is rejected before a grant',async t=>{
 const {c,options}=await fixture(t);
 await assert.rejects(tx(c,()=>grant(c,HASH,{...options,leaseToken:'b'.repeat(64)})),/exactly one/);
 await c.query("UPDATE user_second_verifications SET provider_user_id='wrong' WHERE user_id=5426");
 await assert.rejects(tx(c,()=>grant(c,HASH,options)));
 assert.equal(await receipt(c,GRANT),null);assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,0);
});
