import test from 'node:test';
import assert from 'node:assert/strict';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {regionKillLoot} from '../shared/legion-region-loot-v1.mjs';
import {readRegionPolicy,saveRegionPolicy,regionRewardCatalog,validateRegionPolicy} from '../functions/_legion_regions.js';
import {legionRegionDefaults,LEGION_REGIONS} from '../shared/legion-regions-v1.mjs';
for(const postgres of [false,true])test(`regional TEST/live, bundle, boss guarantee, rollback and mode recovery (${postgres?'PG':'SQLite'})`,async t=>{
  const f=await legionFixture({postgres,regions:true});t.after(f.close);
  let policy=legionRegionDefaults();policy.mode='ON';
  await assert.rejects(saveRegionPolicy(f.env,f.owner,policy),{code:'HUNT_REGION_CATALOG'});
  await seedRegionalCatalog(f);
  policy.mode='TEST';for(const d of policy.difficulties){d.loot.bossSetPercent=100;d.loot.bossUniquePercent=100;}
  policy=await saveRegionPolicy(f.env,f.owner,policy);
  const catalog=await regionRewardCatalog(f.env,{live:true});assert.equal(catalog.length,31);
  for(const r of LEGION_REGIONS){const items=regionKillLoot({regionId:r.id,items:catalog,regionLoot:{bossSetPercent:100,bossUniquePercent:100}},{boss:true},()=>0);assert.equal(items.length,2);assert.ok(items.every(i=>i.regionId===r.id));}
  const base=(await f.call('admin/legion-hunt')).body.policy;base.mode='ON';assert.equal((await f.call('admin/legion-hunt',{policy:base},{method:'PATCH'})).status,200);
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:options.difficulty,huntDurationMs:1000,regionId:options.regionId,...options.dropPolicy},timeLimit:1000,eventTimes:[100,200],timeline:[{seq:1,combatAtMs:100,huntKill:true,boss:true},{seq:2,combatAtMs:200,type:'RESULT',winner:'A'}],outcome:{}},{now:options.now,random:()=>0}),{payload:{}});
  f.setUser(f.player);for(const region of LEGION_REGIONS)assert.equal((await f.call('legion-hunt/start',{regionId:region.id,difficulty:'normal',version:5})).status,403,region.id+' must remain locked');
  f.setUser(f.owner);
  assert.equal((await f.call('legion-hunt/start',{regionId:'coast',difficulty:'normal'})).status,409);
  const run=async()=>{const r=await f.call('legion-hunt/start',{regionId:'coast',difficulty:'normal',version:5});assert.equal(r.status,200,JSON.stringify(r.body));const id=r.body.id;await f.call('legion-hunt/begin',{id});f.clock.now+=250;const drop=(await f.call('legion-hunt/reveal',{id,seq:1})).body.drop;assert.ok(drop.rewards.length===2);await f.call('legion-hunt/claim',{id,dropId:drop.id,token:drop.token,...drop.position});return id;};
  const testId=await run();
  policy.mode='ON';await saveRegionPolicy(f.env,f.owner,policy);
  const testReceipt=await f.call('legion-hunt/finish',{id:testId,seq:2});assert.equal(testReceipt.body.liveRewards,false);
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM user_equipment_instances').first()).n),0);
  let id=await run();const current=(await readRegionPolicy(f.env)).policy;current.mode='OFF';await saveRegionPolicy(f.env,f.owner,current);
  assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,423);
  const resume=(await readRegionPolicy(f.env)).policy;resume.mode='ON';await saveRegionPolicy(f.env,f.owner,resume);
  f.fail('INSERT INTO inventory_logs');assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,503);f.fail('');
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM user_equipment_instances').first()).n),0);
  f.loseReply();assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,503);
  const receipt=await f.call('legion-hunt/finish',{id,seq:2});assert.equal(receipt.status,200,JSON.stringify(receipt.body));assert.equal(receipt.body.liveRewards,true);assert.equal(receipt.body.inventory.length,3);
  assert.equal(Number((await f.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='EQUIPMENT_POLISH_STONE'").first()).quantity),5);
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM user_equipment_instances').first()).n),2);
  assert.deepEqual((await f.call('legion-hunt/finish',{id,seq:2})).body,receipt.body);
});
test('regional policy validates bounds and exactly five tiers',()=>{
  const p=legionRegionDefaults();assert.equal(validateRegionPolicy(p).mode,'TEST');
  for(const change of [p=>p.difficulties[0].loot.bossUniquePercent=101,p=>p.regions.pop(),p=>p.testUserIds=[1,1],p=>p.difficulties[0].power=NaN]){const bad=structuredClone(p);change(bad);assert.throws(()=>validateRegionPolicy(bad));}
});
