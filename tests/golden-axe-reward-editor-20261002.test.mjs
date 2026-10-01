import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {goldenAxeAdmin} from '../functions/_golden_axe.js';
import {AXE_KEY,AXE_REWARDS,cleanAxeSettings,pickAxeReward} from '../js/golden-axe-model-v1.js';
const key='ITEM_VEHICLE_PART_ENGINE';
async function save(f,extra){const current=await goldenAxeAdmin(f.env,{id:99});return goldenAxeAdmin(f.env,{id:99},{...current.settings,revision:current.revision,...extra});}

test('legacy round keeps its exact prize table, dates, rates and participation cutoff',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.configure();
 const row=JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=$1',[AXE_KEY])).value);delete row.rewards;row.historyStartsAt=row.startsAt;await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(row),AXE_KEY]);
 const loaded=await goldenAxeAdmin(f.env,{id:99});assert.deepEqual(loaded.rewards.map(r=>r.key),AXE_REWARDS.map(r=>r.key));assert.deepEqual(loaded.settings.rates,row.rates);
 const next=await save(f,{}),stored=JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=$1',[AXE_KEY])).value);
 for(const name of ['startsAt','endsAt','axeCost','dailyLimit'])assert.equal(next.settings[name],row[name]);assert.equal(stored.historyStartsAt,row.historyStartsAt);
 assert(next.itemCatalog.some(r=>r.key===key));assert(next.itemCatalog.some(r=>r.key==='SUPERSTAR_13'));assert(!next.itemCatalog.some(r=>r.key==='ITEM_SUPERSTAR_UPGRADE_13_TICKET'));
});

test('custom material quantity is server-resolved, granted atomically and replayed only once',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.configure();
 await save(f,{rewards:[{key,quantity:150,name:'forged name',kind:'COIN',amount:999999999999}],rates:{[key]:100}});
 const s=await f.state();assert.deepEqual(s.rewards.map(r=>r.key),[key]);assert.equal(s.rewards[0].kind,'ITEM');assert.equal(s.rewards[0].quantity,150);assert.notEqual(s.rewards[0].name,'forged name');assert(!Object.hasOwn(s,'rates'));assert(!Object.hasOwn(s,'mercenaryRates'));
 const body=await f.body();for(const fault of ['INSERT INTO inventory_logs','UPDATE cnine_user_inventory','INSERT INTO golden_axe_receipts_v1']){f.fault(fault);await assert.rejects(f.draw(body));f.fault(null);assert.equal((await f.state()).axes,10);assert.equal(await f.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',['VEHICLE_PART_ENGINE']),undefined);}
 const receipt=await f.draw(body);assert.equal(receipt.reward.quantity,150);assert.equal((await f.draw(body)).replayed,true);assert.equal((await f.state()).axes,9);assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',['VEHICLE_PART_ENGINE'])).quantity),150);
});

test('deleting rewards removes them from draws/public list, preserves receipts, and rejects stale quotes',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.configure('H_BODY');const original=await f.draw(await f.body()),oldBody=await f.body();
 const next=await save(f,{rewards:[{key,quantity:37},{key:'MISS',quantity:1}],rates:{[key]:.1,MISS:99.9}});
 assert.equal(next.settings.rates.H_BODY,undefined);assert.equal(pickAxeReward(next.settings,999).key,key);assert.equal(pickAxeReward(next.settings,1000).key,'MISS');
 await assert.rejects(f.draw(oldBody),e=>e.code==='SETTINGS_CHANGED');assert.equal((await f.state()).axes,9);
 const updated=await f.state();assert.deepEqual(updated.rewards.map(r=>r.key),[key,'MISS']);assert.equal(updated.history[0].reward.key,'H_BODY');assert.equal((await f.draw({requestId:original.requestId})).replayed,true);
 const coin=await save(f,{rewards:[{key:'COIN_500',quantity:1}],rates:{COIN_500:100}});assert.equal(pickAxeReward(coin.settings,999999).key,'COIN_500');
 // A cached CMS without the new list field must never resurrect removed prizes.
 const legacy={...coin.settings,revision:coin.revision};delete legacy.rewards;legacy.rates.H_BODY=0;const preserved=await goldenAxeAdmin(f.env,{id:99},legacy);assert.deepEqual(preserved.settings.rewards,[{key:'COIN_500',quantity:1}]);
});

test('unknown/inactive materials, duplicate aliases and invalid quantities cannot be enabled or charged',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.configure();
 await assert.rejects(save(f,{rewards:[{key:'ITEM_NOT_REGISTERED',quantity:1}],rates:{ITEM_NOT_REGISTERED:100}}),e=>e.code==='ITEM_UNKNOWN');
 for(const quantity of [0,null,-1,1.5,1000001,'100'])assert.throws(()=>cleanAxeSettings({rewards:[{key,quantity}]}));
 assert.throws(()=>cleanAxeSettings({rewards:[{key},{key}]}));assert.throws(()=>cleanAxeSettings({rewards:[{key:'ADVANCEMENT'},{key:'ITEM_UNIQUE_ADVANCEMENT_PASS'}]}));assert.throws(()=>cleanAxeSettings({rewards:[{key:'H_BODY',quantity:2}]}));
 await save(f,{rewards:[{key,quantity:5}],rates:{[key]:100}});const body=await f.body();await f.pg.query("UPDATE inventory_items SET is_active=0 WHERE code='VEHICLE_PART_ENGINE'");
 await assert.rejects(f.draw(body),e=>e.code==='REWARD_UNAVAILABLE');await assert.rejects(save(f,{}),e=>e.code==='REWARD_UNAVAILABLE');assert.equal((await f.state()).axes,10);
 const before=await goldenAxeAdmin(f.env,{id:99});f.fault('INSERT INTO admin_logs');await assert.rejects(save(f,{rewards:[{key:'COIN_500'}],rates:{COIN_500:100}}));f.fault(null);assert.equal((await goldenAxeAdmin(f.env,{id:99})).revision,before.revision);
 await save(f,{rewards:[{key:'COIN_500'}],rates:{COIN_500:100}});assert.equal((await f.draw(await f.body())).reward.key,'COIN_500');
});
