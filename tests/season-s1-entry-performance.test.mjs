import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonFixture} from './helpers/season-s1-db.mjs';
import {seasonStatus} from '../functions/_season_s1.js';
import {emptyAccount} from '../shared/season-s1.mjs';
import {addImmortal} from '../shared/character-runes.mjs';

for(const postgres of [false,true]){
 test(`season status reads only worn gear and specific socketed instances (${postgres?'PostgreSQL':'SQLite'})`,async t=>{
  const {env,DB}=await seasonFixture(t,{postgres});
  const reads=[];
  const measured={...env,DB:{dialect:DB.dialect,prepare(sql){
   const stmt=DB.prepare(sql);
   return {bind(...args){reads.push({sql,args});return stmt.bind(...args);}};
  }}};
  const empty=await seasonStatus(measured,4242);
  assert.deepEqual(empty.runes.equippedInstances.sort((a,b)=>a-b),[101,102,103,104,105]);
  assert.equal(reads.some(q=>q.sql.includes('FROM user_equipment_instances x')),false);

  const state=emptyAccount();
  const worn=addImmortal(state),inBag=addImmortal(state),suit=addImmortal(state),missing=addImmortal(state);
  state.itemRunes={101:worn,106:inBag,107:suit,99999:missing};
  await DB.prepare('INSERT INTO season_s1_accounts(user_id,revision,state_json) VALUES(?,?,?)').bind(4242,1,JSON.stringify(state)).run();
  reads.length=0;
  const status=await seasonStatus(measured,4242);
  assert.deepEqual(status.runes.placements,{101:worn,106:inBag});
  assert.equal(status.runes.activeCount,1);
  const itemReads=reads.filter(q=>q.sql.includes('FROM user_equipment_instances x'));
  assert.equal(itemReads.length,1);
  assert.match(itemReads[0].sql,/x\.id IN \(\?,\?,\?\)/);
  assert.deepEqual(itemReads[0].args,[4242,106,107,99999]);
  await DB.prepare('UPDATE user_equipment_instances SET user_id=? WHERE id=?').bind(17,106).run();
  const afterTransfer=await seasonStatus(measured,4242);
  assert.deepEqual(afterTransfer.runes.placements,{101:worn});
  assert.equal(afterTransfer.runes.activeCount,1);
 });
}
