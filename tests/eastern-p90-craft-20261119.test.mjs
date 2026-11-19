import test from 'node:test';
import assert from 'node:assert/strict';
import {p90Fixture} from './helpers/eastern-p90-20261119.mjs';
import {equipmentCraftPolicy} from '../shared/workshop-equipment-craft.mjs';
import {equipmentCraftAccountState,saveEquipmentCraftRecipe} from '../functions/_workshop_equipment_craft.js';
import {forgeQuote,executeForge} from '../functions/_equipment_forge_transactions.js';
import {P90_REQUIREMENTS as P} from '../scripts/ops/eastern-p90-requirements-20261119.mjs';

test('P90 validates distinct alternatives, +15, exact costs and the five-failure ceiling',async t=>{
  const f=await p90Fixture(t),r=(await f.recipes())[0];
  assert.equal(Number(r.coin_cost),500000000000000);assert.equal(Number(r.master_star_cost),1000000000);
  assert.deepEqual(r.equipmentCraft.inputEquipmentIds,[40,41]);assert.deepEqual(r.equipmentCraft.inputOptions.map(x=>x.name),['금룡 대물저격','금룡 대물소총']);
  for(const ids of [[],[40,40],[40,53],[40,41,103],null])assert.throws(()=>equipmentCraftPolicy({...f.draft,equipmentCraft:{...P.policy,inputEquipmentIds:ids}}));
  await assert.rejects(saveEquipmentCraftRecipe(f.env,f.user,{...f.draft,masterStarCost:1000000001,equipmentCraft:{...P.policy,revision:2}}),/1,000,000,000/);
  const state=await equipmentCraftAccountState(f.env,f.user,await f.recipes());
  assert.deepEqual(state.instances.map(x=>x.id),['1','2','5','7','8','9']);assert.equal(state.pity[f.recipeId].pityAfter,5);
  for(const id of ['3','4','6','10','999'])await assert.rejects(f.craft('p90-invalid-input-'+id,id),/내 \+15/);
  assert.equal(await f.coin(),4000000000000000);assert.equal(await f.quantity('MASTER_STAR'),8000000000);
});

for(const postgres of [false,true]){
  const label=postgres?'PostgreSQL':'SQLite';
  test(`${label}: either +15 weapon fails, archives its actual identity and repairs once`,async t=>{
    const f=await p90Fixture(t,postgres);
    for(const [instanceId,itemId] of [['1',40],['5',41]]){
      const requestId='p90-repairable-failure-'+itemId,result=await f.craft(requestId,instanceId);
      assert.equal(result.success,false);assert.equal(result.input.equipmentId,itemId);assert.equal(result.input.name,itemId===40?'금룡 대물저격':'금룡 대물소총');assert.equal(result.input.repairRecordId,requestId);
      assert.equal(await f.p('SELECT id FROM user_equipment_instances WHERE id=?',instanceId).first(),null);
      const archive=await f.p('SELECT * FROM equipment_forge_destroyed_v1 WHERE record_id=?',requestId).first(),item=JSON.parse(archive.item_json);
      assert.equal(Number(archive.equipment_id),itemId);assert.equal(item.equipmentId,String(itemId));assert.equal(item.level,15);
      const q=await forgeQuote(f.env,f.user,{kind:'RESTORE',recordId:requestId,requestId:'p90-restore-quote-'+itemId});
      const restore=()=>f.deps.withUserMutationLock(f.env,7,'character/equipment/forge/restore',()=>executeForge(f.env,f.user,{quoteId:q.quoteId,requestId:'p90-restore-once-'+itemId},'RESTORE'));
      const restored=await restore(),row=await f.p('SELECT x.equipment_id,s.level FROM user_equipment_instances x JOIN equipment_forge_states_v1 s ON s.instance_id=x.id WHERE x.id=?',restored.instanceId).first();
      assert.equal(Number(row.equipment_id),itemId);assert.equal(Number(row.level),15);assert.equal((await restore()).replayed,true);
      const balance=await f.coin();assert.equal((await f.craft(requestId,instanceId)).replayed,true);assert.equal(await f.coin(),balance);
    }
    assert.equal(await f.quantity('MASTER_STAR'),6000000000);for(const m of P.materials)assert.equal(await f.quantity(m.code),18);
    assert.equal((await f.pity()).failures,2);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_equipment_instances WHERE equipment_id=53').first()).n),0);
  });
  test(`${label}: changing weapon keeps five shared failures, sixth succeeds without rolling and charges once`,async t=>{
    const f=await p90Fixture(t,postgres),ids=['1','5','2','7','8'];
    for(const [i,id] of ids.entries()){
      const r=await f.craft('p90-pity-failure-'+i,id);assert.equal(r.success,false);assert.equal(r.pity.failures,i+1);assert.equal(r.pity.guaranteed,i===4);
    }
    const r=await f.craft('p90-pity-sixth-success','9',()=>{throw Error('guaranteed must not roll')});
    assert.equal(r.success,true);assert.equal(r.guaranteed,true);assert.equal(r.input.equipmentId,41);assert.equal(r.input.repairRecordId,null);assert.equal(r.output.ref,'53');assert.equal(r.output.level,0);assert.equal(r.pity.failures,0);
    assert.equal(await f.coin(),1000000000000000);assert.equal(await f.quantity('MASTER_STAR'),2000000000);
    for(const m of P.materials)assert.equal(await f.quantity(m.code),14);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM equipment_forge_destroyed_v1').first()).n),5);
    assert.equal((await f.craft('p90-pity-sixth-success','9')).replayed,true);assert.equal(await f.coin(),1000000000000000);
  });
  test(`${label}: archive or receipt failure rolls back costs, selected alternative and pity; retry does not reroll`,async t=>{
    const f=await p90Fixture(t,postgres);let rolls=0;
    for(const sql of ['INSERT INTO equipment_forge_destroyed_v1','INSERT INTO workshop_craft_receipts_v1668']){
      f.fail(sql);await assert.rejects(f.craft('p90-atomic-alternative','5',()=>{rolls++;return 9999}),/INJECTED_FAILURE/);f.fail('');
      assert.equal(await f.coin(),4000000000000000);assert.equal(await f.quantity('MASTER_STAR'),8000000000);assert.equal((await f.pity()).failures,0);
      assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=5').first());for(const m of P.materials)assert.equal(await f.quantity(m.code),20);
    }
    const r=await f.craft('p90-atomic-alternative','5',()=>{rolls++;return 0});assert.equal(rolls,1);assert.equal(r.success,false);assert.equal(r.input.equipmentId,41);
    assert.equal(await f.coin(),3500000000000000);assert.equal((await f.craft('p90-atomic-alternative','5')).replayed,true);
    assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
  });
}
