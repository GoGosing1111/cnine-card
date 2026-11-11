import test from 'node:test';
import assert from 'node:assert/strict';
import {choiceFixture} from './helpers/inventory-choice-fixture.mjs';
import {EMPEROR_BOX as box,LEVEL_TICKET as ticket} from '../functions/_inventory_choice.js';
import {readMercenaryLevelState} from '../functions/_mercenary_level_policy.js';
import {EQUIPMENT_SET_PARTS} from '../shared/equipment-set-visual-v1.mjs';

for(const postgres of [false,true])test('inventory choice transactions and recovery · '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const f=await choiceFixture(t,postgres),{p,call,qty}=f;
  const request=(targetCode,extra={})=>({requestId:crypto.randomUUID(),targetCode,...extra});
  const owned=(await p('SELECT * FROM user_mercenary_cards_v1 ORDER BY mercenary_code').all()).results;
  const coins=await f.coin();
  const inventoryLogs=async(item)=>Number((await p('SELECT COUNT(*) AS n FROM inventory_logs WHERE user_id=7 AND item_code=?',item.code).first()).n);
  const snapshot=async()=>(await p('SELECT i.code,s.level,x.source_type,x.request_id FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id WHERE x.user_id=7 ORDER BY x.id').all()).results;
  const list=await call(box,'options');
  assert.equal(list.status,200);assert.match(list.cache,/private, no-store/);
  assert.deepEqual(list.body.choices.map(c=>c.code),Object.values(EQUIPMENT_SET_PARTS.EMPEROR));assert.equal(await qty(box),4);
  await p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,request_id) VALUES(7,43,'EXISTING','old-emperor')").run();
  assert.equal((await call(box,'use',request('V-001'))).status,400);
  const use=request('EMPEROR_TOP');f.fail('INSERT INTO equipment_forge_states_v1');
  const failed=await call(box,'use',use);assert.equal(failed.status,503,JSON.stringify(failed));
  assert.equal(await qty(box),4);assert.equal((await snapshot()).length,1);assert.equal(await inventoryLogs(box),0);f.fail('');
  assert.equal((await call(box,'options')).body.pendingRequestId,use.requestId);
  assert.equal((await call(box,'receipt',null,{receiptId:use.requestId})).body.input.targetCode,'EMPEROR_TOP');
  const both=await Promise.all([call(box,'use',use),call(box,'use',use)]);
  for(const r of both)assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(both.map(r=>r.body.replayed),[false,true]);assert.equal(await qty(box),3);
  assert.equal((await call(box,'use',{...use,targetCode:'EMPEROR_SHOES'})).status,409);
  for(const code of Object.values(EQUIPMENT_SET_PARTS.EMPEROR).slice(1))assert.equal((await call(box,'use',request(code))).status,200);
  assert.equal((await call(box,'use',request('EMPEROR_TOP'))).status,409);assert.equal(await qty(box),0);
  const gear=await snapshot();assert.equal(gear.length,5);assert.equal(gear[0].level,null);
  assert.deepEqual(gear.slice(1).map(r=>[r.code,Number(r.level)]),Object.values(EQUIPMENT_SET_PARTS.EMPEROR).map(code=>[code,15]));
  assert.equal(await inventoryLogs(box),4);assert.equal((await call(box,'receipt',null,{userId:8,receiptId:use.requestId})).status,404);
  await p('INSERT INTO app_meta(key,value) VALUES(?,?)','comeback26:loan:7','2099-11-11').run();
  const roster=(await call(ticket,'options')).body.choices;assert.equal(roster.length,5);
  assert.equal(roster.find(c=>c.code==='V-999').complete,true);
  for(const code of ['V-999','V-058','V-977','V-002'])assert.equal((await call(ticket,'use',request(code,{revision:code==='V-999'?1:0}))).status,409);
  assert.equal(await qty(ticket),4);
  assert.equal((await call(ticket,'use',request('V-049',{revision:0}))).status,409);
  assert.equal((await call(ticket,'use',request('V-001',{revision:0,level:21}))).status,400);
  assert.equal((await call(ticket,'options',null,{userId:null})).status,401);
  assert.equal((await call(ticket,'use',request('V-001',{revision:0}),{origin:'https://other.test'})).status,403);
  const promote=request('V-001',{revision:0});f.fail('INSERT INTO user_mercenary_levels_v1');
  assert.equal((await call(ticket,'use',promote)).status,503);assert.equal(await qty(ticket),4);assert.equal((await readMercenaryLevelState(f.env,7,'V-001')).level,1);f.fail('');
  const result=await call(ticket,'use',promote);assert.equal(result.status,200,JSON.stringify(result));
  assert.equal((await call(ticket,'use',promote)).body.replayed,true);
  assert.equal((await call(ticket,'receipt',null,{receiptId:promote.requestId})).body.reward.level,21);
  for(const code of ['V-049','V-055','V-996'])assert.equal((await call(ticket,'use',request(code,{revision:1}))).status,200);
  for(const c of roster){
    const state=await readMercenaryLevelState(f.env,7,c.code);
    assert.deepEqual([state.level,state.breakthroughMask,state.experience],[21,15,0]);
    assert.equal(state.revision,c.complete?c.revision:c.revision+1);
  }
  assert.equal(await qty(ticket),0);assert.equal(await inventoryLogs(ticket),4);assert.equal(await f.coin(),coins);
  assert.deepEqual((await p('SELECT * FROM user_mercenary_cards_v1 ORDER BY mercenary_code').all()).results,owned);
});

test('a changed mercenary or withdrawn equipment cancels a prepared use and releases the ticket',async t=>{
  const f=await choiceFixture(t),{p,call,qty}=f;
  for(const [item,body,withdraw] of [
    [ticket,{targetCode:'V-049',revision:1},"DELETE FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-049'"],
    [box,{targetCode:'EMPEROR_TOP'},"UPDATE character_equipment_items SET is_active=0 WHERE code='EMPEROR_TOP'"]
  ]){
    const req={...body,requestId:crypto.randomUUID()};f.fail('INSERT INTO inventory_logs');
    assert.equal((await call(item,'use',req)).status,503);f.fail('');
    await p(withdraw).run();
    assert.equal((await call(item,'use',req)).status,409);
    assert.equal((await call(item,'receipt',null,{receiptId:req.requestId})).body.code,'JOINT_OPERATION_SUPERSEDED');
    assert.equal((await call(item,'options')).body.pendingRequestId,null);assert.equal(await qty(item),4);
  }
  await p('UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=7 AND item_code=?',box.code).run();
  const results=await Promise.all(['EMPEROR_BOTTOM','EMPEROR_SHOES'].map(targetCode=>call(box,'use',{requestId:crypto.randomUUID(),targetCode})));
  assert.deepEqual(results.map(r=>r.status),[200,409]);assert.equal(await qty(box),0);
  assert.equal(Number((await p("SELECT COUNT(*) AS n FROM user_equipment_instances WHERE source_type='CHOICE_BOX'").first()).n),1);
});
