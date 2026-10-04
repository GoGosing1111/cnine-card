import test from 'node:test';
import assert from 'node:assert/strict';
import {polishFixture} from './helpers/equipment-polish-db.mjs';
import {POLISH_KEY,polishDefaults,validatePolishSettings,polishRates,polishPreviewResult} from '../shared/equipment-polish-v1.mjs';
import {readPolishSettings,savePolishSettings} from '../functions/_equipment_polish.js';

test('policy rejects invalid currencies, unreachable caps and activation; capped weights redistribute',()=>{
  const policy=polishDefaults();assert.equal(policy.publicVisible,false);
  for(const change of [
    p=>p.executionMode='ON',p=>p.costs[0].stones=0,p=>p.costs[0].coins=-1,
    p=>p.costs[0].masterStars=Infinity,p=>p.options.forEach(o=>o.enabled=false),
    p=>p.options[0].weight=0,p=>p.options[0].increment=.001,p=>p.costs.pop()
  ]){const p=structuredClone(policy);change(p);assert.throws(()=>validatePolishSettings(p));}
  const levels=[10,0,0,0,0];assert.deepEqual(polishRates(policy,levels),[0,25,25,25,25]);
  assert.equal(polishPreviewResult(policy,levels,0).selected,1);
  assert.equal(polishPreviewResult(policy,levels,.99999999).selected,4);
  assert.throws(()=>polishPreviewResult(policy,[10,10,0,0,0],.5));
});

for(const postgres of [false,true])test('polish CMS atomic settings/material, OFF guards and no-charge review: '+(postgres?'Postgres':'SQLite'),async t=>{
  const f=await polishFixture(t,{postgres});
  let response=await f.call('status',{role:null});assert.equal(response.status,200);assert.equal(response.body.canEnter,false);
  for(const role of [null,'USER','ADMIN']){
    assert.notEqual((await f.call('',{admin:true,role})).status,200);
    for(const action of ['state','preview','execute'])assert.ok([401,403].includes((await f.call(action,{role,method:action==='state'?'GET':'POST',body:{}})).status));
  }
  assert.equal((await f.p('SELECT code FROM inventory_items').first()).code,'EQUIPMENT_POLISH_STONE');
  assert.equal(Number((await f.p('SELECT COUNT(*) AS count FROM admin_logs').first()).count),0);
  response=await f.call('',{admin:true});assert.equal(response.status,200);assert.equal(response.body.settings.publicVisible,false);
  const snapshot=async()=>JSON.stringify({
    wallets:(await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results,
    users:(await f.p('SELECT * FROM users ORDER BY id').all()).results,
    gear:(await f.p('SELECT * FROM equipment_forge_states_v1 ORDER BY instance_id').all()).results
  });
  const untouched=await snapshot(),settings=response.body.settings;
  settings.options[0].weight=500;settings.costs[0]={attempt:1,coins:3456,masterStars:12,stones:3};
  settings.material.name='고급 연마석';settings.material.description='저장 검증';settings.material.active=false;
  let saved=await f.call('',{admin:true,method:'PATCH',body:{expectedRevision:0,settings}});
  assert.equal(saved.status,200);assert.equal(saved.body.settings.revision,1);assert.equal(saved.body.material.name,'고급 연마석');
  assert.equal(Number(saved.body.material.is_active),0);assert.equal(saved.body.settings.costs[0].masterStars,12);
  assert.equal((await f.call('',{admin:true})).body.settings.options[0].weight,500);
  assert.equal((await f.call('',{admin:true,method:'PATCH',body:{expectedRevision:0,settings}})).status,409);
  settings.revision=1;settings.material.name='실패할 변경';
  f.fail('INSERT INTO admin_logs');
  assert.equal((await f.call('',{admin:true,method:'PATCH',body:{expectedRevision:1,settings}})).status,503);
  f.fail('');
  response=await f.call('',{admin:true});assert.equal(response.body.settings.revision,1);assert.equal(response.body.material.name,'고급 연마석');
  assert.equal(Number((await f.p('SELECT COUNT(*) AS count FROM admin_logs').first()).count),1);
  assert.equal(Number((await f.p('SELECT COUNT(*) AS count FROM joint_atomic_guards_v1').first()).count),0);
  assert.equal((await f.call('',{admin:true,method:'PATCH',origin:'https://foreign.example',body:{expectedRevision:1,settings}})).status,403);
  response=await f.call('state');assert.equal(response.status,200);assert.deepEqual(new Set(response.body.items.map(x=>x.instanceId)),new Set(['71','72']));
  assert.equal(response.body.items[0].enhancement.level,3);assert.deepEqual(response.body.wallet,{coins:'1000000',masterStars:'1500',stones:'20'});
  assert.equal((await f.call('state?beforeId=81')).body.items.length,0);
  assert.equal((await f.call('state?beforeId=invalid')).status,400);
  response=await f.call('preview',{method:'POST',body:{instanceId:'71',levels:[0,0,0,0,0],revision:1}});
  assert.equal(response.status,200);assert.equal(response.body.previewOnly,true);assert.equal(response.body.total,1);
  assert.equal((await f.call('preview',{method:'POST',body:{instanceId:'81',levels:[0,0,0,0,0],revision:1}})).status,404);
  assert.equal((await f.call('preview',{method:'POST',body:{instanceId:'71',levels:[0,0,0,0,0],revision:0}})).status,409);
  for(const action of ['quote','execute','receipt'])assert.equal((await f.call(action,{method:'POST',body:{}})).status,423);
  assert.equal(await snapshot(),untouched);
  settings.revision=1;settings.publicVisible=true;
  const on=await savePolishSettings(f.env,{id:7},{expectedRevision:1,settings});
  assert.equal(on.settings.executionMode,'OFF');
  assert.equal((await f.call('state',{role:'USER'})).body.items[0].instanceId,'81');
  assert.equal((await f.call('preview',{role:'USER',method:'POST',body:{}})).status,403);
  assert.equal((await f.call('execute',{role:'USER',method:'POST',body:{}})).status,423);
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...on.settings,executionMode:'ON'}),POLISH_KEY).run();
  assert.equal((await readPolishSettings(f.env)).invalid,true);
  assert.equal((await f.call('status')).body.canEnter,false);
  assert.equal((await f.call('state')).status,403);
  assert.equal(await snapshot(),untouched);
});
