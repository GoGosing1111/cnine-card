import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {polishStateKey,decodePolishState,attachPolishInventory,equipmentGrowthRuntime} from '../functions/_equipment_growth.js';

const source=(id='1')=>({schemaVersion:1,instanceId:id,userId:7,attempts:5,rolls:73,levels:[1,1,1,1,1],values:[2,.5,3,2,.5]});
const raw=async(f,id)=>(await f.p('SELECT value FROM app_meta WHERE key=?',polishStateKey(id,7)).first())?.value??null;
const save=(f,state)=>f.setting(polishStateKey(state.instanceId,state.userId),state);
const output=async(f,requestId)=>await f.p("SELECT id FROM user_equipment_instances WHERE user_id=7 AND request_id=? AND source_type='WORKSHOP_EQUIPMENT'",requestId).first();

for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(`${dialect}: workshop inherits all polish into the exact output, inventory and equipped combat; replay does not duplicate`,async t=>{
  const f=await equipmentFixture(t,postgres),s=source();await save(f,s);await save(f,{...source('2'),values:[4,1,6,4,1]});
  const r=await f.craft('polish-inherit-success','1',()=>0),x=await output(f,r.requestId);
  assert(r.success&&r.polishInherited);assert.deepEqual(JSON.parse(await raw(f,x.id)),{...s,instanceId:String(x.id)});
  assert.deepEqual(JSON.parse(await raw(f,'1')),s);assert.equal((await raw(f,'2')),JSON.stringify({...source('2'),values:[4,1,6,4,1]}));
  assert.equal((await f.p('SELECT level FROM equipment_forge_states_v1 WHERE instance_id=?',x.id).first()),null);
  const [item]=await attachPolishInventory(f.env,7,[{instanceId:String(x.id),code:'QA_102'}]);assert.deepEqual(item.polish.values,s.values);assert.match(item.polishSummary,/공격력 \+2/);
  await f.p("UPDATE user_equipment_loadout SET instance_id=? WHERE user_id=7 AND slot='WEAPON'",x.id).run();
  const runtime=await equipmentGrowthRuntime(f.env,7);assert.deepEqual(runtime.polished[0].values,s.values);
  const balance=await f.coin(),replay=await f.craft(r.requestId,'1',()=>{throw Error('no reroll')});
  assert(replay.replayed&&replay.polishInherited);assert.deepEqual(replay.output.polish,r.output.polish);assert.equal(await f.coin(),balance);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_equipment_instances WHERE request_id=?",r.requestId).first()).n),1);
 });
 test(`${dialect}: failed rolls and saved fractional values survive without recalculation`,async t=>{
  const f=await equipmentFixture(t,postgres),s={...source(),attempts:0,rolls:11,levels:[0,0,0,0,0],values:[0,0,0,0,0]};await save(f,s);
  const failed=await f.craft('polish-preserve-failure');assert.equal(failed.success,false);assert.deepEqual(JSON.parse(await raw(f,'1')),s);
  const result=await f.craft('polish-zero-success-rolls','1',()=>0),x=await output(f,result.requestId);
  assert.deepEqual(JSON.parse(await raw(f,x.id)),{...s,instanceId:String(x.id)});assert.equal(result.output.polish.rolls,11);
 });
 test(`${dialect}: a late failure rolls back delivery and growth, and retry retains its roll but copies latest valid source`,async t=>{
  const f=await equipmentFixture(t,postgres),s=source();await save(f,s);let rolls=0;
  f.fail('INSERT INTO workshop_craft_receipts_v1668');await assert.rejects(f.craft('polish-inherit-rollback','1',()=>{rolls++;return 0}),/INJECTED_FAILURE/);f.fail('');
  assert.equal(await output(f,'polish-inherit-rollback'),null);assert.equal(await f.coin(),12000000000000);assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
  const next={...s,attempts:6,rolls:74,levels:[2,1,1,1,1],values:[4,.5,3,2,.5]};await save(f,next);
  const r=await f.craft('polish-inherit-rollback','1',()=>{rolls++;return 9999}),x=await output(f,r.requestId);
  assert.equal(rolls,1);assert(r.success);assert.deepEqual(JSON.parse(await raw(f,x.id)),{...next,instanceId:String(x.id)});
 });
 test(`${dialect}: source changing after snapshot rolls back all costs and can safely retry`,async t=>{
  const f=await equipmentFixture(t,postgres),s=source();await save(f,s);
  const batch=f.env.DB.batch.bind(f.env.DB);let changed=false;
  f.env.DB.batch=async statements=>{if(!changed){changed=true;await save(f,{...s,rolls:74});}return batch(statements);};
  await assert.rejects(f.craft('polish-snapshot-race','1',()=>0));assert.equal(await f.coin(),12000000000000);assert.equal(await output(f,'polish-snapshot-race'),null);
  const r=await f.craft('polish-snapshot-race','1',()=>{throw Error('no reroll')});assert.equal(r.output.polish.rolls,74);
 });
 test(`${dialect}: invalid source growth blocks the upgrade before spending; clean inputs create no phantom polish`,async t=>{
  const f=await equipmentFixture(t,postgres);await save(f,{...source(),attempts:4});
  await assert.rejects(f.craft('polish-corrupt-source','1',()=>0),/연마 기록/);assert.equal(await f.coin(),12000000000000);assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
  const r=await f.craft('polish-clean-input-ok','2',()=>0),x=await output(f,r.requestId);assert.equal(await raw(f,x.id),null);assert.equal(r.polishInherited,undefined);
 });
 test(`${dialect}: a pending pre-fix plan inherits growth and completed receipt replays the new result`,async t=>{
  const f=await equipmentFixture(t,postgres);f.fail('INSERT INTO workshop_craft_logs_v1668');await assert.rejects(f.craft('polish-old-pending-plan','1',()=>0));f.fail('');await save(f,source());
  const old=JSON.parse((await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?','polish-old-pending-plan').first()).plan_json);assert.equal(old.result.polishInherited,undefined);
  const r=await f.craft('polish-old-pending-plan','1',()=>{throw Error('no reroll')});assert(r.polishInherited);assert.deepEqual((await f.craft(r.requestId)).output.polish,r.output.polish);
 });
}

test('PostgreSQL: suppressed growth insertion cannot commit an upgraded item or its costs',async t=>{
 const f=await equipmentFixture(t,true);await save(f,source());
 await f.pg.exec("CREATE FUNCTION qa_block_polish_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER qa_block_polish_copy BEFORE INSERT ON app_meta FOR EACH ROW WHEN (NEW.key LIKE 'equipment_polish_instance_v1:7:%') EXECUTE FUNCTION qa_block_polish_copy();");
 await assert.rejects(f.craft('polish-trigger-rollback','1',()=>0));assert.equal(await f.coin(),12000000000000);assert.equal(await output(f,'polish-trigger-rollback'),null);assert.ok(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());assert.deepEqual(decodePolishState(await raw(f,'1'),'1',7),source());
});
