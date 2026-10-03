import test from 'node:test';
import assert from 'node:assert/strict';
import {petOpeningFixture} from './helpers/pet-opening-fixture.mjs';
import {PET_OPENING_KEY} from '../shared/pet-opening-v1.mjs';
const setup=async(t,postgres=false)=>{const h=await petOpeningFixture({postgres});t.after(()=>h.close());return h;};
const open=(h,count,revision=1,requestId=h.uid())=>h.petCall('pets/opening/open',{body:{count,expectedRevision:revision,requestId}});
test('default costs, guarded pool, OWNER settings, method/origin/input and honest closed state',async t=>{
  const h=await setup(t),initial=await h.petCall();
  assert.equal(initial.body.settings.essencePerOpen,10);assert.equal(initial.body.maxOpen,0);assert.deepEqual(initial.body.pool,[]);
  assert.equal((await h.petCall('admin/pets/opening',{user:5})).status,403);
  assert.equal((await open(h,1,0)).status,423);
  assert.equal((await h.petConfigure({enabled:true})).status,400);
  assert.equal((await h.petConfigure({essencePerOpen:0})).status,400);
  assert.equal((await h.petConfigure({pool:[{code:'PET-UNKNOWN',weight:1}]})).status,400);
  assert.equal((await h.petCall('pets/opening/open',{body:{requestId:h.uid(),count:1,expectedRevision:0},origin:'https://evil.invalid'})).status,403);
  assert.equal((await h.petCall('pets/opening/open',{body:{requestId:h.uid(),count:1,expectedRevision:0,petCode:'PET-DIIM'}})).status,400);
  const review=await h.petCall('admin/pets/opening/review',{body:{count:5}});
  assert.equal(review.body.reviewOnly,true);assert.equal(review.body.demoPool,true);
  assert.equal((await h.all("SELECT * FROM app_meta WHERE key LIKE 'pet_collection%'")).length,0);
});
for(const postgres of [false,true])test('atomic two-item debit, persisted collection, duplicate results and retry '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await setup(t,postgres);await h.stock();const cfg=await h.petConfigure({enabled:true,pool:[{code:'PET-BONGSOON',weight:1}]});assert.equal(cfg.status,200);
  const requestId=h.uid(),a=await open(h,7,1,requestId);
  assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.results.length,7);assert.equal(a.body.collection.pets['PET-BONGSOON'],7);
  assert.equal(a.body.results.filter(p=>p.isNew).length,1);assert.deepEqual(a.body.balances,{seals:93,essence:930});
  await h.petConfigure({enabled:false,essencePerOpen:22});
  const b=await open(h,7,1,requestId);assert.equal(b.status,200);assert.equal(b.body.replayed,true);assert.deepEqual(a.body.results,b.body.results);
  assert.equal((await open(h,8,1,requestId)).status,409);
  assert.equal((await h.all("SELECT * FROM inventory_logs WHERE reference_type='PET_OPENING'")).length,2);
  assert.equal((await h.petCall()).body.collection.pets['PET-BONGSOON'],7);
});
test('insufficient either item, fractional count and changed price never consume',async t=>{
  const h=await setup(t);await h.petConfigure({enabled:true,pool:[{code:'PET-DIIM',weight:1}]});await h.stock(1,10,19);
  assert.equal((await open(h,2)).status,409);assert.equal((await open(h,1.5)).status,400);
  await h.stock(1,0,100);assert.equal((await open(h,1)).status,409);
  await h.stock();await h.petConfigure({essencePerOpen:12});assert.equal((await open(h,1)).body.code,'PET_OPEN_REVISION');
  assert.equal((await h.petCall()).body.balances.essence,1000);assert.equal((await open(h,3,2)).body.cost.essence,36);
});
for(const postgres of [false,true])test('ledger fault rolls both debits and ownership back; same request retry '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await setup(t,postgres);await h.petConfigure({enabled:true,pool:[{code:'PET-HEEYA',weight:1}]});await h.stock();const requestId=h.uid();
  h.inject('INSERT INTO inventory_logs');assert.equal((await open(h,5,1,requestId)).status,503);h.inject('');
  assert.deepEqual((await h.petCall()).body.balances,{seals:100,essence:1000});assert.deepEqual((await h.petCall()).body.collection.pets,{});
  assert.equal((await open(h,5,1,requestId)).status,200);
});
test('concurrent identical requests settle once; distinct requests cannot overspend',async t=>{
  const h=await setup(t);await h.petConfigure({enabled:true,pool:[{code:'PET-JOEUN',weight:1}]});await h.stock(1,2,20);const requestId=h.uid();
  const same=await Promise.all([open(h,1,1,requestId),open(h,1,1,requestId)]);assert.equal(same.filter(r=>r.status===200).length,2);
  const other=await Promise.all([open(h,1),open(h,1)]);assert.equal(other.filter(r=>r.status===200).length,1);assert.equal(other.filter(r=>r.status===409).length,1);
  assert.equal((await h.petCall()).body.collection.pets['PET-JOEUN'],2);
  const old=await h.petCall('admin/pets/opening');await h.petConfigure({essencePerOpen:20});
  assert.equal((await h.petCall('admin/pets/opening',{body:{settings:old.body.settings}})).status,409);
  assert.ok(await h.one('SELECT value FROM app_meta WHERE key=?',PET_OPENING_KEY));
});
test('weighted live pool honors exclusions and sums all 500 acquisitions',async t=>{
  const h=await setup(t);await h.stock(1,500,5000);await h.petConfigure({enabled:true,maxBatch:500,pool:[{code:'PET-BONGSOON',weight:1},{code:'PET-DIIM',weight:3}]});
  const result=await open(h,500);assert.equal(result.status,200);
  assert.ok(result.body.results.every(p=>['PET-BONGSOON','PET-DIIM'].includes(p.code)));
  const n=result.body.collection.pets['PET-BONGSOON'];assert.ok(n>=75&&n<=175,'25% weight has a broad statistical acceptance band');
  assert.equal(Object.values(result.body.collection.pets).reduce((a,b)=>a+b,0),500);assert.deepEqual(result.body.balances,{seals:0,essence:0});
});
