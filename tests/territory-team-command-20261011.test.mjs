import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {__territoryClanTest as T} from '../functions/_territory_war.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: commander messages stay inside the recipient team across shared cache, polling, sending and CMS`,async t=>{
  const f=await territoryNetworkFixture(t,postgres,{participants:4});await f.form();
  const a=await f.p("SELECT user_id FROM territory_war_v3_users WHERE side='A' ORDER BY user_id LIMIT 1").first();
  const b=await f.p("SELECT user_id FROM territory_war_v3_users WHERE side='B' ORDER BY user_id LIMIT 1").first();
  for(const [side,userId,message] of [['A',a.user_id,'A_ONLY_NORTH_ORDER'],['B',b.user_id,'B_ONLY_SOUTH_ORDER']]){
    await f.p('INSERT INTO territory_war_v3_commander_overrides(round_id,side,user_id,assigned_by) VALUES(1,?,?,1)',side,userId).run();
    await f.p("INSERT INTO territory_war_v3_command_messages(round_id,user_id,side,message,created_at) VALUES(1,?,?,?,'2026-01-01 00:00:00')",userId,side,message).run();
  }
  const round=await f.round();
  const read=(id,admin=false)=>T.publicState(f.env,Number(id),admin,4,round);
  const own=await read(a.user_id);
  assert.deepEqual(own.commandMessages.map(m=>m.message),['A_ONLY_NORTH_ORDER']);
  assert.ok(!JSON.stringify(own).includes('B_ONLY_SOUTH_ORDER'));
  const enemy=await read(b.user_id);
  assert.deepEqual(enemy.commandMessages.map(m=>m.message),['B_ONLY_SOUTH_ORDER']);
  assert.ok(!JSON.stringify(enemy).includes('A_ONLY_NORTH_ORDER'));
  assert.deepEqual((await read(999,true)).commandMessages,[],'nonparticipant CMS does not bypass team visibility');
  assert.deepEqual((await read(a.user_id,true)).commandMessages.map(m=>m.side),['A']);
  const pulse=await T.realtimeState(f.env,Number(b.user_id),2);
  assert.deepEqual(pulse.commandMessages.map(m=>m.side),['B']);
  const deps={json:(body,status=200)=>({body,status})};
  const sent=await T.sendCommanderMessage(f.env,deps,{id:Number(a.user_id)},f.cfg,{message:'A_NEW_PRIVATE_ORDER',nodeIndex:4});
  assert.equal(sent.status,200);
  assert.ok(sent.body.state.commandMessages.some(m=>m.message==='A_NEW_PRIVATE_ORDER'));
  assert.ok(sent.body.state.commandMessages.every(m=>m.side==='A'));
  assert.ok(!JSON.stringify(await read(b.user_id)).includes('A_NEW_PRIVATE_ORDER'));
  await f.p("UPDATE territory_war_v3_users SET side='B' WHERE user_id=?",a.user_id).run();
  assert.ok((await read(a.user_id)).commandMessages.every(m=>m.side==='B'),'fresh membership overrides cached audience');
  await f.p("UPDATE territory_war_v3_users SET status='WAITING' WHERE user_id=?",a.user_id).run();
  assert.deepEqual((await read(a.user_id)).commandMessages,[],'inactive roster cannot read the channel');
});
