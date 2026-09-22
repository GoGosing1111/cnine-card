import test from 'node:test';
import assert from 'node:assert/strict';
import { magicFixture } from './helpers/magic-presets-fixture.mjs';
import { readPvpMagicPresets, savePvpDeckWithMagic, normalizeMagicSlots, magicPresetNo, ensurePvpMagicPresets } from '../functions/_magic_presets.js';
import { magicBattleLoadout } from '../functions/_magic.js';

for (const postgres of [false, true, 'pipeline']) test(`${postgres === 'pipeline' ? 'PostgreSQL pipelined batch' : postgres ? 'PostgreSQL compatibility' : 'SQLite'}: presets, battle, legacy clients and atomic failure`, async t => {
  const f = await magicFixture(postgres); t.after(() => f.close());
  const { env, p } = f;
  assert.deepEqual((await readPvpMagicPresets(env, 1)).magicPresets, { 1: [1,0,2,0,0], 2: [1,0,2,0,0], 3: [1,0,2,0,0] });
  assert.deepEqual((await readPvpMagicPresets(env, 2)).magicPresets, { 1: [0,0,0,0,0], 2: [0,0,0,0,0], 3: [0,0,0,0,0] });
  const next = [4,0,0,3,0];
  await savePvpDeckWithMagic(env, 1, 2, f.cardIds, next);
  let state = await readPvpMagicPresets(env, 1);
  assert.equal(state.activePreset, 2); assert.deepEqual(state.magicPresets[1], [1,0,2,0,0]); assert.deepEqual(state.magicPresets[2], next);
  assert.equal((await p("SELECT magic_card_id FROM magic_card_loadouts WHERE user_id=1 AND deck_type='PVE' AND slot_no=2").first()).magic_card_id, 3);
  const user = await f.user();
  assert.deepEqual((await magicBattleLoadout(env,user,'PVP')).cards.map(c=>[c.id,c.slotNo]), [[4,1],[3,4]]);
  assert.deepEqual((await magicBattleLoadout(env,user,'PVP',{presetNo:1})).cards.map(c=>[c.id,c.slotNo]), [[1,1],[2,3]]);
  // Saving inactive magic does not activate or leak into the current attack deck.
  assert.equal((await f.call('magic/loadout',{deckType:'PVP',presetNo:3,magicCardIds:[0,5,0,0,0]})).status,200);
  assert.equal((await readPvpMagicPresets(env,1)).activePreset,2);
  assert.deepEqual((await magicBattleLoadout(env,user,'PVP')).cards.map(c=>c.id),[4,3]);
  // Legacy deck saves omit magic and must load that preset's saved selection, not erase it.
  await savePvpDeckWithMagic(env,1,3,f.cardIds,undefined);
  assert.deepEqual((await magicBattleLoadout(env,user,'PVP')).cards.map(c=>c.id),[5]);
  assert.equal((await f.call('magic/equip',{deckType:'PVP',slotNo:4,magicCardId:6})).status,200);
  assert.deepEqual((await readPvpMagicPresets(env,1)).magicPresets[3],[0,5,0,6,0]);
  // Explicit empty is different from absent; repeat saves are idempotent.
  for(let i=0;i<2;i++)await savePvpDeckWithMagic(env,1,2,f.cardIds,[0,0,0,0,0]);
  assert.deepEqual((await magicBattleLoadout(env,user,'PVP')).cards,[]);
  const before=await readPvpMagicPresets(env,1);
  for(const bad of [[1,1,0,0,0],[11,0,0,0,0],[13,0,0,0,0],[999,0,0,0,0],[],[-1,0,0,0,0],['1',0,0,0,0]]){
    await assert.rejects(()=>savePvpDeckWithMagic(env,1,1,f.cardIds,bad));
    assert.deepEqual(await readPvpMagicPresets(env,1),before);
  }
  for(const no of [0,4,1.5])assert.equal((await f.call('magic/loadout',{deckType:'PVP',presetNo:no,magicCardIds:[0,0,0,0,0]})).status,400);
  for(const slotNo of [0,6,1.5])assert.equal((await f.call('magic/equip',{deckType:'PVE',slotNo,magicCardId:1})).status,400);
  // Failure after normal deck/active preset writes rolls every write back.
  f.fail('INSERT INTO magic_card_loadouts');
  await assert.rejects(()=>savePvpDeckWithMagic(env,1,1,['a','b','c','d','e'],[7,0,0,0,0]),/INJECTED/);
  f.fail(''); assert.deepEqual(await readPvpMagicPresets(env,1),before);
  if(postgres){
    // Real SQL error after earlier writes, also inside the production pipeline.
    await env.DB.execSchema('ALTER TABLE magic_card_loadouts ADD CONSTRAINT qa_magic_rollback CHECK(magic_card_id<>7)');
    await assert.rejects(()=>savePvpDeckWithMagic(env,1,1,['a','b','c','d','e'],[7,0,0,0,0]),/qa_magic_rollback/);
    assert.deepEqual(await readPvpMagicPresets(env,1),before);
    await env.DB.execSchema('ALTER TABLE magic_card_loadouts DROP CONSTRAINT qa_magic_rollback');
  }
  assert.deepEqual(JSON.parse((await p('SELECT card_ids FROM pvp_decks WHERE user_id=1').first()).card_ids),f.cardIds);
  assert.deepEqual(JSON.parse((await p('SELECT card_ids FROM pvp_deck_presets WHERE user_id=1 AND preset_no=1').first()).card_ids),f.cardIds);
  await p('UPDATE user_magic_cards SET quantity=0 WHERE user_id=1 AND magic_card_id=2').run();
  assert.deepEqual((await magicBattleLoadout(env,user,'PVP',{presetNo:1})).cards.map(c=>c.id),[1]);
  await p("UPDATE user_magic_cards SET quantity=0 WHERE user_id=1 AND magic_card_id=3").run();
  assert.deepEqual((await magicBattleLoadout(env,user,'PVE')).cards,[],'stale legacy slots cannot apply unowned magic');
  const status=await (await f.call('magic/status')).json();assert.deepEqual(status.pvp.magicPresets,before.magicPresets);
  const ddlBefore=f.queries.filter(q=>q.startsWith('CREATE TABLE')).length;await ensurePvpMagicPresets(env);
  assert.equal(f.queries.filter(q=>q.startsWith('CREATE TABLE')).length,ddlBefore,'completed scoped schema cache avoids repeated DDL');
  if(postgres==='pipeline')assert.ok(f.queries.some(q=>q.includes('BEGIN')&&q.includes('INSERT INTO pvp_magic_presets')&&q.includes('COMMIT')),'production one-message transaction path exercised');
});
test('strict shape validation and empty slots',()=>{
  assert.deepEqual(normalizeMagicSlots([null,0,1,2,3]),[0,0,1,2,3]);
  for(const bad of [null,{},[1,2,3,4,5,6],[NaN,0,0,0,0]])assert.throws(()=>normalizeMagicSlots(bad));
  assert.equal(magicPresetNo(3),3);assert.throws(()=>magicPresetNo('invalid'));
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: existing enhancement and summon API remain receipt-safe`,async t=>{
  const f=await magicFixture(postgres);t.after(()=>f.close());
  const enhanced=await (await f.call('magic/enhance',{requestId:'magic-enhance-qa',magicCardId:1})).json();
  assert.equal(enhanced.success,true);assert.equal(enhanced.afterLevel,1);assert.equal(enhanced.quantityAfter,4);assert.equal(enhanced.cardShards,4900);
  const again=await (await f.call('magic/enhance',{requestId:'magic-enhance-qa',magicCardId:1})).json();assert.equal(again.quantityAfter,4);
  for(const count of [1,10]){
    const response=await f.call('magic/draw',{requestId:`draw-${count}`,count});assert.equal(response.status,200);
    const drawn=await response.json();assert.equal(drawn.results.length,count);assert.equal(drawn.totalCoinCost,count*1000);assert.equal(drawn.totalCost,count*100);
    const before=await f.user(),repeat=await (await f.call('magic/draw',{requestId:`draw-${count}`,count})).json();
    assert.deepEqual(repeat,drawn);assert.deepEqual(await f.user(),before);
  }
  const unauth=await f.call('magic/loadout',{deckType:'PVE',magicCardIds:[0,0,0,0,0]},{authenticate:async()=>null,json:(body,status)=>Response.json(body,{status})});assert.equal(unauth.status,401);
});
