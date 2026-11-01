import test from 'node:test';import assert from 'node:assert/strict';
import {pepeguRentalFixture} from './helpers/pepegu-rental-fixture-20261101.mjs';
import {purchaseLootProduct} from '../functions/_ranked_shop.js';
import {selectSupportPet} from '../functions/_server_support.js';
import {readSupportRecord} from '../functions/_supporter_benefits.js';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {readPetRentals,petRentalKey} from '../functions/_pet_rental.js';
import {emptySupport,supportKey} from '../shared/server-support-v1.mjs';
for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} season-pass magnet supports active rentals, preserves subscription and stops after rental expiry`,async t=>{
 const f=await pepeguRentalFixture(t,{postgres}),code='PET-PEPEGU',now=Date.now();await purchaseLootProduct(f.env,f.user,{requestId:crypto.randomUUID(),productId:'pepegu_30days'});
 const support={...emptySupport(),revision:1,startsAt:now-1000,endsAt:now+90*86400000};await f.setting(supportKey(7),support);await f.setting('pet_loadout_v1:7',{revision:1,petCode:code,audit:[]});
 const body={requestId:crypto.randomUUID(),expectedRevision:1,petCode:code},r=await selectSupportPet(f.env,f.user,body);assert.equal(r.subscription.magnetPetCode,code);assert.equal(r.subscription.endsAt,support.endsAt);assert.equal((await selectSupportPet(f.env,f.user,body)).replayed,true);assert.equal((await loadPetBattleSnapshot(f.env,7)).magnet,true);
 const rental=await readPetRentals(f.env,7);rental.state.pets[code].startedAt=new Date(now-86400000).toISOString();rental.state.pets[code].expiresAt=new Date(now-1).toISOString();await f.setting(petRentalKey(7),rental.state);
 assert.equal(await loadPetBattleSnapshot(f.env,7),null);await assert.rejects(()=>selectSupportPet(f.env,f.user,{...body,requestId:crypto.randomUUID(),expectedRevision:2}),/현재 보유/);assert.equal((await readSupportRecord(f.env,7)).state.endsAt,support.endsAt);
});
