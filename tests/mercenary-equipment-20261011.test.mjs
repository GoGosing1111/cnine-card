import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureForgeTransactionSchema,forgeEquipmentBonus} from '../functions/_equipment_forge_transactions.js';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout,releasedMercenarySnapshot,releasedMercenarySnapshots,mercenarySnapshotPower} from '../functions/_mercenary_account.js';
import {saveMercenaryEquipment,mercenaryEquipmentState,mercenaryEquipmentRuntimes,readMercenaryEquipmentRecords,mercenaryEquipmentKey,handleMercenaryEquipment} from '../functions/_mercenary_equipment.js';
import {equipmentGrowthRuntime,polishStateKey} from '../functions/_equipment_growth.js';
import {REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {applyPveEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {readForgePreparationInventory} from '../functions/_equipment_forge_preparation.js';
const rid=()=>crypto.randomUUID();
async function fixture(t,postgres=false){
  const f=await mercenaryFixture(t,{postgres});await ensureForgeTransactionSchema(f.env);
  const gear=REGION_EQUIPMENT.filter(item=>item.regionId==='coast');
  for(const [i,item] of gear.entries()){
    const pve=Math.floor(item.totalPower*.9);
    await f.p('INSERT INTO character_equipment_items(id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,?,?,?,?,?)',100+i,item.code,item.name,item.slot,item.rarity,item.image,item.totalPower,pve,item.totalPower-pve).run();
    await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(?,7,?,'QA',?)",1000+i,100+i,rid()).run();
  }
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(2000,8,100,'QA',?)",rid()).run();
  for(const code of ['V-001','V-002'])await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:rid()}));
  await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode:'PVE',mercenaryCode:'V-001',revision:0});
  await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode:'PVP',mercenaryCode:'V-001',revision:0});
  return f;
}
const save=(f,mode,slot,instanceId,revision,requestId=rid())=>saveMercenaryEquipment(f.env,f.user,{mode,slot,instanceId,revision,requestId});
for(const postgres of [false,true]){
  const db=postgres?'PostgreSQL':'SQLite';
  test(`${db}: PVE/PVP equipment survives mercenary replacement, shares real copies across modes, and unequips independently`,async t=>{
    const f=await fixture(t,postgres),coin=await f.coin();
    await save(f,'PVE','WEAPON','1000',0);await save(f,'PVP','WEAPON','1000',0);
    let state=await mercenaryEquipmentState(f.env,f.user);
    assert.equal(state.loadouts.PVE.power,180000);assert.equal(state.loadouts.PVP.power,20000);
    await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode:'PVE',mercenaryCode:'V-002',revision:1});
    const snapshot=await releasedMercenarySnapshot(f.env,f.user,'PVE');assert.equal(snapshot.code,'V-002');assert.equal(snapshot.equipment.items[0].instanceId,'1000');
    assert.equal((await releasedMercenarySnapshots(f.env,[7],'PVE')).get(7).equipment.power,180000);
    await save(f,'PVE','WEAPON',null,1);state=await mercenaryEquipmentState(f.env,f.user);
    assert.equal(state.loadouts.PVE.power,0);assert.equal(state.loadouts.PVP.power,20000);assert.equal(await f.coin(),coin);
    assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM user_equipment_instances').first()).n),7);
  });
  test(`${db}: ownership, slot, publication, corrupt state and optimistic revision checks fail closed`,async t=>{
    const f=await fixture(t,postgres);
    await assert.rejects(()=>save(f,'PVE','WEAPON','2000',0),{code:'MERCENARY_EQUIPMENT_OWNERSHIP'});
    await assert.rejects(()=>save(f,'PVE','TOP','1000',0),{code:'MERCENARY_EQUIPMENT_OWNERSHIP'});
    await f.p('UPDATE character_equipment_items SET is_public=0 WHERE id=100').run();
    await assert.rejects(()=>save(f,'PVE','WEAPON','1000',0),{code:'MERCENARY_EQUIPMENT_OWNERSHIP'});
    await f.p('UPDATE character_equipment_items SET is_public=1 WHERE id=100').run();
    await save(f,'PVE','WEAPON','1000',0);
    await assert.rejects(()=>save(f,'PVE','TOP','1001',0),{code:'MERCENARY_EQUIPMENT_CONFLICT'});
    for(const id of [-1,1000,'0','1 OR 1=1',{}])await assert.rejects(()=>save(f,'PVP','WEAPON',id,0),{code:'MERCENARY_EQUIPMENT_INPUT'});
    await f.setting(mercenaryEquipmentKey(7,'PVP'),{schemaVersion:1,revision:0,slots:{}});
    await assert.rejects(()=>readMercenaryEquipmentRecords(f.env,[7]),{code:'MERCENARY_EQUIPMENT_STATE'});
  });
  test(`${db}: transaction rollback, receipt replay and stale pending requests never overwrite newer equipment`,async t=>{
    const f=await fixture(t,postgres),requestId=rid();f.fail('INSERT INTO app_meta');
    await assert.rejects(()=>save(f,'PVE','WEAPON','1000',0,requestId));
    assert.equal((await readMercenaryEquipmentRecords(f.env,[7])).get(7).PVE.revision,0);
    f.fail('');await save(f,'PVP','TOP','1001',0);await save(f,'PVE','WEAPON','1000',0,requestId);
    assert.equal((await save(f,'PVE','WEAPON','1000',0,requestId)).replayed,true);
    await assert.rejects(()=>save(f,'PVP','WEAPON','1000',0,requestId),{code:'JOINT_REQUEST_CONFLICT'});
    const pending=rid();f.fail('INSERT INTO app_meta');await assert.rejects(()=>save(f,'PVE','TOP','1001',1,pending));f.fail('');
    await save(f,'PVE','BOTTOM','1002',1);await assert.rejects(()=>save(f,'PVE','TOP','1001',1,pending),{code:'MERCENARY_EQUIPMENT_CONFLICT'});
    const record=(await readMercenaryEquipmentRecords(f.env,[7])).get(7);assert.equal(record.PVE.slots.TOP,null);assert.equal(record.PVE.slots.BOTTOM,'1002');assert.equal(record.PVP.slots.TOP,'1001');
  });
  test(`${db}: enhancement/polish stay on the owned instance; invalid or destroyed copies give no bonus`,async t=>{
    const f=await fixture(t,postgres);
    await f.p('INSERT INTO equipment_forge_states_v1 VALUES(1000,7,3,1)').run();
    await f.setting(polishStateKey('1000',7),{schemaVersion:1,userId:7,instanceId:'1000',attempts:1,levels:[1,0,0,0,0],values:[.5,0,0,0,0]});
    await save(f,'PVE','WEAPON','1000',0);await save(f,'PVP','WEAPON','1000',0);
    const state=await mercenaryEquipmentState(f.env,f.user);assert.equal(state.loadouts.PVE.power,forgePower(200000,3).pve);assert.equal(state.loadouts.PVE.effects.attackPercent,.5);assert.deepEqual(state.loadouts.PVP.effects,{});
    const item=state.items.find(i=>i.instanceId==='1000');assert.equal(item.level,3);assert.equal(item.polish.attempts,1);assert.equal(item.totalPower,236000);
    const forged=(await readForgePreparationInventory(f.env.DB,7,{focusId:'1000',includeEnhancement:true})).items[0];assert.equal(forged.equipped,true);assert.deepEqual(forged.mercenaryModes,['PVE','PVP']);
    await f.p("INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,'WEAPON',1000)").run();
    assert.deepEqual(await forgeEquipmentBonus(f.env,7),{pve:0,pvp:0});assert.equal((await equipmentGrowthRuntime(f.env,7)).effects.attackPercent,undefined);
    await f.p('DELETE FROM user_equipment_instances WHERE id=1000').run();
    for(const mode of ['PVE','PVP'])assert.equal((await mercenaryEquipmentRuntimes(f.env,[7],mode)).get(7).power,0);
    await save(f,'PVE','WEAPON',null,1);
  });
}
test('actual PVE/PVP fighter power and personal set effects follow the selected mode without buffing normal cards',async t=>{
  const f=await fixture(t);
  for(const [i,slot] of ['WEAPON','TOP','BOTTOM','SHOES'].entries())await save(f,'PVE',slot,String(1000+i),i);
  await save(f,'PVP','WEAPON','1000',0);
  const snapshot=await releasedMercenarySnapshot(f.env,f.user,'PVE'),bare={...snapshot,equipment:undefined};
  const fighter=buildMercenaryFighter(snapshot,'A','PVE',buildFighter),base=buildMercenaryFighter(bare,'A','PVE',buildFighter);
  assert.equal(fighter.power,mercenarySnapshotPower(snapshot));assert.ok(fighter.attack>base.attack);assert.equal(fighter.equipmentEffects.hpPercent,8);assert.ok(fighter.shield>0);
  const mismatched=buildMercenaryFighter(snapshot,'A','PVP',buildFighter);assert.equal(mismatched.power,buildMercenaryFighter(bare,'A','PVP',buildFighter).power);assert.equal(mismatched.equipmentEffects,undefined);
  const pvp=buildMercenaryFighter(await releasedMercenarySnapshot(f.env,f.user,'PVP'),'A','PVP',buildFighter);assert.equal(pvp.power,base.power+20000);assert.equal(pvp.equipmentEffects,undefined);
  const cards=Array.from({length:5},(_,i)=>({id:String(i),title:'검수',rarity:'FUR',power:10000,power_type:'ATTACK'}));
  const run=mercenary=>createPveBattleV2({cards,mercenary,monster:{id:1,name:'검수',battle_power:100000},seed:7});
  assert.deepEqual(run(snapshot).teams.A.cards,run(bare).teams.A.cards);
  applyPveEquipmentGrowth([fighter],{effects:{attackPercent:30,hpPercent:30}});assert.equal(fighter.equipmentEffects.hpPercent,30);assert.equal(fighter.maxHp,Math.round(fighter.equipmentGrowthBase.maxHp*1.3));
  const strongCards=cards.map((card,i)=>buildFighter({...card,power:100000000},i,'A',null,'PVE'));
  const armed=buildMercenaryFighter(snapshot,'A','PVE',buildFighter),unarmed=buildMercenaryFighter(bare,'A','PVE',buildFighter);
  applyMercenaryCombatLink([[...structuredClone(strongCards),unarmed]]);applyMercenaryCombatLink([[...structuredClone(strongCards),armed]]);
  assert.ok(mercenaryEffectiveAttack(armed)>mercenaryEffectiveAttack(unarmed),'strong-deck attack floor must retain gear gains');assert.ok(armed.maxHp>unarmed.maxHp,'strong-deck HP floor must retain set effects');
  assert.equal(armed.mercenaryLink.hpFloor,Math.round((unarmed.mercenaryLink.hpFloor+armed.equipmentStats.hp)*1.08));
  const once=structuredClone(armed);applyMercenaryCombatLink([[...strongCards,armed]]);assert.deepEqual(armed,once,'link retries cannot grant another equipment bonus');
});
test('equipment route authenticates and uses the existing account mutation lock',async t=>{
  const f=await fixture(t);let locks=0;
  const deps={...f.deps,withUserMutationLock:async(_env,id,path,fn)=>{assert.equal(id,7);assert.equal(path,'mercenaries/v3/equipment');locks++;return fn();}};
  const call=auth=>handleMercenaryEquipment({path:'mercenaries/v3/equipment',env:f.env,deps,request:new Request('https://game.test/api/mercenaries/v3/equipment',{method:'POST',headers:{origin:'https://game.test',authorization:auth||'','content-type':'application/json'},body:JSON.stringify({requestId:rid(),mode:'PVE',slot:'WEAPON',instanceId:'1000',revision:0})})});
  assert.equal((await call()).status,401);assert.equal((await call('Bearer local-account-7')).status,200);assert.equal(locks,1);
});
