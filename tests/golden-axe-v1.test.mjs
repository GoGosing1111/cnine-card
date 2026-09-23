import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {ensureGoldenAxe,goldenAxeAdmin,drawGoldenAxe,useGoldenAxeItem,goldenAxeItemOptions,handleGoldenAxe} from '../functions/_golden_axe.js';
import {OLD_AXE,SUPERSTAR_13,PARTS_CHOICE} from '../js/golden-axe-model-v1.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('retired axe has no public menu or CMS, cannot be re-enabled, and schema cannot recreate old axes',async()=>{
 const f=await fixture();try{
  assert.equal(await f.row('SELECT code FROM inventory_items WHERE code=$1',[OLD_AXE]),undefined);
  await assert.rejects(goldenAxeAdmin(f.env,{id:99},{enabled:true}),e=>e.code==='EVENT_RETIRED');
  await assert.rejects(drawGoldenAxe(f.env,1,{requestId:crypto.randomUUID()}),e=>e.code==='EVENT_RETIRED');
  assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',[OLD_AXE])).quantity),10);
  const r=await handleGoldenAxe({path:'events/golden-axe/feature',request:new Request('https://game.test/api/events/golden-axe/feature'),env:{},deps:{json:Response.json}});const data=await r.json();assert.equal(data.visible,false);assert.equal(data.phase,'RETIRED');
  assert(!read('admin/index.html').includes('golden-axe-v1.js'));assert(!read('js/soopketmon-v21-exact-shell-adapter.js').includes('goldenAxe:'));assert(read('events/golden-axe/entry.js').includes("location.replace('/events/chuseok/'"));
 }finally{await f.close();}
});
test('historical draw receipt replays after retirement without a second debit or reward',async()=>{
 const f=await fixture();try{const requestId=crypto.randomUUID(),result={requestId,userId:1,operation:'DRAW',kind:'COIN',reward:{name:'과거 지급 상품'},axes:9};await f.pg.query("INSERT INTO golden_axe_receipts_v1(request_id,user_id,operation,target,result_json) VALUES($1,1,'DRAW','',$2)",[requestId,JSON.stringify(result)]);assert((await drawGoldenAxe(f.env,1,{requestId})).replayed);await assert.rejects(drawGoldenAxe(f.env,2,{requestId}),e=>e.code==='REQUEST_CONFLICT');assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),0);}finally{await f.close();}
});
test('earned parts voucher remains usable, grants 150 parts once, and preserves the former event ledger',async()=>{
 const f=await fixture();try{await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,1,1)',[PARTS_CHOICE]);const b={requestId:crypto.randomUUID(),itemCode:PARTS_CHOICE,target:'VEHICLE_PART_FRAME'};assert.equal((await f.use(b)).reward.quantity,150);assert((await f.use(b)).replayed);assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='VEHICLE_PART_FRAME'")).quantity),150);await assert.rejects(f.use({...b,requestId:crypto.randomUUID()}));}finally{await f.close();}
});
test('earned Superstar +13 voucher preserves quantity, forbids invalid targets, and works after retirement',async()=>{
 const f=await fixture();try{await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,1,1)',[SUPERSTAR_13]);const options=await goldenAxeItemOptions(f.env,1,SUPERSTAR_13);assert.deepEqual(options.choices.map(c=>c.code),['ss']);for(const target of ['fur','max','unowned'])await assert.rejects(f.use({requestId:crypto.randomUUID(),itemCode:SUPERSTAR_13,target}),e=>e.code==='INVALID_TARGET');const b={requestId:crypto.randomUUID(),itemCode:SUPERSTAR_13,target:'ss'};assert.equal((await f.use(b)).reward.level,13);assert((await f.use(b)).replayed);const card=await f.row("SELECT * FROM user_cards WHERE user_id=1 AND card_id='ss'");assert.equal(card.breakthrough_level,13);assert.equal(Number(card.quantity),3);assert.equal(card.breakthrough_fail_count,0);}finally{await f.close();}
});
test('voucher failures and banned users do not spend or grant; origin/auth/permission guards remain',async()=>{
 const f=await fixture();try{await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,1,1)',[PARTS_CHOICE]);const b={requestId:crypto.randomUUID(),itemCode:PARTS_CHOICE,target:'VEHICLE_PART_FRAME'};f.fault('INSERT INTO golden_axe_receipts_v1');await assert.rejects(f.use(b));f.fault(null);assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',[PARTS_CHOICE])).quantity),1);await f.pg.exec("UPDATE users SET banned_until='2999-01-01 00:00:00' WHERE id=1");await assert.rejects(f.use(b),e=>e.code==='USER_INACTIVE');
 const deps={json:(v,s=200)=>Response.json(v,{status:s}),authenticate:async()=>null,requirePermission:async()=>null};assert.equal((await handleGoldenAxe({path:'events/golden-axe/use-item',request:new Request('https://game.test/api/events/golden-axe/use-item'),env:{},deps})).status,401);assert.equal((await handleGoldenAxe({path:'events/golden-axe/use-item',request:new Request('https://game.test/api/events/golden-axe/use-item',{method:'POST',headers:{origin:'https://evil.test'}}),env:{},deps:{...deps,authenticate:async()=>({id:1})}})).status,403);
 }finally{await f.close();}
});
