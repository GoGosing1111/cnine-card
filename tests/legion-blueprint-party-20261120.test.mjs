import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {readCollectionBonuses} from '../functions/_collection_bonuses.js';
import {readCitadelBonuses} from '../functions/_legion_citadel_bonuses.js';
import {replaceTicket,chapters} from '../scripts/ops/legion-secret-blueprints-20261120.mjs';

test('each chapter is active with the same low weight and no ticket or duplicate is retained',()=>{
 const other={type:'INVENTORY_ITEM',ref:'OTHER',weight:15,enabled:true,minQuantity:1,maxQuantity:3};
 const ticket={type:'INVENTORY_ITEM',ref:'SUPERSTAR_UPGRADE_13_TICKET',weight:0.1,enabled:true};
 const catalog=chapters.map((code,i)=>({code,is_active:1,rarity:'SPECIAL',name:'설계도 '+(i+1)+'장',image_url:'assets/part-'+i+'.webp'}));
 const pool=replaceTicket([other,ticket],catalog);assert.deepEqual(pool.map(i=>i.ref),['OTHER',...chapters]);assert.deepEqual(pool[0],other);
 for(const part of pool.slice(1))assert.deepEqual([part.weight,part.minQuantity,part.maxQuantity,part.enabled],[0.001,1,1,true]);
 assert.throws(()=>replaceTicket(pool,catalog));assert.throws(()=>replaceTicket([ticket],catalog.slice(1)));
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' party bonuses retain per-account ownership, honor totals and fresh reads after changes',async t=>{
 const f=await collectionFixture(t,{postgres}),users=[{id:7},{id:8}];
 const expected=await Promise.all(users.map(u=>readCollectionBonuses(f.env,u.id)));
 assert.notDeepEqual(expected[0],expected[1]);
 assert.deepEqual(await readCitadelBonuses(f.env,users),expected);
 assert.deepEqual(await readCitadelBonuses(f.env,[...users].reverse()),[...expected].reverse());
 await f.write('trophy_lich_clear_v1:8',{version:1,count:200,acquiredAt:'2026-11-20T00:00:00Z'});
 const changed=await Promise.all(users.map(u=>readCollectionBonuses(f.env,u.id)));
 assert.deepEqual(changed[0],expected[0]);assert.ok(changed[1].totals.dropPercent>expected[1].totals.dropPercent);
 assert.deepEqual(await readCitadelBonuses(f.env,users),changed);
});
