import test from 'node:test';
import assert from 'node:assert/strict';
import {ardenFixture,ardenCatalog} from './helpers/arden-craft-fixture.mjs';
import {equipmentCraftPolicy} from '../shared/workshop-equipment-craft.mjs';
import {PARTS,draftFor,apply,inspect,verify,hash,protectedState,OP} from '../scripts/ops/arden-craft-20261029.mjs';
import {saveEquipmentCraftRecipe} from '../functions/_workshop_equipment_craft.js';
test('Arden policy requires +15, same slot, exact costs and third-attempt guarantee',()=>{
 for(const p of PARTS){const {draft,policy}=draftFor(p,ardenCatalog);assert.equal(policy.requiredLevel,15);assert.equal(policy.pityAfter,2);assert.equal(policy.failureInputPolicy,'PRESERVE');assert.equal(draft.coinCost,50000000000000);assert.equal(draft.masterStarCost,0);assert.deepEqual(draft.materials,[{itemCode:'ARDEN_ENERGY',quantity:50}]);
  for(const requiredLevel of [null,'',true,14,16,1.5])assert.throws(()=>equipmentCraftPolicy({...draft,equipmentCraft:{...draft.equipmentCraft,requiredLevel}}));
  assert.throws(()=>equipmentCraftPolicy({...draft,masterStarCost:1}),/0/);
 }
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: all four recipes preserve +15 on failures, third attempt grants +0, replay never charges`,async t=>{
 const f=await ardenFixture(t,postgres),initial=await f.ardenState();
 assert.deepEqual(initial.instances.filter(i=>i.equipmentId<100).map(i=>i.id),['201','202','203','204','210']);
 assert(initial.instances.some(i=>i.id==='1'&&i.level===10),'legacy +10 recipe remains selectable');
 for(let p=0;p<4;p++){
  const before=await f.coin(),stock=await f.quantity('ARDEN_ENERGY'),id=String(201+p),original={...await f.p('SELECT * FROM equipment_forge_states_v1 WHERE instance_id=?',id).first()};
  const first=await f.ardenCraft('arden-fail-'+p,p);assert.equal(first.success,false);assert.equal(first.input.level,15);assert.equal(first.input.preserved,true);assert.equal(first.masterStarSpent,0);assert.equal(first.coinSpent,50000000000000);assert.equal(first.pity.failures,1);
  assert.deepEqual({...await f.p('SELECT * FROM equipment_forge_states_v1 WHERE instance_id=?',id).first()},original);
  assert.equal(await f.coin(),before-50000000000000);assert.equal(await f.quantity('ARDEN_ENERGY'),stock-50);assert.equal((await f.ardenCraft('arden-fail-'+p,p)).replayed,true);assert.equal(await f.coin(),before-50000000000000);
  const otherId=p===0?'210':id,second=await f.ardenCraft('arden-fail2-'+p,p,otherId);assert.equal(second.success,false);assert.equal(second.pity.guaranteed,true);
  assert.equal((await f.ardenState()).pity[f.arden[p]].guaranteed,true);if(p<3)assert.equal((await f.ardenState()).pity[f.arden[p+1]].failures,0);
  const third=await f.ardenCraft('arden-pity-'+p,p,id,()=>{throw Error('guaranteed must not roll');});assert.equal(third.success,true);assert.equal(third.output.level,0);assert.equal(third.guaranteed,true);assert.equal(third.pity.failures,0);
  assert.equal(await f.p('SELECT id FROM user_equipment_instances WHERE id=?',id).first(),null);assert.equal(await f.p('SELECT instance_id FROM equipment_forge_states_v1 WHERE instance_id=?',id).first(),null);
  assert.equal(await f.coin(),before-150000000000000);assert.equal(await f.quantity('ARDEN_ENERGY'),stock-150);assert.equal((await f.ardenCraft('arden-pity-'+p,p,id)).replayed,true);
 }
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM inventory_logs WHERE item_code='MASTER_STAR'").first()).n),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM equipment_forge_destroyed_v1').first()).n),0);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='WORKSHOP_EQUIPMENT'").first()).n),4);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM workshop_craft_logs_v1668 WHERE payment_type='COIN' AND master_star_spent=0").first()).n),12);
});
test('only own unequipped +15 same-part input works; insufficient resources and invalid admin edits charge nothing',async t=>{
 const f=await ardenFixture(t),before=await f.coin();
 for(const id of ['202','205','206','207','208','209','999'])await assert.rejects(f.ardenCraft('arden-bad-'+id,0,id),/내 \+15/);
 await f.p("UPDATE cnine_user_inventory SET quantity=49 WHERE user_id=7 AND item_code='ARDEN_ENERGY'").run();await assert.rejects(f.ardenCraft('arden-no-energy'),/재료/);
 await f.p("UPDATE cnine_user_inventory SET quantity=1000 WHERE user_id=7 AND item_code='ARDEN_ENERGY'").run();await f.p('UPDATE users SET coin=49999999999999 WHERE id=7').run();await assert.rejects(f.ardenCraft('arden-no-coin'),/코인/);
 const d=draftFor('TOP',ardenCatalog).draft;await assert.rejects(saveEquipmentCraftRecipe(f.env,f.user,{...d,id:f.arden[0],equipmentCraft:{...d.equipmentCraft,revision:1},outputRef:'118'}),/슬롯/);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM workshop_craft_logs_v1668').first()).n),0);
 assert.equal((await f.ardenState()).pity[f.arden[0]].failures,0);assert.equal(before,1000000000000000);
});
test('PostgreSQL: receipt failure rolls back +15, costs, output and pity; same request preserves its original roll',async t=>{
 const f=await ardenFixture(t,true),before=await f.coin();let rolls=0;
 f.fail('INSERT INTO workshop_craft_receipts_v1668');await assert.rejects(f.ardenCraft('arden-atomic',0,'201',()=>{rolls++;return 999;}),/INJECTED/);f.fail('');
 assert.equal(await f.coin(),before);assert.equal(await f.quantity('ARDEN_ENERGY'),1000);assert.equal((await f.ardenState()).pity[f.arden[0]].failures,0);assert.equal(Number((await f.p('SELECT level FROM equipment_forge_states_v1 WHERE instance_id=201').first()).level),15);
 const retry=await f.ardenCraft('arden-atomic',0,'201',()=>{rolls++;return 1000;});assert.equal(retry.success,true);assert.equal(rolls,1);assert.equal(await f.coin(),before-50000000000000);
});
test('two requests at ceiling consume a +15 instance once; 1000 roll fails at the 10% boundary',async t=>{
 const f=await ardenFixture(t);await f.ardenCraft('arden-boundary-1',0,'201',()=>1000);await f.ardenCraft('arden-boundary-2');
 const r=await Promise.allSettled([f.ardenCraft('arden-race-a'),f.ardenCraft('arden-race-b')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(await f.coin(),850000000000000);assert.equal(await f.quantity('ARDEN_ENERGY'),850);
});
test('four-recipe registration is atomic, protects existing recipes, validates stale snapshots and replays SELECT-only',async t=>{
 const f=await ardenFixture(t,true,{register:false});await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const before=await inspect(f.pg),expectedHash=hash(before),releaseCommit='a'.repeat(40),protectedBefore=await protectedState(f.pg),coin=await f.coin();
 await assert.rejects(apply(f.pg,{expectedHash:'stale',releaseCommit}),/changed/);assert.deepEqual(await inspect(f.pg),before);
 await assert.rejects(apply(f.pg,{expectedHash,releaseCommit,failAfter:2}),/INJECTED_ARDEN/);assert.deepEqual(await inspect(f.pg),before);
 assert((await apply(f.pg,{expectedHash,releaseCommit})).rolledBack);assert.deepEqual(await inspect(f.pg),before);
 await f.pg.exec("ALTER TABLE app_meta ADD CONSTRAINT reject_arden_receipt CHECK(key<>'"+OP+"')");await assert.rejects(apply(f.pg,{expectedHash,releaseCommit,dryRun:false}));await f.pg.exec('ALTER TABLE app_meta DROP CONSTRAINT reject_arden_receipt');assert.deepEqual(await inspect(f.pg),before);
 const done=await apply(f.pg,{expectedHash,releaseCommit,dryRun:false});assert(done.committed);assert((await verify(f.pg)).verified);assert.deepEqual(await protectedState(f.pg),protectedBefore);assert.equal(await f.coin(),coin);
 const replay=await apply({query(sql,args){assert.match(sql,/^SELECT/);return f.pg.query(sql,args);}});assert(replay.replayed);assert.equal(replay.receipt.auditId,done.receipt.auditId);
});
