import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {prepareSssReroll} from '../scripts/ops/sss-reroll-prepare-20261014.mjs';
test('production preparation rolls back failed audit, preserves operator settings and grants nothing',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await f.pg.query("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const key='mercenary_sss_reroll_policy_v1',item='MERCENARY_SSS_REROLL_TICKET';
 const dry=await prepareSssReroll(f.pg);assert.equal(dry.mode,'OFF');assert.equal(dry.dryRun,true);assert.equal((await f.pg.query('SELECT key FROM app_meta WHERE key=$1',[key])).rows.length,0);
 const broken={query:(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('injected audit failure');return f.pg.query(sql,args);}};
 await assert.rejects(prepareSssReroll(broken,{apply:true}),/injected/);assert.equal((await f.pg.query('SELECT code FROM inventory_items WHERE code=$1',[item])).rows.length,0);
 const saved=await prepareSssReroll(f.pg,{apply:true});assert.equal(saved.createdPolicy,true);assert.equal(saved.assignedCards,0);assert.equal(saved.granted,0);
 const before=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0].value;
 const repeat=await prepareSssReroll(f.pg,{apply:true});assert.equal(repeat.createdPolicy,false);assert.equal(repeat.auditId,undefined);
 assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0].value,before);
 assert.equal((await f.pg.query('SELECT user_id FROM cnine_user_inventory WHERE item_code=$1',[item])).rows.length,0);
});
