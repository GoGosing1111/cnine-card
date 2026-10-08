import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {prepareChickenEventOperation,PREPARE_KEY} from '../scripts/ops/chicken-event-prepare-20261008.mjs';
import {CHICKEN_KEY,CHICKEN_TICKET} from '../shared/chicken-event-v1.mjs';
test('preparation is atomic, OFF and replay preserves later operator edits',async()=>{const f=await fixture();try{
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT; UPDATE users SET role='OWNER' WHERE id=1");
 const dry=await prepareChickenEventOperation(f.pg);assert.equal(dry.dryRun,true);assert.equal(await f.row('SELECT value FROM app_meta WHERE key=$1',[CHICKEN_KEY]),undefined);
 assert.equal(await f.row('SELECT code FROM inventory_items WHERE code=$1',[CHICKEN_TICKET]),undefined);
 const done=await prepareChickenEventOperation(f.pg,{commit:true});assert.equal(done.settings.enabled,false);assert.equal(done.settings.startsAt,null);assert.deepEqual(done.settings.rewards,[]);assert.equal(done.ticketsGranted,0);
 const edited={settings:{...done.settings,visible:true},revision:'operator-edit'};await f.pg.query('UPDATE app_meta SET value=$2 WHERE key=$1',[CHICKEN_KEY,JSON.stringify(edited)]);
 assert.equal((await prepareChickenEventOperation(f.pg,{commit:true})).replayed,true);assert.deepEqual(JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=$1',[CHICKEN_KEY])).value),edited);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM app_meta WHERE key=$1',[PREPARE_KEY])).n,1);
 }finally{await f.close();}});
