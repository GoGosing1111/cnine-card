import test from 'node:test';
import assert from 'node:assert/strict';
import cms from './fixtures/equipment-forge-cms-20260922.json' with {type:'json'};
import {forgeFixture} from './helpers/forge-db.mjs';
import {FORGE_RUNTIME_KEY,validateForgePolicy,forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {forgePolicyReadiness} from '../shared/equipment-forge-cms-v1.mjs';
import {forgeQuote,executeForge,forgeAccountState,forgeEquipmentBonus,forgeEquipmentBonuses} from '../functions/_equipment_forge_transactions.js';
import {protectionDrop,assertProtectionGrant} from '../functions/_forge_protection_drop.js';
const rid=()=>crypto.randomUUID(),startCoins=9000000000000;
export function confirmedForgeDraft(){const p=structuredClone(cms);for(const s of p.steps)if(s.level<8)s.protectionQuantity=0;return p;}
async function fixture(t,postgres){
 const f=await forgeFixture(t,{postgres,productionEquipmentRequests:true}),policy=confirmedForgeDraft();policy.mode='TEST';await f.setting(FORGE_RUNTIME_KEY,policy);
 await f.p('UPDATE users SET coin=? WHERE id=7',startCoins).run();
 await f.p("UPDATE cnine_user_inventory SET quantity=10000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 for(const code of ['EQUIPMENT_PROTECTION_TICKET','PINGDU_REPAIR_COUPON']){
  await f.p('INSERT INTO inventory_items(code,name,rarity,image_url) VALUES(?,?,?,?)',code,code,'SPECIAL','/test.png').run();
  await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,100)',code).run();
 }
 return {...f,policy};
}
async function level(f,n){await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,?,1) ON CONFLICT(instance_id) DO UPDATE SET level=excluded.level,revision=equipment_forge_states_v1.revision+1',f.instanceId,n).run();}
const quote=(f,protectedAttempt=false)=>forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId,useProtection:protectedAttempt});
const run=(f,q,roll)=>executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},q.kind,{randomInt:()=>roll});

test('captured production r4 remains OFF and null is not silently approved as zero',()=>{
 const raw=validateForgePolicy(cms);assert.equal(raw.mode,'OFF');assert.equal(forgePolicyReadiness(raw).ready,false);
 assert.equal(forgePolicyReadiness(raw).completedSteps,2);
 const confirmed=validateForgePolicy(confirmedForgeDraft());assert.equal(forgePolicyReadiness(confirmed).completedSteps,4);
 assert.equal(confirmed.steps[0].destroyPpm,null);assert.equal(confirmed.steps[7].protectionQuantity,0);
 assert.equal(confirmed.restoration.coinCost,100000000000);
 assert.throws(()=>validateForgePolicy({...confirmed,steps:confirmed.steps.map((s,i)=>i? s:{...s,protectionQuantity:-1})}),{code:'FORGE_POLICY'});
});
test('CMS protection source rates are exact (including scrapyard 0.9998%) and clear-only',()=>{
 for(const s of cms.protection.sources){
  assert.equal(protectionDrop(cms,s.content,{cleared:true,randomInt:()=>s.chancePpm-1}).length,1);
  assert.deepEqual(protectionDrop(cms,s.content,{cleared:true,randomInt:()=>s.chancePpm}),[]);
  for(const c of [{cleared:false},{cleared:true,eligible:false}])assert.deepEqual(protectionDrop(cms,s.content,{...c,randomInt:()=>{throw Error('must not roll');}}),[]);
 }
 assert.deepEqual(protectionDrop(cms,'BOX',{cleared:true,randomInt:()=>0}),[]);
 assert.throws(()=>assertProtectionGrant({sourceType:'BOX',triggerType:'OPEN',rewards:protectionDrop(cms,'TOWER',{cleared:true,randomInt:()=>0})},cms),{code:'FORGE_PROTECTION_SOURCE'});
});
for(const postgres of [false,true]){const db=postgres?'PostgreSQL':'SQLite';
 test(`${db}: +1..+8 protection unavailable; unset destruction is blocked without charges`,async t=>{
  const f=await fixture(t,postgres);
  for(let n=0;n<8;n++){await level(f,n);await assert.rejects(()=>quote(f,true),{code:n<6?'FORGE_POLICY_PENDING':'FORGE_PROTECTION_UNAVAILABLE'});}
  assert.equal(await f.coin(),startCoins);assert.equal(await f.qty('MASTER_STAR'),10000000);assert.equal(await f.qty('EQUIPMENT_PROTECTION_TICKET'),100);
 });
 test(`${db}: +7..+10 unprotected boundaries and exact large costs on every normal slot`,async t=>{
  const f=await fixture(t,postgres);
  for(const slot of ['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'])for(let n=6;n<10;n++){
   await f.p('UPDATE character_equipment_items SET slot=? WHERE id=1',slot).run();await level(f,n);
   const s=f.policy.steps[n];
   for(const [roll,outcome] of [[s.successPpm-1,'SUCCESS'],[s.successPpm,'MAINTAIN'],[s.successPpm+s.maintainPpm-1,'MAINTAIN']]){
    await level(f,n);const coins=await f.coin(),stars=await f.qty('MASTER_STAR'),q=await quote(f),r=await run(f,q,roll);
    assert.equal(r.outcome,outcome);assert.equal(r.level,n+(outcome==='SUCCESS'?1:0));
    assert.equal(await f.coin(),coins-s.coinCost);assert.equal(await f.qty('MASTER_STAR'),stars-s.itemQuantity);
    assert.deepEqual(r.power,forgePower(10000,r.level));
   }
  }
  await level(f,10);await assert.rejects(()=>quote(f),{code:'FORGE_MAX_LEVEL'});
 });
 test(`${db}: conditional QA only — explicit 0% destruction at +1..+6 charges configured costs`,async t=>{
  const f=await fixture(t,postgres);for(const s of f.policy.steps)if(s.level<6)s.destroyPpm=0;await f.setting(FORGE_RUNTIME_KEY,f.policy);
  for(let n=0;n<6;n++)for(const [roll,outcome] of [[0,'SUCCESS'],[999999,'MAINTAIN']]){await level(f,n);const coins=await f.coin(),stars=await f.qty('MASTER_STAR'),r=await run(f,await quote(f),roll);assert.equal(r.outcome,outcome);assert.equal(await f.coin(),coins-f.policy.steps[n].coinCost);assert.equal(await f.qty('MASTER_STAR'),stars-f.policy.steps[n].itemQuantity);await assert.rejects(()=>quote(f,true),{code:'FORGE_PROTECTION_UNAVAILABLE'});}
 });
 test(`${db}: protected +9/+10 consumes 1/3 on SUCCESS, MAINTAIN and PROTECTED once`,async t=>{
  const f=await fixture(t,postgres);
  for(const n of [8,9])for(const [roll,outcome] of [[0,'SUCCESS'],[500000,'MAINTAIN'],[999999,'PROTECTED']]){
   await level(f,n);const coins=await f.coin(),stars=await f.qty('MASTER_STAR'),tickets=await f.qty('EQUIPMENT_PROTECTION_TICKET'),q=await quote(f,true),body={requestId:rid(),quoteId:q.quoteId};
   const r=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>roll});
   assert.equal(r.outcome,outcome);assert.equal(await f.qty('EQUIPMENT_PROTECTION_TICKET'),tickets-f.policy.steps[n].protectionQuantity);
   assert.equal(await f.coin(),coins-f.policy.steps[n].coinCost);assert.equal(await f.qty('MASTER_STAR'),stars-f.policy.steps[n].itemQuantity);
   await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>{throw Error('reroll');}});
   assert.equal(await f.coin(),coins-f.policy.steps[n].coinCost);assert.equal((await forgeAccountState(f.env,f.user)).records.length,0);
   assert.equal((await forgeAccountState(f.env,f.user)).items[0].equipped,true);
  }
 });
 test(`${db}: destruction and coupon + 1000억 restore preserve +8, no expiry, replay and rollback`,async t=>{
  const f=await fixture(t,postgres);await level(f,8);const q=await quote(f),d=await run(f,q,850000);
  assert.equal(d.outcome,'DESTROY');assert.equal((await f.p('SELECT * FROM user_equipment_loadout WHERE user_id=7').all()).results.length,0);
  await f.p("UPDATE equipment_forge_destroyed_v1 SET destroyed_at='2000-01-01T00:00:00.000Z' WHERE record_id=?",d.recordId).run();
  const rq=await forgeQuote(f.env,f.user,{requestId:rid(),kind:'RESTORE',recordId:d.recordId}),body={requestId:rid(),quoteId:rq.quoteId},coins=await f.coin();
  // Production has no global UNIQUE(request_id). Another feature's matching ID
  // must never receive the restored level or become the restoration pointer.
  await f.p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,request_id) VALUES(7,1,'OTHER_FEATURE',?)",body.requestId).run();
  f.fail('UPDATE equipment_forge_destroyed_v1 SET restored_instance_id');await assert.rejects(()=>executeForge(f.env,f.user,body,'RESTORE'));
  assert.equal(await f.coin(),coins);assert.equal(await f.qty('PINGDU_REPAIR_COUPON'),100);assert.equal((await f.p("SELECT * FROM user_equipment_instances WHERE user_id=7 AND source_type='FORGE_RESTORE'").all()).results.length,0);
  f.fail('');const r=await executeForge(f.env,f.user,body,'RESTORE');assert.equal(r.level,8);assert.equal(await f.coin(),coins-100000000000);assert.equal(await f.qty('PINGDU_REPAIR_COUPON'),99);
  await executeForge(f.env,f.user,body,'RESTORE');assert.equal(await f.coin(),coins-100000000000);assert.equal(await f.qty('PINGDU_REPAIR_COUPON'),99);
  assert.equal((await f.p("SELECT * FROM user_equipment_instances WHERE user_id=7 AND source_type='FORGE_RESTORE'").all()).results.length,1);
  assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM equipment_forge_states_v1 s JOIN user_equipment_instances x ON x.id=s.instance_id WHERE x.source_type='OTHER_FEATURE'").first()).n),0);
  await assert.rejects(()=>forgeQuote(f.env,f.user,{requestId:rid(),kind:'RESTORE',recordId:d.recordId}),{code:'FORGE_RECORD'});
 });
 test(`${db}: real CMS insufficient funds / stars / protection and policy OFF fail closed`,async t=>{
  const f=await fixture(t,postgres);await level(f,9);const q=await quote(f,true);
  await f.p('UPDATE users SET coin=14999999999 WHERE id=7').run();await assert.rejects(()=>run(f,q,0),{code:'FORGE_FUNDS'});
  await f.p('UPDATE users SET coin=? WHERE id=7',startCoins).run();await f.p("UPDATE cnine_user_inventory SET quantity=149999 WHERE user_id=7 AND item_code='MASTER_STAR'").run();await assert.rejects(()=>run(f,q,0),{code:'FORGE_MATERIAL'});
  await f.p("UPDATE cnine_user_inventory SET quantity=10000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();await f.p("UPDATE cnine_user_inventory SET quantity=2 WHERE user_id=7 AND item_code='EQUIPMENT_PROTECTION_TICKET'").run();await assert.rejects(()=>run(f,q,0),{code:'FORGE_MATERIAL'});
  await f.setting(FORGE_RUNTIME_KEY,{...f.policy,mode:'OFF'});await assert.rejects(()=>run(f,q,0),{code:'FORGE_OFF'});assert.equal(await f.coin(),startCoins);
 });
 test(`${db}: +9/+10 power is identical in batch and single-user reads, SUIT excluded`,async t=>{
  const f=await fixture(t,postgres);for(const n of [8,9,10]){await level(f,n);const expected=forgePower(10000,n);assert.deepEqual(await forgeEquipmentBonus(f.env,7),{pve:expected.pve-9000,pvp:expected.pvp-1000});assert.deepEqual((await forgeEquipmentBonuses(f.env,[7,8])).get(7),await forgeEquipmentBonus(f.env,7));}
  await f.p("UPDATE character_equipment_items SET slot='SUIT' WHERE id=1").run();assert.deepEqual(await forgeEquipmentBonus(f.env,7),{pve:0,pvp:0});await assert.rejects(()=>quote(f),{code:'FORGE_NOT_OWNED'});
 });
}
