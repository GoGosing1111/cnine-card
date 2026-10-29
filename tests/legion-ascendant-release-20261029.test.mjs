import test from 'node:test';
import assert from 'node:assert/strict';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {legionRegionDefaults,LEGION_REGIONS} from '../shared/legion-regions-v1.mjs';
import {regionKillLoot} from '../shared/legion-region-loot-v1.mjs';
import {readRegionPolicy,saveRegionPolicy,regionRewardCatalog,validateRegionPolicy,publicRegionHuntPayload,regionBootstrap} from '../functions/_legion_regions.js';
import {releasePolicy} from '../scripts/ops/legion-equipment-release-20261029.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
// Synthetic targets only: production probabilities are private operator inputs.
const config={baseExpectedRuns:210,tierExpectedRuns:Array.from({length:10},(_,i)=>420+i*170)};
function policy(){const p=legionRegionDefaults();p.mode='ON';for(const [i,d]of p.difficulties.entries())Object.assign(d.loot,{eliteSetPercent:i<3?0:.003,bossSetPercent:.06,bossUniquePercent:.015});return releasePolicy(p,config);}
test('private targets tune existing independent rolls without changing zero elites, combat, fields or stone rewards',()=>{
 const p=policy();for(const [i,d]of p.difficulties.entries()){
  const interval=1/(1-(1-d.loot.bossSetPercent/100)*(1-d.loot.bossUniquePercent/100));assert.ok(Math.abs(interval-config.baseExpectedRuns)<.2);
  assert.equal(d.loot.eliteSetPercent,i<3?0:.003);
 }
 for(const bad of [p=>p.ascendantDrops.tiers.pop(),p=>p.ascendantDrops.tiers[0].expectedRuns=0,p=>p.ascendantDrops.tiers[0].tier=2,p=>p.ascendantDrops.tiers[0].expectedRuns=1.1]){const b=policy();bad(b);assert.throws(()=>validateRegionPolicy(b));}
 const hidden=publicRegionHuntPayload({huntPolicy:{regionId:'coast',regionLoot:p.difficulties[0].loot,ascendantDrops:p.ascendantDrops.tiers}});
 assert.equal(hidden.huntPolicy.ascendantDrops,undefined);assert.equal(hidden.huntPolicy.regionLoot.bossSetPercent,undefined);
 assert.equal(regionBootstrap(p,{id:7,role:'USER'}).ascendantAvailable,true);
 assert.ok(!JSON.stringify(regionBootstrap(p,{id:7,role:'USER'})).includes('expectedRuns'));
});
test('all five regions: each tier gets exactly one independent boss roll; uniform slots and old snapshots preserved',()=>{
 const items=ASCENDANT_EQUIPMENT.map(i=>({...i,equipmentTier:i.tier,kind:'ASCENDANT'}));
 for(const region of LEGION_REGIONS)for(const tier of policy().ascendantDrops.tiers){
  const p={regionId:region.id,regionLoot:{},items,ascendantDrops:[{tier:tier.tier,bossPercent:100/tier.expectedRuns}]};
  for(let slot=0;slot<5;slot++){
   let calls=0;const hit=regionKillLoot(p,{boss:true},()=>++calls===1?1/tier.expectedRuns-1e-12:(slot+.1)/5);assert.equal(calls,2);assert.equal(hit.length,1);assert.equal(hit[0].slot,ASCENDANT_EQUIPMENT.filter(i=>i.tier===tier.tier)[slot].slot);
  }
  assert.equal(regionKillLoot(p,{boss:true},()=>1/tier.expectedRuns+1e-12).length,0);
  assert.equal(regionKillLoot(p,{elite:true},()=>0).length,0);
  assert.equal(regionKillLoot({...p,ascendantDrops:undefined},{boss:true},()=>0).length,0);
 }
});
for(const postgres of [false,true])test(`new gear real loot, TEST isolation, failure rollback and lost-response retry (${postgres?'PG':'SQLite'})`,async t=>{
 const f=await legionFixture({postgres,regions:true});t.after(f.close);await seedRegionalCatalog(f);
 let p=policy();p.revision=0;
 await assert.rejects(saveRegionPolicy(f.env,f.owner,p),{code:'HUNT_REGION_CATALOG'});
 for(const [i,g]of ASCENDANT_EQUIPMENT.entries())await f.DB.prepare('INSERT INTO character_equipment_items(id,code,name,rarity,image_url,is_active,is_public) VALUES(?,?,?,?,?,1,1)').bind(300+i,g.code,g.name,g.rarity,g.image).run();
 p.ascendantDrops.tiers.forEach(row=>row.expectedRuns=1);p.mode='TEST';
 for(const d of p.difficulties)Object.assign(d.loot,{bossSetPercent:0,bossUniquePercent:0});
 p=await saveRegionPolicy(f.env,f.owner,p);assert.equal((await regionRewardCatalog(f.env,{live:true,ascendant:true})).length,81);
 const base=(await f.call('admin/legion-hunt')).body.policy;base.mode='ON';assert.equal((await f.call('admin/legion-hunt',{policy:base},{method:'PATCH'})).status,200);
 f.deps.createSession=o=>{const policy={id:o.difficulty,huntDurationMs:1000,regionId:o.regionId,...o.dropPolicy};return Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy,timeLimit:1000,eventTimes:[100,200],timeline:[{seq:1,combatAtMs:100,huntKill:true,boss:true},{seq:2,combatAtMs:200,type:'RESULT',winner:'A'}],outcome:{}},{now:o.now,random:()=>0}),{payload:{huntPolicy:policy}});};
 const run=async()=>{const r=await f.call('legion-hunt/start',{regionId:'coast',difficulty:'normal',version:5});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.payload.huntPolicy.ascendantDrops,undefined);const id=r.body.id;await f.call('legion-hunt/begin',{id});f.clock.now+=250;const drop=(await f.call('legion-hunt/reveal',{id,seq:1})).body.drop;assert.equal(drop.rewards.length,10);await f.call('legion-hunt/claim',{id,dropId:drop.id,token:drop.token,...drop.position});return id;};
 const testId=await run();p.mode='ON';p=await saveRegionPolicy(f.env,f.owner,p);assert.equal((await f.call('legion-hunt/finish',{id:testId,seq:2})).body.liveRewards,false);
 const count=async()=>Number((await f.DB.prepare('SELECT COUNT(*) n FROM user_equipment_instances').first()).n);assert.equal(await count(),0);
 const id=await run();f.fail('INSERT INTO inventory_logs');assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,503);f.fail('');assert.equal(await count(),0);
 f.loseReply();assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,503);
 const done=await f.call('legion-hunt/finish',{id,seq:2});assert.equal(done.status,200,JSON.stringify(done.body));assert.equal(await count(),10);
 assert.deepEqual((await f.call('legion-hunt/finish',{id,seq:2})).body,done.body);assert.equal(await count(),10);
});
