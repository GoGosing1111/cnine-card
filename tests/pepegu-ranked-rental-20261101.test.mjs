import test from 'node:test';import assert from 'node:assert/strict';
import {pepeguRentalFixture} from './helpers/pepegu-rental-fixture-20261101.mjs';
import {purchaseLootProduct,lootShopState,saveLootShopPolicy} from '../functions/_ranked_shop.js';
import {rankedCoinBalance} from '../functions/_ranked_coin.js';
import {readPetCollection,readPetOwnership,loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {readPetRentals,activePetRental,petRentalKey,petOwnershipPredicate} from '../functions/_pet_rental.js';
import {applyPetOpeningBuff} from '../shared/companion-opening-v1.mjs';
import {handlePetEquipment} from '../functions/_pet_equipment.js';
import {attemptPetPotential} from '../functions/_pet_potential.js';
import {readCollectionBonuses,withCollectionBonusScope} from '../functions/_collection_bonuses.js';
import {validateLootShopPolicy} from '../shared/loot-shop-policy-v1.mjs';
import {validateRankedShopPolicy,rankedPurchaseMaximum} from '../shared/ranked-shop-policy-v1.mjs';
const CODE='PET-PEPEGU',DAY=86400000,body=(quantity=1)=>({requestId:crypto.randomUUID(),productId:'pepegu_30days',quantity});
const equip=async(f,code,revision=0)=>{
 const request=new Request('https://qa.test/api/pets/v1/loadout',{method:'POST',headers:{'content-type':'application/json',origin:'https://qa.test'},body:JSON.stringify({petCode:code,expectedRevision:revision,petCmsRevision:44,requestId:crypto.randomUUID()})});
 const response=await handlePetEquipment({path:'pets/v1/loadout',request,env:f.env,deps:{authenticate:async()=>f.user,json:(b,status=200)=>Response.json(b,{status})}});return {status:response.status,body:await response.json()};
};
for(const postgres of [false,'pipeline']){
 test(`${postgres||'SQLite'} rental payment grants 30 days once, renewal and bulk extend without permanent ownership`,async t=>{
  const f=await pepeguRentalFixture(t,{postgres}),b=body(),start=Date.now(),one=await purchaseLootProduct(f.env,f.user,b);
  assert.equal(one.totalPrice,1500);assert.equal(one.reward.kind,'PET_RENTAL');assert.equal(one.reward.action,'START');assert(Date.parse(one.reward.expiresAt)>=start+30*DAY);assert(Date.parse(one.reward.expiresAt)<Date.now()+30*DAY+1000);
  assert.equal(await rankedCoinBalance(f.env,7),10500);assert.equal((await readPetOwnership(f.env,7)).pets[CODE],1);assert.equal((await readPetCollection(f.env,7)).state.pets[CODE],undefined);assert.equal(one.state.ownedPacks.length,0);
  const replay=await purchaseLootProduct(f.env,f.user,b);assert(replay.replayed);assert.deepEqual(replay.reward,one.reward);assert.equal(await rankedCoinBalance(f.env,7),10500);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{...b,quantity:2}),/같은 요청/);
  const two=await purchaseLootProduct(f.env,f.user,body(2));assert.equal(two.totalPrice,3000);assert.equal(two.reward.action,'EXTEND');assert.equal(Date.parse(two.reward.expiresAt)-Date.parse(one.reward.expiresAt),60*DAY);assert.equal(await rankedCoinBalance(f.env,7),7500);
  const state=await lootShopState(f.env,f.user),p=state.products.find(p=>p.id===b.productId);assert.equal(p.bought,3);assert.equal(p.remaining,null);assert.equal(rankedPurchaseMaximum(p,state.rankedCoins),5);
 });
 test(`${postgres||'SQLite'} receipt write failure rolls back payment and rental; later retry starts a full new period`,async t=>{
  const f=await pepeguRentalFixture(t,{postgres}),b=body();f.fail('UPDATE joint_operations_v1 SET plan_json');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,b));f.fail('');
  assert.equal(await rankedCoinBalance(f.env,7),12000);assert.equal((await readPetRentals(f.env,7)).raw,null);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM loot_shop_purchases_v1').first()).n),0);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM inventory_logs').first()).n),0);
  const now=Date.now,at=now()+7200000;Date.now=()=>at;let r;try{r=await purchaseLootProduct(f.env,f.user,b);}finally{Date.now=now;}
  assert.equal(r.reward.startedAt,new Date(at).toISOString());assert.equal(Date.parse(r.reward.expiresAt),at+30*DAY);assert.equal(await rankedCoinBalance(f.env,7),10500);
 });
 test(`${postgres||'SQLite'} exact expiry disables equipped combat and all bonuses, keeps permanent ownership and potential history`,async t=>{
  const f=await pepeguRentalFixture(t,{postgres});const r=await purchaseLootProduct(f.env,f.user,body());
  assert.equal((await equip(f,CODE)).status,200);const snap=await loadPetBattleSnapshot(f.env,7);assert.equal(snap.definition.buffs[0].percent,55);
  const scoped=withCollectionBonusScope(f.env);assert.deepEqual((await readCollectionBonuses(scoped,7)).petBonuses,{dropPercent:25,accountXpPercent:55,coinPercent:55});
  const rental=await readPetRentals(f.env,7),end=Date.parse(r.reward.expiresAt);assert(activePetRental(rental.state,CODE,end-1));assert(!activePetRental(rental.state,CODE,end));
  const now=Date.now;Date.now=()=>end;try{assert.equal((await readPetOwnership(f.env,7)).pets[CODE],undefined);assert.equal(await loadPetBattleSnapshot(f.env,7),null);assert.deepEqual((await readCollectionBonuses(scoped,7)).petBonuses,{dropPercent:0,accountXpPercent:0,coinPercent:0});assert.equal((await equip(f,CODE,1)).status,403);}finally{Date.now=now;}
  await f.setting('pet_collection_v1:7',{revision:1,pets:{[CODE]:1,'PET-HEUKGU':2}});Date.now=()=>end;try{assert.equal((await readPetOwnership(f.env,7)).pets[CODE],1);assert.equal((await readPetOwnership(f.env,7)).pets['PET-HEUKGU'],2);assert.equal((await loadPetBattleSnapshot(f.env,7)).definition.code,CODE);}finally{Date.now=now;}
  const balance=await rankedCoinBalance(f.env,7);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body()),/영구 보유/);assert.equal(await rankedCoinBalance(f.env,7),balance);
 });
 test(`${postgres||'SQLite'} temporary owners can gain potential; expired owners cannot spend potions`,async t=>{
  const f=await pepeguRentalFixture(t,{postgres});await purchaseLootProduct(f.env,f.user,body());await f.setting('pet_potential_settings_v1',{version:1,revision:1,enabled:true,successPpm:1000000});
  await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'PET_POTENTIAL_POTION',2,2)").run();
  const b={requestId:crypto.randomUUID(),petCode:CODE,expectedRevision:0,settingsRevision:1};const r=await attemptPetPotential(f.env,f.user,b,{random:()=>0});assert(r.success);assert.equal((await attemptPetPotential(f.env,f.user,b)).replayed,true);
  const rental=await readPetRentals(f.env,7);rental.state.pets[CODE].startedAt=new Date(Date.now()-31*DAY).toISOString();rental.state.pets[CODE].expiresAt=new Date(Date.now()-1).toISOString();await f.setting(petRentalKey(7),rental.state);
  await assert.rejects(()=>attemptPetPotential(f.env,f.user,{...b,requestId:crypto.randomUUID(),expectedRevision:1}),/현재 보유/);assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='PET_POTENTIAL_POTION'").first()).quantity),1);
  assert.equal(JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='pet_potentials_v1:7'").first()).value).pets[CODE].potential,'MAGNET');
 });
}
test('rental policy is restricted to ranked shop; CMS round trip preserves it and existing products',async t=>{
 const f=await pepeguRentalFixture(t),policy=f.plan.policy;assert.equal(policy.products.at(-1).durationDays,30);assert.equal(policy.products.at(-1).price,1500);
 assert.throws(()=>validateLootShopPolicy({...f.shopPolicy,products:policy.products}),/상품 코드/);assert.deepEqual(validateRankedShopPolicy(policy),policy);
 const before=structuredClone(policy),saved=await saveLootShopPolicy(f.env,{id:8,role:'OWNER'},policy);assert.equal(saved.revision,before.revision+1);assert.deepEqual(saved.products,before.products);
 for(const bad of [0,1.5,366])assert.throws(()=>validateRankedShopPolicy({...policy,products:[{...f.product,durationDays:bad}]}),/이용 일수/);
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} saved battle snapshots and stale ownership guards expire`,async t=>{
 const f=await pepeguRentalFixture(t,{postgres});await purchaseLootProduct(f.env,f.user,body());await equip(f,CODE);
 const snapshot=await loadPetBattleSnapshot(f.env,7),actor=()=>({id:'A:1',hp:100,maxHp:100,attack:100,defense:10,speed:10});
 for(const mode of ['PVE','PVP']){const team=[actor()];assert(applyPetOpeningBuff(team,snapshot,'A',mode));assert.equal(team[0].attack,155);}
 const now=Date.now;Date.now=()=>Date.parse(snapshot.expiresAt);try{const team=[actor()];assert.equal(applyPetOpeningBuff(team,snapshot,'A','PVE'),null);assert.equal(team[0].attack,100);}finally{Date.now=now;}
 const rental=await readPetRentals(f.env,7),end=Date.now()-1000;rental.state.pets[CODE].startedAt=new Date(end-DAY).toISOString();rental.state.pets[CODE].expiresAt=new Date(end).toISOString();await f.setting(petRentalKey(7),rental.state);
 const stale=await readPetOwnership(f.env,7,{now:end-1});assert.equal(stale.pets[CODE],1);
 const [predicate,args]=petOwnershipPredicate(f.env.DB,stale,CODE);assert.equal(Boolean((await f.p(`SELECT (${predicate}) AS allowed`,...args).first()).allowed),false);
});
