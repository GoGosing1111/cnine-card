import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {sxCraftFixture} from './helpers/sx-suit-craft-fixture.mjs';
import {MODELS,MODEL_ORDER} from '../preview/workshop-assembly-v1/source/models.mjs';
import {liveAssemblyReceipt} from '../preview/workshop-assembly-v1/source/live-contract.mjs';
const COST=300000000000000;
for(const [roll,success]of [[0.099999,true],[0.1,false]])test(`SX 10% boundary ${roll}: exact 300T and ten core8, success=${success}; replay preserves result`,async t=>{
 const f=await sxCraftFixture();t.after(()=>f.close());let rolls=0;t.mock.method(Math,'random',()=>{rolls++;return roll;});
 const result=await f.craft('sx-once',{paymentType:success?'COIN':'MASTER_STAR'});
 assert.equal(result.success,success);assert.equal(result.coinSpent,COST);assert.equal(result.masterStarSpent,0);
 assert.equal(result.state.wallet.coin,COST);assert.equal(result.state.wallet.masterStars,500000);assert.equal(result.state.inventory.SUIT_CORE_8.quantity,20);
 assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances WHERE equipment_id=52')).n),success?1:0);
 assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_loadout')).n),0);
 const again=await f.craft('sx-once',{paymentType:'COIN'});assert(again.replayed);assert.equal(rolls,1);assert.equal(again.success,success);
 assert.equal(Number((await f.row('SELECT change_amount FROM coin_logs')).change_amount),-COST);assert.equal(Number((await f.row("SELECT change_amount FROM inventory_logs WHERE item_code='SUIT_CORE_8'")).change_amount),-10);
});
test('SX insufficient funds/material and a late log failure never partially charge or grant',async t=>{
 const f=await sxCraftFixture();t.after(()=>f.close());t.mock.method(Math,'random',()=>0);
 await f.pg.exec("UPDATE cnine_user_inventory SET quantity=9 WHERE item_code='SUIT_CORE_8'");await assert.rejects(f.craft('sx-short-core',{paymentType:'COIN'}),/재료가 부족/);
 await f.pg.exec("UPDATE cnine_user_inventory SET quantity=30 WHERE item_code='SUIT_CORE_8';UPDATE users SET coin=299999999999999");await assert.rejects(f.craft('sx-short-coin',{paymentType:'COIN'}),/코인이 부족/);
 await f.pg.exec('UPDATE users SET coin=600000000000000');f.failCoinLog();await assert.rejects(f.craft('sx-log-failure',{paymentType:'COIN'}),/QA coin log failure/);
 assert.equal(Number((await f.row('SELECT coin FROM users')).coin),COST*2);assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE item_code='SUIT_CORE_8'")).quantity),30);
 assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),0);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),0);
});
test('SX preserves a 10경+1 balance exactly and rejects a material race inside the atomic batch',async t=>{
 const f=await sxCraftFixture();t.after(()=>f.close());t.mock.method(Math,'random',()=>0);
 await f.pg.exec('UPDATE users SET coin=100000000000000001');await f.craft('sx-bigint',{paymentType:'COIN'});
 const expected=(100000000000000001n-BigInt(COST)).toString();assert.equal((await f.row('SELECT CAST(coin AS TEXT) n FROM users')).n,expected);
 assert.equal((await f.row('SELECT CAST(balance_after AS TEXT) n FROM coin_logs')).n,expected);
 f.beforeBatch(()=>f.pg.exec("UPDATE cnine_user_inventory SET quantity=0 WHERE item_code='SUIT_CORE_8'"));
 await assert.rejects(f.craft('sx-race',{paymentType:'COIN'}));assert.equal((await f.row('SELECT CAST(coin AS TEXT) n FROM users')).n,expected);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),1);
});
test('SX success and output-less failure resolve only the approved image and preserve the 300T receipt',()=>{
 for(const success of [true,false]){
  const recipe={id:777,category:'BATTLE_SUIT_CRAFT',output_type:'EQUIPMENT',output_ref:'52',output_name:'CMS 표시 이름',output_image:MODELS.sx.source};
  const data={ok:true,requestId:'sx-film',recipeId:777,category:recipe.category,success,coinSpent:COST,masterStarSpent:0,output:success?{type:'EQUIPMENT',ref:'52',name:'SX슈트',image:MODELS.sx.source}:null};
  const r=liveAssemblyReceipt(data,recipe);assert.equal(r.model,'sx');assert.equal(r.result.success,success);assert.equal(r.coinSpent,COST);assert.equal(r.masterStarSpent,0);
  recipe.output_image='/assets/wrong.png';recipe.output_name='SX슈트';assert.equal(liveAssemblyReceipt(data,recipe).model,null);
 }
 assert.equal(MODEL_ORDER.suit.at(-1),'sx');assert.equal(MODELS.sx.maskedParts.length,11);assert(!MODELS.sx.maskedParts.some(p=>['head','helmet'].includes(p.name)));
 const original=readFileSync(new URL('../'+MODELS.sx.source.slice(1),import.meta.url));assert.equal(createHash('sha256').update(original).digest('hex'),MODELS.sx.sha256);
});
