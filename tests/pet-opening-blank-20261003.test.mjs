import test from 'node:test';
import assert from 'node:assert/strict';
import {petOpeningFixture} from './helpers/pet-opening-fixture.mjs';
import {PET_OPENING_KEY} from '../shared/pet-opening-v1.mjs';
const setup=async(t,postgres=false)=>{const h=await petOpeningFixture({postgres});t.after(()=>h.close());await h.stock(1,100,1000);return h;};
const open=(h,count,requestId=h.uid(),revision=1)=>h.petCall('pets/opening/open',{body:{count,requestId,expectedRevision:revision}});
async function withRolls(values,work){const previous=crypto.getRandomValues;let i=0;crypto.getRandomValues=array=>{array[0]=values[i++%values.length];return array;};try{return await work();}finally{crypto.getRandomValues=previous;}}
test('CMS includes blank in the same denominator, validates weights and preserves legacy zero-blank settings',async t=>{
  const h=await setup(t);assert.equal((await h.petCall()).body.settings.blankWeight,0);
  for(const blankWeight of [-1,1.5,1000001])assert.equal((await h.petConfigure({blankWeight})).status,400);
  await h.petConfigure({enabled:true,pool:[{code:'PET-BONGSOON',weight:1},{code:'PET-DIIM',weight:3}],blankWeight:4});
  const state=(await h.petCall()).body;assert.equal(state.pool[0].probability,.125);assert.equal(state.pool[1].probability,.375);assert.equal(state.blankProbability,.5);
  const legacy={...state.settings};delete legacy.blankWeight;
  assert.equal((await h.petCall('admin/pets/opening',{body:{settings:legacy}})).body.code,'PET_OPEN_CLIENT_UPDATE');
  await h.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(legacy),PET_OPENING_KEY);
  const old=(await h.petCall()).body;assert.equal(old.settings.blankWeight,0);assert.equal(old.blankProbability,0);assert.equal(old.pool[0].probability,.25);
});
for(const postgres of [false,true])test('all-blank batch consumes both items without granting any pet; retries never reroll '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await setup(t,postgres);await h.petConfigure({enabled:true,pool:[{code:'PET-BONGSOON',weight:1}],blankWeight:1});const requestId=h.uid();
  const a=await withRolls([1],()=>open(h,7,requestId));assert.equal(a.status,200,JSON.stringify(a.body));
  assert.equal(a.body.blankCount,7);assert.equal(a.body.petCount,0);assert.ok(a.body.results.every(p=>p.outcome==='EMPTY'&&p.code===null));assert.deepEqual(a.body.collection.pets,{});
  assert.deepEqual(a.body.balances,{seals:93,essence:930});
  const b=await withRolls([0],()=>open(h,7,requestId));assert.equal(b.body.replayed,true);assert.deepEqual(b.body.results,a.body.results);
  assert.equal((await h.all("SELECT * FROM inventory_logs WHERE reference_type='PET_OPENING'")).length,2);
  assert.deepEqual((await h.petCall()).body.ownedPets,[]);
});
test('mixed results only add successful pets, and price edits do not reroll an old receipt',async t=>{
  const h=await setup(t);await h.petConfigure({enabled:true,pool:[{code:'PET-DIIM',weight:1}],blankWeight:1});const requestId=h.uid();
  const result=await withRolls([1,0],()=>open(h,8,requestId));assert.equal(result.body.blankCount,4);assert.equal(result.body.petCount,4);assert.deepEqual(result.body.collection.pets,{'PET-DIIM':4});
  assert.equal(result.body.results.filter(p=>p.isNew).length,1);
  await h.petConfigure({blankWeight:100,essencePerOpen:15});
  const replay=await open(h,8,requestId);assert.equal(replay.body.blankCount,4);assert.equal(replay.body.cost.essence,80);
});
test('mixed blank/pet transaction rolls back completely when ledger fails; review never consumes',async t=>{
  const h=await setup(t);await h.petConfigure({enabled:true,pool:[{code:'PET-JOEUN',weight:1}],blankWeight:1});const requestId=h.uid();
  h.inject('INSERT INTO inventory_logs');assert.equal((await withRolls([0,1],()=>open(h,8,requestId))).status,503);h.inject('');
  const state=(await h.petCall()).body;assert.deepEqual(state.balances,{seals:100,essence:1000});assert.deepEqual(state.collection.pets,{});
  const preview=await withRolls([1],()=>h.petCall('admin/pets/opening/review',{body:{count:3}}));assert.equal(preview.body.blankCount,3);assert.equal(preview.body.reviewOnly,true);
  assert.deepEqual((await h.petCall()).body.balances,state.balances);
  assert.equal((await withRolls([0,1],()=>open(h,8,requestId))).body.petCount,4);
});
