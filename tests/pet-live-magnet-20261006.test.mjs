import test from 'node:test';
import assert from 'node:assert/strict';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {attemptPetPotential} from '../functions/_pet_potential.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {COMPANION_REVIEW_CARDS} from '../functions/_companion_preparation.js';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

const attempt=(overrides={})=>({petCode:'PET-BONGSOON',requestId:crypto.randomUUID(),expectedRevision:0,settingsRevision:1,...overrides});
test('live equipment uses actual collection, keeps OWNER review separate, validates ownership and reuses the save receipt',async t=>{
  const f=await petLiveFixture(t),state=await f.call('pets/v1/state');assert.equal(state.status,200);assert.equal(state.body.available,true);assert.equal(state.body.reviewOnly,false);
  assert.equal(state.body.cards.length,1);assert.equal(state.body.cards[0].quantity,2);assert.equal(state.body.cards[0].reviewOwned,false);assert.deepEqual(state.body.cards[0].ready,['PVE','PVP']);
  assert.equal((await f.call('admin/pets/equipment/state')).status,401);
  const body={petCode:'PET-BONGSOON',expectedRevision:0,petCmsRevision:4,requestId:crypto.randomUUID()};
  assert.equal((await f.call('pets/v1/loadout',{body:{...body,petCode:'PET-DIIM'}})).status,403);
  assert.equal((await f.call('pets/v1/loadout',{body,origin:'https://other.test'})).status,403);
  assert.equal((await f.call('pets/v1/loadout',{body})).status,200);assert.equal((await f.call('pets/v1/loadout',{body})).body.replayed,true);
  assert.equal((await f.record('pet_loadout_v1:2')).petCode,'PET-BONGSOON');assert.equal(await f.record('pet_equipment_review_v1:2'),null);
  assert.equal((await f.record('pet_collection_v1:2')).pets['PET-BONGSOON'],2);assert.equal(await f.balance(),5);
  const snapshot=await loadPetBattleSnapshot(f.env,{id:2});assert.equal(snapshot.definition.buffs[0].percent,10);assert.equal(snapshot.magnet,false);assert.equal(snapshot.definition.battleSprite,f.pet.sourceArt);
  await f.write('pet_collection_v1:2',{revision:2,pets:{}});assert.equal(await loadPetBattleSnapshot(f.env,{id:2}),null);
});

test('actual PVE/PVP use one opening pet buff per side without adding a target, action slot or modifying unowned accounts',async t=>{
  const f=await petLiveFixture(t);await f.equip();const pet=await loadPetBattleSnapshot(f.env,{id:2}),cards=COMPANION_REVIEW_CARDS;
  const plain=createPveBattleV2({cards,monster:{id:1,battle_power:300000},seed:3}),buffed=createPveBattleV2({cards,pet,monster:{id:1,battle_power:300000},seed:3});
  const opening=buffed.result.timeline.find(e=>e.type==='PET_OPENING_BUFF'),hit=opening.hits[0];
  assert.equal(plain.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF').length,0);
  assert.equal(buffed.teams.A.cards.length,5);assert.equal(hit.after.attack,Math.round(hit.before.attack*1.1));assert.equal(buffed.teams.A.cards[0].attack,hit.after.attack);
  assert.equal(buffed.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF').length,1);assert(!buffed.result.final.A.some(c=>c.id.includes('PET:')));
  const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:pet,defenderPet:pet,seed:3});
  assert.equal(pvp.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF').length,2);assert.equal(pvp.teams.A.cards.length,5);assert.equal(pvp.teams.B.cards.length,5);
  assert(!pvp.result.timeline.some(e=>e.type==='TURN'&&e.actorId.includes('PET:')));
  const cms=await f.record('pet_cms_preparation_v1');cms.document.pets[0].liveEnabled=false;await f.write('pet_cms_preparation_v1',cms);assert.equal(await loadPetBattleSnapshot(f.env,2),null);
});

test('potential policy starts unspecified/OFF; only OWNER can configure odds, and failed attempts cost exactly one potion',async t=>{
  const f=await petLiveFixture(t),initial=await f.call('admin/pets/potential',{user:9});assert.equal(initial.body.settings.enabled,false);assert.equal(initial.body.settings.successPpm,null);
  assert.equal((await f.call('pets/v1/potential',{body:attempt({settingsRevision:0})})).status,423);assert.equal(await f.balance(),5);
  assert.equal((await f.call('admin/pets/potential',{method:'PATCH',body:{settings:{...initial.body.settings,enabled:true,successPpm:10000}}})).status,403);
  assert.equal((await f.settings(0)).status,200);const body=attempt();
  const first=await f.call('pets/v1/potential',{body});assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.success,false);assert.equal(await f.balance(),4);
  assert.equal((await f.call('pets/v1/potential',{body})).body.replayed,true);assert.equal(await f.balance(),4);
  assert.equal((await f.call('pets/v1/potential',{body:{...body,petCode:'PET-DIIM'}})).status,409);
  assert.equal((await f.call('pets/v1/potential',{body:attempt()})).status,409);assert.equal(await f.balance(),4);
});

test('success is permanent for the owned pet; repeated, concurrent, unauthorized and already-completed attempts cannot spend again',async t=>{
  const f=await petLiveFixture(t);await f.settings();await f.equip();const body=attempt();
  const results=await Promise.all([f.call('pets/v1/potential',{body}),f.call('pets/v1/potential',{body})]);
  assert(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(await f.balance(),4);
  assert.equal((await loadPetBattleSnapshot(f.env,2)).magnet,true);
  assert.equal((await f.call('pets/v1/potential',{body:attempt({expectedRevision:1})})).status,409);assert.equal(await f.balance(),4);
  assert.equal((await f.call('pets/v1/potential',{user:9,body:attempt()})).status,403);
  assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM inventory_logs')).rows[0].n),1);
});

test('potion debit, potential and durable receipt roll back together; a lost COMMIT reply replays instead of charging twice',async t=>{
  const f=await petLiveFixture(t);await f.settings(500000);const body=attempt();
  for(const pattern of ['INSERT INTO inventory_logs','INSERT INTO app_meta']){
    f.fail(pattern);await assert.rejects(attemptPetPotential(f.env,{id:2},body,{random:()=>499999}));f.fail('');
    assert.equal(await f.balance(),5);assert.equal(await f.record('pet_potentials_v1:2'),null);
  }
  f.loseCommit();const result=await attemptPetPotential(f.env,{id:2},body,{random:()=>500000});assert.equal(result.success,false);assert.equal(result.replayed,true);assert.equal(await f.balance(),4);
  const retry=await attemptPetPotential(f.env,{id:2},body,{random:()=>0});assert.equal(retry.success,false);assert.equal(await f.balance(),4);
});

function hunt(magnet=true){
  let now=1000;const state={id:crypto.randomUUID(),magnet,policy:{id:'normal',huntDurationMs:1000,dropChance:1,bossDropChance:1,dropLifeMs:1,items:[{code:'ITEM',name:'검수 아이템',image:'assets/item.png',weight:1,quantity:1,minQuantity:1,maxQuantity:1}]},timeLimit:2000,eventTimes:Array.from({length:25},(_,i)=>(i+1)*10),timeline:[...Array.from({length:24},(_,i)=>({seq:i+1,combatAtMs:(i+1)*10,huntKill:true})),{seq:25,combatAtMs:250,type:'RESULT',winner:'A'}],outcome:{winner:'A'}};
  let seed=19;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const session=restoreHuntSession(state,{now:()=>now,random});session.begin();now+=300;return {session,restore:()=>restoreHuntSession(session.exportState(),{now:()=>now,random})};
}
test('magnet absorbs a full 24-drop batch without click throttling; restore/manual retries/finish cannot duplicate drops',()=>{
  const f=hunt(),r=f.session.revealMany(Array.from({length:24},(_,i)=>i+1));assert.equal(r.autoClaims.length,24);assert.equal(r.picked,24);assert(r.drops.every(d=>d.state==='CLAIMED'));
  assert.equal(r.inventory[0].quantity,24);const d=r.drops[0];assert.equal(f.session.claim({dropId:d.id,token:d.token,...d.position}).automatic,true);
  const restored=f.restore(),replay=restored.revealMany([1,2]);assert.equal(replay.inventory[0].quantity,24);
  const final=restored.finish(25);assert.equal(final.inventory[0].quantity,24);assert.equal(final.missed,0);assert.equal(final.picked,24);assert.deepEqual(restored.finish(25),final);
});
test('magnet finish absorbs reached but unacknowledged kills; without magnet there is no automatic pickup',()=>{
  const automatic=hunt();const result=automatic.session.finish(25);assert.equal(result.inventory[0].quantity,24);assert.equal(result.picked,24);
  const manual=hunt(false),drop=manual.session.reveal(1);assert.equal(drop.drop.state,'GROUND');assert.equal(drop.autoClaims,undefined);assert.deepEqual(manual.session.finish(25).inventory,[]);
});
