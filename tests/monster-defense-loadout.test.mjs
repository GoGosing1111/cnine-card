import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
import {DEFENSE_PROFILES} from '../shared/monster-defense-loadout-v1.mjs';
const id=()=>crypto.randomUUID();
test('defense roster: actual ownership, eligible mercenaries, duplicate protection and server-owned combat identity',async()=>{
 const h=await monsterDefenseFixture();
 try{
  assert.equal((await h.api(0,'defense/options')).status,401);assert.equal((await h.api(4,'defense/options')).status,403);
  const options=await h.api(1,'defense/options');assert.equal(options.status,200);assert.ok(options.mercenaries.length>4);assert.ok(options.cards.length>3);assert.equal(options.statMode,'DEFENSE_ROLE');
  assert.ok(options.cards.every(c=>c.code==='CARD:'+c.cardId));assert.ok(options.mercenaries.every(c=>c.sourceArt&&c.battleSprite&&DEFENSE_PROFILES[c.role]));
  const loadout=defenseOwnedLoadout(),create=value=>h.api(1,'defense/create',{capacity:2,practice:true,difficulty:'NORMAL',loadout:value,requestId:id()});
  assert.equal((await create({...loadout,mercenaries:['V-004','V-004']})).status,400);
  assert.equal((await create({...loadout,mercenaries:['V-004','V-999']})).status,403);
  assert.equal((await create({...loadout,card:'FAKER'})).status,403);
  await h.db.batch([{sql:'UPDATE user_cards SET quantity=0 WHERE user_id=1 AND card_id=?',args:[loadout.card.slice(5)]}]);
  assert.ok(!(await h.api(1,'defense/options')).cards.some(c=>c.code===loadout.card));assert.equal((await create(loadout)).status,403);
  await h.db.batch([{sql:'UPDATE user_cards SET quantity=1 WHERE user_id=1 AND card_id=?',args:[loadout.card.slice(5)]}]);
  const a=await create({...loadout,roster:[{attack:999999999}],attack:999999999});assert.equal(a.status,200,JSON.stringify(a));
  assert.deepEqual(a.snapshot.players[0].loadout,loadout);assert.equal(a.snapshot.players[0].roster.length,3);
  assert.equal((await h.live(a,'command',{requestId:id(),command:{type:'READY',ready:true,loadout:{mercenaries:['V-003','V-002'],card:'FAKER'}}})).status,403);
  assert.equal((await h.ready(a)).status,200);assert.equal((await h.live(a,'command',{requestId:id(),command:{type:'START'}})).status,200);
  const current=await h.live(a,'state'),units=current.units.filter(u=>u.ownerId==='1');assert.deepEqual(units.map(u=>u.code),[...loadout.mercenaries,loadout.card]);
  for(const unit of units){assert.equal(unit.maxHp,DEFENSE_PROFILES[unit.role].hp);assert.equal(unit.attack,DEFENSE_PROFILES[unit.role].attack);assert.equal(unit.name,a.snapshot.players[0].roster.find(c=>c.code===unit.code).name);}
  const forbidden=await h.api(1,'defense/select',{roomId:a.roomId,loadout,loadoutRevision:1,requestId:id()});assert.equal(forbidden.status,409);
 }finally{await h.dispose();}
});
test('defense formation: select clears readiness, stable retries, stale revisions, account separation and reconnect',async()=>{
 const h=await monsterDefenseFixture();
 try{
  const loadout=defenseOwnedLoadout(),a=await h.api(1,'defense/create',{capacity:2,difficulty:'NORMAL',loadout,requestId:id()});
  const b=await h.api(2,'defense/join',{roomId:a.roomId,loadout,requestId:id()});assert.equal(b.status,200);assert.equal((await h.ready(a)).status,200);
  const options=await h.api(1,'defense/options'),next={mercenaries:['V-049','V-051'],card:options.cards.find(c=>c.rank==='ZENITH').code};
  const payload={roomId:a.roomId,loadout:next,loadoutRevision:1,requestId:id()},saved=await h.api(1,'defense/select',payload);assert.equal(saved.status,200,JSON.stringify(saved));
  assert.equal(saved.snapshot.players[0].ready,false);assert.equal(saved.snapshot.players[0].loadoutRevision,2);assert.deepEqual(saved.snapshot.players[1].loadout,loadout);
  assert.equal((await h.api(1,'defense/select',payload)).duplicate,true);
  assert.equal((await h.api(1,'defense/select',{...payload,loadout})).status,409);
  assert.equal((await h.api(1,'defense/select',{...payload,requestId:id()})).status,409);
  assert.equal((await h.api(3,'defense/select',{...payload,requestId:id()})).status,409);
  const restored=await h.api(1,'defense/session',{roomId:a.roomId});assert.deepEqual(restored.snapshot.players[0].loadout,next);assert.equal(restored.snapshot.players[0].roster[0].code,'V-049');
  await h.db.batch([{sql:'UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=1 AND mercenary_code=?',args:['V-049']}]);
  assert.equal((await h.ready(a)).status,403,'ready rechecks ownership');assert.equal((await h.live(a,'state')).players[0].ready,false);
  await h.db.batch([{sql:'UPDATE user_mercenary_cards_v1 SET total_copies=1 WHERE user_id=1 AND mercenary_code=?',args:['V-049']}]);
  assert.equal((await h.ready(a)).status,200);assert.equal((await h.ready(b)).status,200);assert.equal((await h.live(a,'command',{requestId:id(),command:{type:'START'}})).status,200);
  assert.equal((await h.live(a,'state')).units.length,6);
 }finally{await h.dispose();}
});
