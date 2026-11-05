import test from 'node:test';
import assert from 'node:assert/strict';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {emptyPetRentals,nextPetRental,petRentalKey} from '../functions/_pet_rental.js';
import {collectionDropPercent,collectionRewardCoin,readCollectionBonuses,withCollectionBonusScope} from '../functions/_collection_bonuses.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {COMPANION_REVIEW_CARDS as cards} from '../functions/_companion_preparation.js';
import {auctionAssetDebit} from '../functions/_auction_user_assets.js';

const first='PET-BONGSOON',second='PET-DIIM',key='pet_loadout_v1:2';
const edit=(mode,petCode,expectedRevision)=>({mode,petCode,expectedRevision,petCmsRevision:4,requestId:crypto.randomUUID()});
const post=(f,body)=>f.call('pets/v1/loadout',{body});
async function fixture(t){
  const f=await petLiveFixture(t),cms=await f.record('pet_cms_preparation_v1');
  const alternate=PET_ART_CATALOG.find(p=>p.code===second);
  const pet={...f.pet,rewardBonuses:{dropPercent:10,coinPercent:20,accountXpPercent:30}};
  cms.document.pets=[pet,{...pet,code:second,name:alternate.name,sourceArt:alternate.sourceArt,
    buffs:[{type:'DEFENSE_PERCENT',percent:15}],rewardBonuses:{dropPercent:40,coinPercent:50,accountXpPercent:60}}];
  await f.write('pet_cms_preparation_v1',cms);
  await f.write('pet_collection_v1:2',{revision:1,pets:{[first]:1,[second]:1}});
  return f;
}

test('legacy equipment and retries survive first edit, with independent revisions, explicit empty slots and shared ownership',async t=>{
  const f=await fixture(t),legacy=edit('PVE',first,0);delete legacy.mode;
  assert.equal((await post(f,legacy)).status,200);
  const original=await f.record(key),initial=(await f.call('pets/v1/codex')).body;
  assert.deepEqual(initial.loadouts,{PVE:{petCode:first,revision:1},PVP:{petCode:first,revision:1}});
  assert.deepEqual(await f.record(key),original);
  const pvp=edit('PVP',second,1),pve=edit('PVE',null,1);
  const split=await post(f,pvp);
  assert.equal(split.status,200);
  assert.deepEqual(split.body.loadouts,{PVE:{petCode:first,revision:1},PVP:{petCode:second,revision:2}});
  assert.equal((await post(f,pve)).status,200); // Two windows opened on the original revision.
  assert.deepEqual((await f.call('pets/v1/state')).body.loadouts,{PVE:{petCode:null,revision:3},PVP:{petCode:second,revision:2}});
  assert.equal((await post(f,legacy)).body.replayed,true);
  assert.equal((await post(f,pvp)).body.replayed,true);
  assert.equal((await post(f,{...pvp,mode:'PVE'})).body.code,'PET_REQUEST_ID_CONFLICT');
  assert.equal((await post(f,edit('PVE',second,1))).body.code,'PET_REVISION_CONFLICT');
  assert.equal((await post(f,{...legacy,expectedRevision:3,requestId:crypto.randomUUID()})).body.code,'PET_MODE_REQUIRED');
  assert.equal((await post(f,edit('PVE',second,3))).status,200); // One owned copy can serve both.
  assert.equal((await post(f,edit('PVP',null,2))).status,200);
  assert.deepEqual((await f.call('pets/v1/codex')).body.loadouts,{PVE:{petCode:second,revision:4},PVP:{petCode:null,revision:5}});
  assert.equal((await f.record(key)).audit.length,5);
  assert.deepEqual((await f.record('pet_collection_v1:2')).pets,{[first]:1,[second]:1});
});

test('first PVE edit keeps an empty PVP slot; forged modes, unowned pets and failed writes do not change either',async t=>{
  const f=await fixture(t);
  assert.equal(await f.record(key),null);
  const edited=await post(f,edit('PVE',first,0));
  assert.deepEqual(edited.body.loadouts,{PVE:{petCode:first,revision:1},PVP:{petCode:null,revision:0}});
  const before=await f.record(key),pending=edit('PVP',second,0);
  assert.equal((await post(f,{...pending,mode:'other'})).status,400);
  assert.equal((await post(f,{...pending,mode:null})).status,400);
  assert.equal((await post(f,{...pending,petCode:'PET-HEUKGU'})).status,403);
  assert.equal((await post(f,{...pending,petCmsRevision:3})).status,409);
  f.fail('INSERT INTO joint_atomic_guards');
  const failed=await post(f,pending);
  f.fail('');
  assert.notEqual(failed.status,200);
  assert.deepEqual(await f.record(key),before);
  assert.equal((await post(f,pending)).status,200);
  assert.equal((await post(f,pending)).body.replayed,true);
});

test('different mode selections reach real battle openings, bonus settlement and the request cache',async t=>{
  const f=await fixture(t);
  assert.equal((await post(f,edit('PVE',first,0))).status,200);
  assert.equal((await post(f,edit('PVP',second,0))).status,200);
  const pve=await loadPetBattleSnapshot(f.env,2,'PVE'),pvp=await loadPetBattleSnapshot(f.env,2,'PVP');
  const opponent=await loadPetBattleSnapshot(f.env,9,'PVP');
  const hunt=createPveBattleV2({cards,monster:{id:1,battle_power:300000},pet:pve,seed:3});
  const ranked=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:pvp,defenderPet:opponent,seed:3});
  const openings=battle=>battle.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');
  assert.deepEqual(openings(hunt).map(e=>[e.petCode,e.buffs[0].type]),[[first,'ATTACK_PERCENT']]);
  assert.deepEqual(openings(ranked).map(e=>[e.petCode,e.buffs[0].type]),[[second,'DEFENSE_PERCENT']]);
  const scope=withCollectionBonusScope(f.env);
  assert.equal(await collectionRewardCoin(scope,2,100,'RANKED_DUO'),150);
  assert.equal(await collectionRewardCoin(scope,2,100,'HUNT'),120);
  assert.equal(await collectionDropPercent(scope,2,'PVE_DROP'),10);
  assert.equal(await collectionDropPercent(scope,2,'PVP_DROP'),40);
  assert.equal((await readCollectionBonuses(scope,2)).totals.accountXpPercent,30);
  assert.equal((await readCollectionBonuses(scope,2,'PVP')).totals.accountXpPercent,60);
  assert.equal((await post(f,edit('PVP',null,2))).status,200);
  assert.equal(await collectionRewardCoin(f.env,2,100,'PVP'),100);
  assert.equal(await loadPetBattleSnapshot(f.env,2,'PVP'),null);
  assert.equal((await loadPetBattleSnapshot(f.env,2,'PVE')).definition.code,first);
});

test('an expired PVP rental drops out of the UI, battle and rewards without affecting PVE',async t=>{
  const f=await fixture(t);
  await f.write('pet_collection_v1:2',{revision:2,pets:{[first]:1}});
  const rental=nextPetRental(emptyPetRentals(),second,1,crypto.randomUUID(),Date.now()-60000);
  await f.write(petRentalKey(2),rental.state);
  assert.equal((await post(f,edit('PVE',first,0))).status,200);
  assert.equal((await post(f,edit('PVP',second,0))).status,200);
  const now=Date.now;Date.now=()=>Date.parse(rental.entry.expiresAt);
  try{
    const state=(await f.call('pets/v1/state')).body;
    assert.deepEqual(state.orphanedModes,{PVE:false,PVP:true});
    assert.equal(state.loadouts.PVP.petCode,null);assert.equal(state.loadouts.PVE.petCode,first);
    assert.equal(await loadPetBattleSnapshot(f.env,2,'PVP'),null);
    assert.equal(await collectionDropPercent(f.env,2,'PVP_DROP'),0);
    assert.equal(await collectionDropPercent(f.env,2,'HUNT'),10);
  }finally{Date.now=now;}
});

test('a PVP-only selection protects the last copy in auction escrow and OWNER review stays isolated',async t=>{
  const f=await fixture(t),asset={kind:'PET',ref:second,name:'디임',tradeable:true};
  assert.equal((await post(f,edit('PVP',second,0))).status,200);
  await assert.rejects(auctionAssetDebit(f.env,2,asset,1,'qa'),/편성/);
  assert.equal((await f.call('admin/pets/equipment/loadout',{user:9,body:edit('PVE',first,0)})).status,200);
  assert.equal((await f.call('pets/v1/state',{user:9})).body.loadouts.PVE.petCode,null);
  assert.equal((await post(f,edit('PVP',null,1))).status,200);
  assert.ok((await auctionAssetDebit(f.env,2,asset,1,'qa')).statements.length>0);
});

test('racing saves from separate mode tabs converge on both edits without overwriting the winner',async t=>{
  const f=await fixture(t),route='admin/pets/equipment/loadout';
  const edits=[edit('PVE',first,0),edit('PVP',second,0)];
  const save=body=>f.call(route,{user:9,body});
  const results=await Promise.all(edits.map(save));
  assert.ok(results.some(r=>r.status===200));
  for(const [index,result] of results.entries()){
    if(result.status===200)continue;
    assert.equal(result.body.code,'PET_REVISION_CONFLICT');
    assert.equal((await save(edits[index])).status,200);
  }
  const state=(await f.call('admin/pets/equipment/state',{user:9})).body;
  assert.equal(state.loadouts.PVE.petCode,first);
  assert.equal(state.loadouts.PVP.petCode,second);
  assert.equal((await f.record('pet_equipment_review_v1:9')).audit.length,2);
});
