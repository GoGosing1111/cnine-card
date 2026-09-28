import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkshop,__workshopCraftTest,__workshopBattleSuitTest} from '../functions/_workshop.js';
import {saveEquipmentCraftRecipe,executeEquipmentCraft,decorateEquipmentCraftRecipes,equipmentCraftAccountState} from '../functions/_workshop_equipment_craft.js';
import {equipmentFixture,equipmentDraft} from './helpers/workshop-equipment-fixture.mjs';
import {equipmentCraftPolicy} from '../shared/workshop-equipment-craft.mjs';

test('CMS requires an explicit ceiling and fixed 10% / combined costs',()=>{
  for(const pityAfter of [null,undefined,'',0,-1,1.2,1000001])assert.throws(()=>equipmentCraftPolicy({...equipmentDraft(),equipmentCraft:{inputEquipmentId:101,pityAfter}}),/천장/);
  assert.throws(()=>equipmentCraftPolicy({...equipmentDraft(),successRate:100}),/10%/);
  assert.throws(()=>equipmentCraftPolicy({...equipmentDraft(),paymentMode:'COIN_ONLY'}),/코인/);
  assert.throws(()=>equipmentCraftPolicy({...equipmentDraft(),outputQuantity:2}),/1개/);
});

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(`${dialect}: failed equipment survives; saved failures cross instances; N failures guarantee NEXT attempt; replay is free`,async t=>{
    const f=await equipmentFixture(t,postgres);
    const a=await f.craft('equipment-failure-0001');assert.equal(a.success,false);assert.equal(a.pity.failures,1);assert.equal(a.pity.guaranteed,false);
    assert.equal(await f.coin(),9000000000000);assert.equal(await f.quantity('QA_MATERIAL'),97);assert.equal(await f.quantity('MASTER_STAR'),80);
    assert.deepEqual({...await f.p('SELECT level,revision FROM equipment_forge_states_v1 WHERE instance_id=1').first()},{level:10,revision:11});
    const b=await f.craft('equipment-failure-0002','2');assert.equal(b.success,false);assert.equal(b.guaranteed,false);assert.equal(b.pity.failures,2);assert.equal(b.pity.guaranteed,true);
    const fresh=await equipmentCraftAccountState(f.env,f.user,await f.recipes());assert.equal(fresh.pity[f.recipeId].guaranteed,true);assert.deepEqual(fresh.instances.map(x=>x.id),['1','2']);
    const r=await f.craft('equipment-guarantee-03','2',()=>{throw Error('guaranteed must not roll');});assert.equal(r.success,true);assert.equal(r.effectiveSuccessRate,100);assert.equal(r.pity.failures,0);
    assert.equal(await f.coin(),3000000000000);assert.equal(await f.quantity('QA_MATERIAL'),91);assert.equal(await f.quantity('MASTER_STAR'),40);
    assert.equal(await f.p('SELECT id FROM user_equipment_instances WHERE id=2').first(),null);assert.equal(await f.p('SELECT instance_id FROM equipment_forge_states_v1 WHERE instance_id=2').first(),null);
    const output=await f.p("SELECT x.id,COALESCE(s.level,0) level FROM user_equipment_instances x LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id WHERE x.request_id='equipment-guarantee-03'").first();assert.equal(Number(output.level),0);
    assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
    assert.equal((await f.craft('equipment-guarantee-03','2')).replayed,true);assert.equal(await f.coin(),3000000000000);assert.equal((await f.pity()).failures,0);
    await assert.rejects(f.craft('equipment-guarantee-03','1'),/다른 내용/);
    await assert.rejects(f.craft('equipment-guarantee-03','2',()=>0,{id:8,role:'USER'}),/다른 내용/);
    const other=await equipmentCraftAccountState(f.env,{id:8,role:'USER'},await f.recipes());assert.equal(other.pity[f.recipeId].failures,0);
  });
  test(`${dialect}: late failure rolls back all costs, input, output and pity; retry retains the original roll`,async t=>{
    const f=await equipmentFixture(t,postgres);let rolls=0;
    f.fail('INSERT INTO workshop_craft_logs_v1668');
    await assert.rejects(f.craft('equipment-rollback-01','1',()=>{rolls++;return 0}),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.coin(),12000000000000);assert.equal(await f.quantity('QA_MATERIAL'),100);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal((await f.pity()).failures,0);
    assert.equal(Number((await f.p('SELECT level FROM equipment_forge_states_v1 WHERE instance_id=1').first()).level),10);
    assert.equal((await f.p('SELECT * FROM user_equipment_instances WHERE equipment_id=102').all()).results.length,0);
    const r=await f.craft('equipment-rollback-01','1',()=>{rolls++;return 9999});assert.equal(r.success,true);assert.equal(rolls,1);
    assert.equal(await f.coin(),9000000000000);assert.equal((await f.craft('equipment-rollback-01')).replayed,true);
  });
  test(`${dialect}: wrong equipment, ownership, +9, loadout, hidden recipe and missing resources spend nothing`,async t=>{
    const f=await equipmentFixture(t,postgres);
    for(const id of ['3','4','5','6','999'])await assert.rejects(f.craft('equipment-ineligible-'+id,id),/내 \+10/);
    await assert.rejects(__workshopCraftTest.craft(f.env,f.user,{recipeId:f.recipeId,requestId:'legacy-route-bypass'}),/장비제작/);
    await f.p('UPDATE workshop_recipes_v1668 SET owner_test_only=1 WHERE id=?',f.recipeId).run();
    await assert.rejects(f.craft('equipment-owner-only','1',()=>0,{id:7,role:'USER'}),/제작할 수 없는/);
    await f.p('UPDATE workshop_recipes_v1668 SET is_active=0 WHERE id=?',f.recipeId).run();await assert.rejects(f.craft('equipment-off-0001'),/제작할 수 없는/);
    await f.p('UPDATE workshop_recipes_v1668 SET is_active=1 WHERE id=?',f.recipeId).run();
    await f.p("UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code='QA_MATERIAL'").run();await assert.rejects(f.craft('equipment-no-material'),/재료가 부족/);
    assert.equal(await f.coin(),12000000000000);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal((await f.pity()).failures,0);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM workshop_craft_logs_v1668').first()).n),0);
  });
  test(`${dialect}: CMS saves policy and materials atomically; revisions and rename preserve account pity`,async t=>{
    const f=await equipmentFixture(t,postgres);await f.craft('equipment-before-edit');
    const update={...equipmentDraft(),id:f.recipeId,code:'QA_RENAMED',equipmentCraft:{inputEquipmentId:101,pityAfter:3,revision:1}};
    f.fail('INSERT INTO admin_logs');await assert.rejects(saveEquipmentCraftRecipe(f.env,f.user,update),/INJECTED_FAILURE/);f.fail('');
    assert.equal((await f.recipes())[0].code,'QA_EQUIPMENT');assert.equal((await f.recipes())[0].equipmentCraft.pityAfter,2);
    await saveEquipmentCraftRecipe(f.env,f.user,update);assert.equal((await f.recipes())[0].equipmentCraft.pityAfter,3);assert.equal((await f.pity()).failures,1);
    await assert.rejects(saveEquipmentCraftRecipe(f.env,f.user,update),/다른 창/);
    await assert.rejects(saveEquipmentCraftRecipe(f.env,{id:7,role:'ADMIN'},equipmentDraft()),/OWNER/);
    await assert.rejects(__workshopBattleSuitTest.saveRecipe(f.env,f.user,{...equipmentDraft(),id:f.recipeId,category:'BATTLE_SUIT_CRAFT'},{}),/종류는 변경/);
    const id=await saveEquipmentCraftRecipe(f.env,f.user,{...equipmentDraft(),code:'QA_OTHER_RECIPE'});const state=await equipmentCraftAccountState(f.env,f.user,await f.recipes());assert.equal(state.pity[id].failures,0);assert.equal(state.pity[f.recipeId].failures,1);
  });
}

test('two simultaneous attempts serialize at pity boundary and cannot consume the same +10 input twice',async t=>{
  const f=await equipmentFixture(t);
  await f.craft('equipment-boundary-01');await f.craft('equipment-boundary-02');
  const results=await Promise.allSettled([f.craft('equipment-parallel-01'),f.craft('equipment-parallel-02')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await f.coin(),3000000000000);assert.equal((await f.pity()).failures,0);assert.equal((await f.p('SELECT * FROM user_equipment_instances WHERE equipment_id=102').all()).results.length,1);
});

test('a trigger suppressing output delivery rolls the successful transaction back',async t=>{
  const f=await equipmentFixture(t,true);
  await f.pg.exec("CREATE FUNCTION qa_suppress_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER qa_no_grant BEFORE INSERT ON user_equipment_instances FOR EACH ROW WHEN (NEW.source_type='WORKSHOP_EQUIPMENT') EXECUTE FUNCTION qa_suppress_grant();");
  await assert.rejects(f.craft('equipment-zero-grant','1',()=>0));
  assert.equal(await f.coin(),12000000000000);assert.equal(await f.quantity('QA_MATERIAL'),100);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal((await f.pity()).failures,0);assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
});

test('HTTP route validates origin/body, calls the shared user lock and replays a committed result after response loss',async t=>{
  const f=await equipmentFixture(t);let locks=0;
  await f.setting(`WORKSHOP_EQUIPMENT_PITY_V1:7:${f.recipeId}`,{failures:2,revision:2});
  const body={recipeId:f.recipeId,instanceId:'1',requestId:'equipment-http-request1'},url='https://local.test/api/workshop/equipment-craft';
  const call=async(value=body,origin='https://local.test')=>handleWorkshop({path:'workshop/equipment-craft',env:f.env,request:new Request(url,{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer local-account-7'},body:JSON.stringify(value)}),deps:{...f.deps,withUserMutationLock:(env,uid,path,work)=>{locks++;assert.equal(path,'workshop/equipment-craft');return f.deps.withUserMutationLock(env,uid,path,work)}}});
  assert.equal((await call(body,'https://elsewhere.test')).status,403);assert.equal((await call({...body,success:true})).status,400);assert.equal(locks,0);
  const first=await call();assert.equal(first.status,200);assert.equal((await first.json()).success,true);
  const second=await call();assert.equal(second.status,200);assert.equal((await second.json()).replayed,true);assert.equal(locks,2);assert.equal(await f.coin(),9000000000000);
});
