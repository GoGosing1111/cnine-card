import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {VEHICLE_SUPPORTS, vehicleBuffText} from '../shared/mercenary-vehicle-support-v1.mjs';
import {vehicleBattleGroups} from '../shared/vehicle-battle-art-v1.mjs';
import {mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {equipment, sample, rankedSample} from '../preview/aether-zero-support-v1/battle-samples.mjs';
import {citadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {buildCitadelBattle} from '../functions/_legion_citadel_battle.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {TOWER_ABYSS_PROTOCOL} from '../functions/_tower_abyss.js';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {duoFixture} from './helpers/ranked-duo-db.mjs';

import {enabledVehiclePolicies, garageTransit, withReleasedVehicleSupport} from '../functions/_mercenary_vehicle_support.js';

test('released API and matchmaking defaults enable five tiers and common transit and respect explicit overrides',()=>{
  const vehicle={code:'ORDINARY',name:'일반 차량',image_url:'/assets/vehicles/car.webp'};
  const live=withReleasedVehicleSupport({});
  assert.deepEqual(enabledVehiclePolicies(live),VEHICLE_SUPPORTS);
  assert.equal(garageTransit(live,17,vehicle)?.ownerId,17);
  const paused=withReleasedVehicleSupport({MERCENARY_VEHICLE_BUFFS:'0',VEHICLE_TRANSIT_FX:'0'});
  assert.deepEqual(enabledVehiclePolicies(paused),[]);
  assert.equal(garageTransit(paused,17,vehicle),null);
});

function sameStats(row, base, spec) {
  const factor=(100+(spec?.attackPercent||0))/100;
  assert.equal(row.attack, Math.round(base.attack*factor));
  assert.equal(row.defense, Math.round(base.defense*factor));
  assert.equal(mercenaryEffectiveAttack(row), Math.round(mercenaryEffectiveAttack(base)*factor));
  assert.equal(row.hp,base.hp);
  assert.equal(row.shield,base.shield);
  assert.equal(row.speed,base.speed);
}

test('garage attack and defense gains widen by 10, 15, 20 and 25 percentage points',()=>{
  assert.deepEqual(VEHICLE_SUPPORTS.map(s=>[s.attackPercent,s.defensePercent]),[[10,10],[20,20],[35,35],[55,55],[80,80]]);
  for(const spec of VEHICLE_SUPPORTS)assert.equal(vehicleBuffText(spec),'공격력 +'+spec.attackPercent+'% · 방어력 +'+spec.defensePercent+'%');
});

for (const mode of ['tower','pve','hunt','pvp','duo']) test(mode+' resolves all five tiers once and binds each foot to its own mercenary',()=>{
  const base=sample(mode,[]).battleV2;
  for(const spec of VEHICLE_SUPPORTS) {
    const battle=sample(mode,[spec.vehicle]).battleV2, groups=vehicleBattleGroups(battle.teams);
    assert.deepEqual(groups.map(g=>[g.side,g.ownerId,g.vehicle,g.rows.length]),[['A',1,spec.vehicle,2]]);
    for(const side of ['A','B']) {
      const team=battle.teams[side],before=base.teams[side];
      for(const c of team.cards) {
        const other=before.cards.find(r=>r.id===c.id);
        assert.equal(c.attack,other.attack);assert.equal(c.defense,other.defense);assert.equal(c.vehicleSupport,undefined);
      }
      for(const m of team.mercenaries||[]) sameStats(m,before.mercenaries.find(r=>r.id===m.id),m.vehicleSupport?spec:null);
    }
    const ids=new Set(groups[0].rows.map(m=>m.id));
    const hits=battle.result.timeline.filter(e=>e.vehicleSupportHit||e.vehicleSupportGuard);
    assert.ok(hits.length);
    for(const e of hits) {
      assert.equal(e.type,'TURN');assert.ok(e.damage+e.absorbed>0);
      if(e.vehicleSupportHit)assert.ok(ids.has(e.actorId));
      if(e.vehicleSupportGuard)assert.ok(ids.has(e.targetId));
    }
  }
});

test('individual ranked series retains both owners in every round',()=>{
  const on=rankedSample(['VECTOR_GT','HELIOS_R']);
  for(const r of on.rounds) assert.deepEqual(vehicleBattleGroups(r.battleV2.teams).map(g=>[g.ownerId,g.vehicle,g.rows.length]),[[1,'VECTOR_GT',2],[2,'HELIOS_R',2]]);
  assert.ok(on.rounds.length>=2);
});

test('four ranked duo owners with identical mercenary names retain independent stats and cues',()=>{
  const codes=['VECTOR_GT','AETHER_ZERO','ROLLS_ROYCE_HYPERCAR','BMW_M9'];
  const on=sample('duo',codes).battleV2,off=sample('duo',[]).battleV2;
  const groups=vehicleBattleGroups(on.teams);
  assert.deepEqual(groups.map(g=>g.ownerId),[1,3,2,4]);
  for(const g of groups)for(const m of g.rows){
    assert.equal(m.ownerId,g.ownerId);
    sameStats(m,off.teams[g.side].mercenaries.find(r=>r.id===m.id),VEHICLE_SUPPORTS.find(s=>s.vehicle===codes[m.ownerId-1]));
  }
  const ordinary=sample('duo',['ASTRA_VOLT']).battleV2;
  assert.deepEqual(ordinary.result.timeline,off.result.timeline);
  assert.deepEqual(vehicleBattleGroups(ordinary.teams).map(g=>g.rows.length),[0]);
});

test('party legion replay carries both pairs and their native attack receipts through chunking',()=>{
  const squads=citadelSquads(),base=buildCitadelBattle(squads,4);
  const withCars=squads.map((s,i)=>({...s,...equipment(['ROLLS_ROYCE_HYPERCAR','VECTOR_GT'][i],s.ownerId,s.mercenaries)}));
  const battle=buildCitadelBattle(withCars,4);
  const groups=vehicleBattleGroups(battle.replay.payload.battleV2.teams);
  assert.deepEqual(groups.map(g=>g.rows.length),[2,2]);
  for(const g of groups)for(const row of g.rows)sameStats(row,base.replay.payload.battleV2.teams.A.mercenaries.find(r=>r.id===row.id),VEHICLE_SUPPORTS.find(s=>s.vehicle===g.vehicle));
  const hit=battle.chunks.flatMap(c=>c.events).find(e=>e.vehicleSupportHit);
  assert.ok(groups.find(g=>g.vehicle===hit.vehicleSupportHit).rows.some(m=>m.id===hit.actorId));
});

test('signed-in Legion start returns the saved single mercenary and its vehicle',async t=>{
  const f=await legionFixture();t.after(()=>f.close());
  const deck=f.getDeck(),kit=equipment('BMW_M9',f.owner.id);
  deck.characterBonus.pveEquipmentRuntime={...deck.characterBonus.pveEquipmentRuntime,vehicleTransit:kit.vehicleTransit};
  deck.mercenary=kit.mercenaries[0];f.setDeck(deck);
  const r=await f.call('legion-hunt/start',{difficulty:'normal'});
  assert.equal(r.status,200);
  assert.deepEqual(vehicleBattleGroups(r.body.payload.battleV2.teams).map(g=>[g.vehicle,g.rows[0].cardId]),[['BMW_M9','V-048']]);
});

test('operating tower start retains the equipped vehicle and its owner',async t=>{
  const f=await jointFixture(t),kit=equipment('AETHER_ZERO',7);
  const raid=f.deps.raidDeckPower;
  f.deps.raidDeckPower=async(...args)=>{const d=await raid(...args);return {...d,mercenaries:kit.mercenaries,characterBonus:{...d.characterBonus,pveEquipmentRuntime:{...d.characterBonus?.pveEquipmentRuntime,vehicleTransit:kit.vehicleTransit}}};};
  const tower=await operatingTowerFixture(f);
  const req=new Request('https://test/api/tower/start',{method:'POST',headers:{authorization:'Bearer local-account-7',origin:'https://test','content-type':'application/json'},body:JSON.stringify({requestId:'garage-tower-test-0001',floorNo:1,protocol:TOWER_ABYSS_PROTOCOL})});
  const res=await tower.handle('tower/start',req),data=await res.json();
  assert.equal(res.status,200,JSON.stringify(data).slice(0,300));
  assert.deepEqual(vehicleBattleGroups(data.battleV2.teams).map(g=>[g.vehicle,g.rows.length]),[['AETHER_ZERO',2]]);
});

test('authored body and floor textures pass runtime packaging and file integrity checks',async()=>{
  const root='assets/effects/garage-support-v1/',manifest=JSON.parse(await readFile(root+'manifest.json','utf8'));
  assert.equal(manifest.art.length,6);
  for(const entry of manifest.art)for(const [field,live] of [['source',false],['runtime',true]]) {
    const asset=entry[field];
    assert.equal(asset.hasAlpha,true);assert.equal(isProductionFile(root+asset.file),live);
    assert.equal(createHash('sha256').update(await readFile(root+asset.file)).digest('hex'),asset.sha256);
  }
});

test('ranked duo match and fight load four actual garage selections into the stored replay',async t=>{
  const f=await duoFixture(t);
  await f.ready();
  for(const field of ['code','name','image_url'])await f.p('ALTER TABLE character_garage_items ADD COLUMN '+field+' TEXT').run();
  const equipped=new Map([[2,'VECTOR_GT'],[3,'BMW_M9'],[4,'HELIOS_R'],[5,'AETHER_ZERO']]);
  for(const [id,code] of equipped) {
    await f.p('INSERT INTO character_garage_items(id,pvp_power,is_active,code,name) VALUES(?,500,1,?,?)',id,code,code).run();
    await f.p('INSERT INTO user_garage_vehicles(user_id,garage_id) VALUES(?,?)',id,id).run();
    await f.p('INSERT INTO user_garage_loadout(user_id,garage_id) VALUES(?,?)',id,id).run();
    await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies) VALUES(?,?,1)',id,'V-996').run();
    await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code) VALUES(?,?)',id,'V-996').run();
  }
  f.env.MERCENARY_VEHICLE_BUFFS='1';
  const match=await f.call('ranked-duo/match',{user:2,method:'POST'});
  assert.equal(match.status,200,JSON.stringify(match.data));
  const body={requestId:'garage-duo-tiers-20261125',matchToken:match.data.token};
  const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
  assert.equal(result.status,200,JSON.stringify(result.data).slice(0,300));
  const teams=result.data.battleV2.teams;
  const groups=vehicleBattleGroups(teams);
  assert.equal(groups.length,4);
  for(const g of groups) {
    assert.equal(g.vehicle,equipped.get(g.ownerId));
    assert.deepEqual(g.rows.map(r=>r.vehicleSupport),[{ownerId:g.ownerId,vehicle:g.vehicle,version:2}]);
  }
  const repeated=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
  assert.deepEqual(repeated.data.battleV2,result.data.battleV2);
});
