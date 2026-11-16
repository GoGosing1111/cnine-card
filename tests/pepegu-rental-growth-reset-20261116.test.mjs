import test from 'node:test';import assert from 'node:assert/strict';
import {pepeguRentalFixture} from './helpers/pepegu-rental-fixture-20261101.mjs';
import {purchaseLootProduct} from '../functions/_ranked_shop.js';
import {petGrowthState,executePetGrowth} from '../functions/_pet_growth.js';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {readPetRentals,petRentalKey,nextPetRental,petRentalWriteStatements,activePetRental} from '../functions/_pet_rental.js';
import {PET_GROWTH_KEY,initialPetGrowth} from '../shared/pet-growth-live-v2.mjs';
import {productDescription,lootRewardMarkup} from '../js/ranked-shop-presentation-v1.mjs';
const CODE='PET-PEPEGU',ID=CODE+':R',DAY=86400000,buy=(quantity=1)=>({requestId:crypto.randomUUID(),productId:'pepegu_30days',quantity});
const command=(command,revision,extra)=>({command,expectedRevision:revision,requestId:crypto.randomUUID(),...extra});
const raw=async(f,key)=>(await f.p('SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
const wallet=async f=>({coin:(await f.p('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=7').first()).coin,stars:Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first()).quantity),ranked:Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='RANKED_COIN'").first()).quantity)});
async function fixture(t,postgres){const f=await pepeguRentalFixture(t,{postgres});await f.p('UPDATE users SET coin=1000000000000000 WHERE id=7').run();await f.p("UPDATE cnine_user_inventory SET quantity=1000000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();return f;}
const state=f=>petGrowthState(f.env,7),run=(f,b)=>executePetGrowth(f.env,f.user,b,{randomInt:n=>n-1});
async function train(f){let s=await state(f);for(const kind of ['ROLL_STATS','ROLL_TRAIT']){s=await run(f,command(kind,s.revision,{instanceId:ID}));s=await run(f,command('APPLY',s.revision,{pendingId:s.pending.id}));}for(const mode of ['PVE','PVP'])s=await run(f,command('EQUIP',s.revision,{instanceId:ID,mode}));return s;}
async function expire(f){const r=await readPetRentals(f.env,7);r.state.pets[CODE].startedAt=new Date(Date.now()-91*DAY).toISOString();r.state.pets[CODE].expiresAt=new Date(Date.now()-1000).toISOString();await f.setting(r.key,r.state);return r;}
for(const postgres of [false,'pipeline']){
 test(`${postgres||'SQLite'} continuous bulk renewal retains rolls; expired repurchase starts fresh in growth and both battles`,async t=>{
  const f=await fixture(t,postgres),first=await purchaseLootProduct(f.env,f.user,buy(2));let s=await train(f);
  const before=await raw(f,PET_GROWTH_KEY(7)),saved=JSON.parse(before),other=initialPetGrowth('PET-BONGSOON'),permanent=initialPetGrowth(CODE);
  saved.pets[other.id]=other;saved.pets[permanent.id]=permanent;await f.setting(PET_GROWTH_KEY(7),saved);
  const kept=await raw(f,PET_GROWTH_KEY(7)),extended=await purchaseLootProduct(f.env,f.user,buy());assert.equal(extended.reward.action,'EXTEND');assert.equal(extended.reward.growthReset,undefined);
  assert.equal(Date.parse(extended.reward.expiresAt)-Date.parse(first.reward.expiresAt),30*DAY);assert.equal(await raw(f,PET_GROWTH_KEY(7)),kept);
  const rentals=await readPetRentals(f.env,7);assert(activePetRental(rentals.state,CODE,Date.parse(first.reward.startedAt)+30*DAY));
  assert.deepEqual((await loadPetBattleSnapshot(f.env,7,'PVE')).growth.stats,{attack:'SSS',defense:'SSS',hp:'SSS',speed:'SSS'});
  s=await state(f);const oldRoll=command('ROLL_STATS',s.revision,{instanceId:ID});s=await run(f,oldRoll);const pending=s.pending,oldRevision=s.revision;
  await expire(f);assert.equal(await loadPetBattleSnapshot(f.env,7),null);assert.equal((await state(f)).instances.some(p=>p.id===ID),false);
  const purchased=await purchaseLootProduct(f.env,f.user,buy());assert.equal(purchased.reward.action,'START');assert.equal(purchased.reward.growthReset,true);
  s=await state(f);const fresh=s.instances.find(p=>p.id===ID);assert.deepEqual(fresh.stats,initialPetGrowth(CODE,'R').stats);assert.deepEqual(fresh.trait,{id:'ASSAULT',grade:'C',activated:false});assert.equal(s.pending,null);assert.equal(s.revision,oldRevision+1);
  const stored=JSON.parse(await raw(f,PET_GROWTH_KEY(7)));assert.equal(stored.pets[ID],undefined);assert.deepEqual(stored.pets[other.id],other);assert.deepEqual(stored.pets[permanent.id],permanent);
  for(const mode of ['PVE','PVP']){const battle=await loadPetBattleSnapshot(f.env,7,mode);assert.equal(battle.growth,undefined);assert.equal(battle.definition.buffs[0].percent,55);}
  await assert.rejects(()=>run(f,command('APPLY',oldRevision,{pendingId:pending.id})),e=>e.code==='STALE_REVISION');
  await assert.rejects(()=>run(f,command('APPLY',s.revision,{pendingId:pending.id})),e=>e.code==='NO_PENDING_RESULT');
  const balance=await wallet(f),replayed=await run(f,oldRoll);assert.equal(replayed.replayed,true);assert.equal(replayed.pending,null);assert.deepEqual(await wallet(f),balance);
 });
 test(`${postgres||'SQLite'} failed purchase rolls back resets; retry and stale growth writes cannot erase newer results`,async t=>{
  const f=await fixture(t,postgres);await purchaseLootProduct(f.env,f.user,buy());await train(f);await expire(f);
  const b=buy(),before={rental:await raw(f,petRentalKey(7)),growth:await raw(f,PET_GROWTH_KEY(7)),wallet:await wallet(f)};
  f.fail('UPDATE joint_operations_v1 SET plan_json');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,b));f.fail('');
  assert.equal(await raw(f,petRentalKey(7)),before.rental);assert.equal(await raw(f,PET_GROWTH_KEY(7)),before.growth);assert.deepEqual(await wallet(f),before.wallet);
  const record=await readPetRentals(f.env,7),next=nextPetRental(record.state,CODE,30,crypto.randomUUID()),statements=await petRentalWriteStatements(f.env.DB,record,next.state),concurrent=JSON.parse(before.growth);
  concurrent.revision++;concurrent.pets['PET-BONGSOON:1']=initialPetGrowth('PET-BONGSOON');concurrent.pending={id:crypto.randomUUID(),instanceId:'PET-BONGSOON:1',kind:'stats',candidate:initialPetGrowth('PET-BONGSOON').stats};await f.setting(PET_GROWTH_KEY(7),concurrent);
  await assert.rejects(()=>f.env.DB.batch(statements));assert.equal(await raw(f,petRentalKey(7)),before.rental);assert.deepEqual(JSON.parse(await raw(f,PET_GROWTH_KEY(7))),concurrent);
  const renewed=await purchaseLootProduct(f.env,f.user,b);assert.equal(renewed.reward.growthReset,true);const after=await state(f);assert.deepEqual(after.pending,concurrent.pending);await run(f,command('KEEP',after.revision,{pendingId:after.pending.id}));await train(f);
  const grown=await raw(f,PET_GROWTH_KEY(7)),balance=await wallet(f),again=await purchaseLootProduct(f.env,f.user,b);assert.equal(again.replayed,true);assert.equal(await raw(f,PET_GROWTH_KEY(7)),grown);assert.deepEqual(await wallet(f),balance);
  const rental=await readPetRentals(f.env,7),end=Date.parse(rental.state.pets[CODE].expiresAt);assert.equal(nextPetRental(rental.state,CODE,30,'boundary',end-1).action,'EXTEND');assert.equal(nextPetRental(rental.state,CODE,30,'boundary',end).action,'START');
 });
}
test('purchase disclosure includes reset even with a saved CMS description and reports it in the receipt',()=>{
 const p={type:'PET_RENTAL',petCode:CODE,description:'저장된 상품 설명'};assert.match(productDescription(p),/만료 전 연장은 주사위 결과를 유지/);assert.match(productDescription(p),/누적 이용 기간이 모두 끝난 뒤 재구매하면.*초기화/);
 assert.doesNotMatch(productDescription({...p,petCode:'PET-HEUKGU'}),/초기화/);
 assert.match(lootRewardMarkup({kind:'PET_RENTAL',action:'START',name:'페페구',durationDays:30,expiresAt:new Date().toISOString(),growthReset:true}),/초기화되었습니다/);
});
