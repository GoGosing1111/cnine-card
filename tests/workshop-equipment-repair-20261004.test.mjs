import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture,equipmentDraft} from './helpers/workshop-equipment-fixture.mjs';
import {saveEquipmentCraftRecipe} from '../functions/_workshop_equipment_craft.js';
import {equipmentCraftPolicy} from '../shared/workshop-equipment-craft.mjs';
import {forgeQuote,executeForge,forgeAccountState} from '../functions/_equipment_forge_transactions.js';
import {enableEquipmentRepairFixture} from './helpers/workshop-equipment-repair-fixture.mjs';
import {inspectEasternCraftRepair,applyEasternCraftRepair} from '../scripts/ops/eastern-craft-repair-policy-20261004.mjs';

const repairDraft=f=>({...equipmentDraft(),id:f.recipeId,equipmentCraft:{...equipmentDraft().equipmentCraft,revision:1,failureInputPolicy:'CONSUME',failureRepairable:true}});
const record=(f,id)=>f.p('SELECT * FROM equipment_forge_destroyed_v1 WHERE record_id=?',id).first();
const quote=(f,recordId,requestId,user=f.user)=>forgeQuote(f.env,user,{kind:'RESTORE',recordId,requestId});
const restore=(f,q,requestId,user=f.user)=>f.deps.withUserMutationLock(f.env,user.id,'character/equipment/forge/restore',()=>executeForge(f.env,user,{quoteId:q.quoteId,requestId},'RESTORE'));

test('repairability is explicit, boolean and valid only with failed input consumption',()=>{
  assert.equal(equipmentCraftPolicy(equipmentDraft()).failureRepairable,false);
  for(const value of [null,'true',1,{},[]])assert.throws(()=>equipmentCraftPolicy({...equipmentDraft(),equipmentCraft:{...equipmentDraft().equipmentCraft,failureInputPolicy:'CONSUME',failureRepairable:value}}),/리페어/);
  assert.throws(()=>equipmentCraftPolicy({...equipmentDraft(),equipmentCraft:{...equipmentDraft().equipmentCraft,failureRepairable:true}}),/리페어/);
});

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  async function fixture(t){const f=await equipmentFixture(t,postgres);await enableEquipmentRepairFixture(f);await saveEquipmentCraftRecipe(f.env,f.user,repairDraft(f));return f;}
  test(`${dialect}: CMS accepts 20 million stars and charges that exact amount; above-cap saves fail without clamping`,async t=>{
    const f=await equipmentFixture(t,postgres),draft={...repairDraft(f),masterStarCost:20000000};
    await assert.rejects(saveEquipmentCraftRecipe(f.env,f.user,{...draft,masterStarCost:20000001}),/20,000,000/);
    assert.equal(Number((await f.recipes())[0].master_star_cost),20);
    await saveEquipmentCraftRecipe(f.env,f.user,draft);assert.equal(Number((await f.recipes())[0].master_star_cost),20000000);
    await f.p("UPDATE cnine_user_inventory SET quantity=20000001,unseen_quantity=20000001 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
    const r=await f.craft('twenty-million-stars-01');assert.equal(r.masterStarSpent,20000000);assert.equal(await f.quantity('MASTER_STAR'),1);
    await f.craft('twenty-million-stars-01');assert.equal(await f.quantity('MASTER_STAR'),1);
  });
  test(`${dialect}: failed craft records the exact owned +10 weapon; coupon restores once, without refunding crafting costs`,async t=>{
    const f=await fixture(t),id='repair-craft-complete-01';
    const result=await f.craft(id);assert.equal(result.success,false);assert.equal(result.input.repairRecordId,id);
    assert.equal(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first(),null);
    const archived=await record(f,id),snapshot=JSON.parse(archived.item_json);
    assert.equal(snapshot.destructionSource,'WORKSHOP_EQUIPMENT_CRAFT');assert.equal(snapshot.instanceId,'1');assert.equal(snapshot.equipmentId,'101');assert.equal(snapshot.level,10);assert.equal(snapshot.revision,11);assert.equal(snapshot.recipeId,f.recipeId);
    assert.deepEqual(snapshot.basePower,{total:100,pve:100,pvp:100});
    assert.equal((await forgeAccountState(f.env,f.user)).records[0].recordId,id);
    const other={id:8,role:'OWNER'};assert.equal((await forgeAccountState(f.env,other)).records.length,0);
    await assert.rejects(quote(f,id,'foreign-repair-quote-01',other),/내 파괴 기록/);
    const q=await quote(f,id,'repair-valid-quote-001');assert.equal(q.cost.coinCost,100000000000);assert.equal(q.cost.itemCode,'PINGDU_REPAIR_COUPON');assert.equal(q.cost.itemQuantity,1);assert.equal(q.cost.levelMode,'PREVIOUS');
    await assert.rejects(restore(f,q,'foreign-repair-use-01',other),/내 견적/);
    const r=await restore(f,q,'repair-valid-use-0001');assert.equal(r.level,10);assert.equal(r.outcome,'RESTORED');assert.notEqual(r.instanceId,'1');
    const restored=await f.p('SELECT x.user_id,x.equipment_id,s.level FROM user_equipment_instances x JOIN equipment_forge_states_v1 s ON s.instance_id=x.id WHERE x.id=?',r.instanceId).first();
    assert.deepEqual(Object.fromEntries(Object.entries(restored).map(([k,v])=>[k,Number(v)])),{user_id:7,equipment_id:101,level:10});
    assert.equal(await f.p('SELECT * FROM user_equipment_loadout WHERE instance_id=?',r.instanceId).first(),null);
    assert.equal(await f.coin(),8900000000000);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),1);assert.equal(await f.quantity('MASTER_STAR'),80);assert.equal(await f.quantity('QA_MATERIAL'),97);assert.equal((await f.pity()).failures,1);
    assert.equal((await restore(f,q,'repair-valid-use-0001')).replayed,true);assert.equal((await f.craft(id)).replayed,true);
    assert.equal(await f.coin(),8900000000000);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),1);
    await assert.rejects(quote(f,id,'repair-after-used-001'),/내 파괴 기록/);
    assert.equal((await record(f,id)).restored_instance_id,r.instanceId);
  });
  test(`${dialect}: archive and late craft failures roll back input, costs and pity; retries create one repair record`,async t=>{
    const f=await fixture(t),id='repair-craft-rollback1';let rolls=0;
    for(const sql of ['INSERT INTO equipment_forge_destroyed_v1','INSERT INTO workshop_craft_receipts_v1668']){
      f.fail(sql);await assert.rejects(f.craft(id,'1',()=>{rolls++;return 9999}),/INJECTED_FAILURE/);f.fail('');
      assert.equal(await record(f,id),null);assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());assert.equal(await f.coin(),12000000000000);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal(await f.quantity('QA_MATERIAL'),100);assert.equal((await f.pity()).failures,0);
    }
    const r=await f.craft(id,'1',()=>{rolls++;return 0});assert.equal(rolls,1);assert.equal(r.success,false);assert.equal(r.input.repairRecordId,id);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM equipment_forge_destroyed_v1').first()).n),1);
  });
  test(`${dialect}: repair transaction failure and insufficient coupon never lose costs or claim the record`,async t=>{
    const f=await fixture(t),id='repair-cost-rollback1';await f.craft(id);const q=await quote(f,id,'repair-rollback-quote1');
    await f.p("UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code='PINGDU_REPAIR_COUPON'").run();
    await assert.rejects(restore(f,q,'repair-missing-coupon1'),/부족/);assert.equal((await record(f,id)).restored_instance_id,null);assert.equal(await f.coin(),9000000000000);
    await f.p("UPDATE cnine_user_inventory SET quantity=2 WHERE user_id=7 AND item_code='PINGDU_REPAIR_COUPON'").run();
    f.fail('UPDATE equipment_forge_quotes_v1 SET consumed_by');await assert.rejects(restore(f,q,'repair-rollback-use01'),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.coin(),9000000000000);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),2);assert.equal((await record(f,id)).restored_instance_id,null);
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='FORGE_RESTORE'").first()).n),0);
    assert.equal((await restore(f,q,'repair-rollback-use01')).level,10);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),1);
  });
  test(`${dialect}: concurrent repair quotes cannot restore or charge the same record twice`,async t=>{
    const f=await fixture(t),id='repair-concurrent-01';await f.craft(id);
    const q1=await quote(f,id,'repair-concurrent-q1'),q2=await quote(f,id,'repair-concurrent-q2');
    const results=await Promise.allSettled([restore(f,q1,'repair-concurrent-u1'),restore(f,q2,'repair-concurrent-u2')]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await f.coin(),8900000000000);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),1);
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='FORGE_RESTORE'").first()).n),1);
  });
  test(`${dialect}: successful conversion produces no repair record even with repair enabled`,async t=>{
    const f=await fixture(t);const r=await f.craft('repair-success-no-archive','1',()=>0);
    assert.equal(r.success,true);assert.equal(r.input.consumed,true);assert.equal(r.input.repairRecordId,null);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM equipment_forge_destroyed_v1').first()).n),0);
  });
}

test('PostgreSQL: suppressing archive insertion rolls back the entire failed craft',async t=>{
  const f=await equipmentFixture(t,true);await saveEquipmentCraftRecipe(f.env,f.user,repairDraft(f));
  await f.pg.exec('CREATE FUNCTION qa_suppress_repair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER qa_no_repair BEFORE INSERT ON equipment_forge_destroyed_v1 FOR EACH ROW EXECUTE FUNCTION qa_suppress_repair();');
  await assert.rejects(f.craft('repair-suppressed-archive'));
  assert.equal(await f.coin(),12000000000000);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal(await f.quantity('QA_MATERIAL'),100);assert.equal((await f.pity()).failures,0);assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
});

test('existing Eastern CMS correction is atomic, preserves costs/launch flags and is idempotent',async t=>{
  const f=await equipmentFixture(t,true);await f.p("UPDATE character_equipment_items SET code='EQ_1788486888336' WHERE id=102").run();
  await saveEquipmentCraftRecipe(f.env,f.user,{...repairDraft(f),isActive:false,equipmentCraft:{...repairDraft(f).equipmentCraft,failureRepairable:false}});
  const expected=await inspectEasternCraftRepair(f.pg);
  await applyEasternCraftRepair(f.pg,{expected,actorId:7,dryRun:true});assert.deepEqual(await inspectEasternCraftRepair(f.pg),expected);
  await f.pg.exec('CREATE FUNCTION qa_suppress_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'QA_AUDIT_FAILURE\'; END $$; CREATE TRIGGER qa_no_audit BEFORE INSERT ON admin_logs FOR EACH ROW EXECUTE FUNCTION qa_suppress_audit();');
  await assert.rejects(applyEasternCraftRepair(f.pg,{expected,actorId:7,dryRun:false}),/QA_AUDIT_FAILURE/);assert.deepEqual(await inspectEasternCraftRepair(f.pg),expected);
  await f.pg.exec('DROP TRIGGER qa_no_audit ON admin_logs');
  const result=await applyEasternCraftRepair(f.pg,{expected,actorId:7,dryRun:false});assert.equal(JSON.parse(result.after[0].policy_raw).failureRepairable,true);assert.equal(result.after[0].is_active,expected[0].is_active);assert.equal(result.after[0].master_star_cost,expected[0].master_star_cost);
  assert.equal((await applyEasternCraftRepair(f.pg,{expected,actorId:7,dryRun:false})).replayed,true);
});

test('existing Eastern CMS correction refuses concurrent operator changes',async t=>{
  const f=await equipmentFixture(t,true);await f.p("UPDATE character_equipment_items SET code='EQ_1788486888336' WHERE id=102").run();await saveEquipmentCraftRecipe(f.env,f.user,repairDraft(f));
  const expected=await inspectEasternCraftRepair(f.pg);await f.p('UPDATE workshop_recipes_v1668 SET master_star_cost=20000000 WHERE id=?',f.recipeId).run();
  await assert.rejects(applyEasternCraftRepair(f.pg,{expected,actorId:7,dryRun:false}),/CMS changed/);assert.equal(Number((await inspectEasternCraftRepair(f.pg))[0].master_star_cost),20000000);
});
