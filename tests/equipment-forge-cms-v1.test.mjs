import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeRuntimeDraft, validateForgePolicy, FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {forgeInputNumber, forgePolicyReadiness} from '../shared/equipment-forge-cms-v1.mjs';
import {handleForgeRuntime} from './helpers/forge-held-runtime.mjs';
import {readForgeRuntime, saveForgeRuntime, forgeQuote, executeForge} from './helpers/forge-held-runtime.mjs';

const request=(f,{method='GET',policy,anonymous=false,role='OWNER',origin='https://game.test'}={})=>handleForgeRuntime({
  path:'admin/equipment-forge/runtime',env:f.env,
  deps:{...f.deps,authenticate:async()=>anonymous?null:{...f.user,role}},
  request:new Request('https://game.test/api/admin/equipment-forge/runtime',{method,headers:{origin,'content-type':'application/json'},...(method==='PATCH'?{body:JSON.stringify({policy})}:{})}),
});

test('percentage editing is exact to 1 ppm and never silently rounds unsupported precision',()=>{
  for(const [input,ppm] of [['',null],['0',0],['0.0001',1],['10.1234',101234],['99.9999',999999],['100',1000000]])assert.equal(forgeInputNumber(input,'percent'),ppm);
  for(const input of ['0.00001','-1','100.0001','1e2','NaN','Infinity'])assert.throws(()=>forgeInputNumber(input,'percent'));
  assert.equal(forgeInputNumber('1000000000000'),1e12);assert.equal(forgeInputNumber(''),null);assert.equal(forgeInputNumber('0'),0);
  for(const input of ['1.5','-1','9007199254740992'])assert.throws(()=>forgeInputNumber(input));
});
test('readiness does not invent policy numbers or consider completion an approval',()=>{
  const draft=forgeRuntimeDraft(),before=structuredClone(draft),info=forgePolicyReadiness(draft,[]);
  assert.equal(info.completedSteps,0);assert.equal(info.ready,false);assert(info.issues.some(issue=>issue.message.includes('MASTER_STAR')));assert.deepEqual(draft,before);
  for(const step of draft.steps)Object.assign(step,{successPpm:100000,maintainPpm:800000,destroyPpm:100000,coinCost:1e12,itemQuantity:1e8,protectionQuantity:10000});
  draft.protection={itemCode:'PROTECT',consume:'ON_ATTEMPT',sources:[{content:'TOWER',enabled:true,chancePpm:1,quantity:1},...draft.protection.sources.slice(1)]};
  draft.restoration={enabled:true,coinCost:0,itemCode:null,itemQuantity:null,levelMode:'ZERO',expiresHours:0};
  const normalized=validateForgePolicy(draft),ready=forgePolicyReadiness(normalized,[{code:'MASTER_STAR',is_active:1},{code:'PROTECT',is_active:1}]);
  assert.equal(ready.completedSteps,10);assert.equal(ready.ready,true);assert.equal(normalized.approved,false);assert.equal(normalized.mode,'OFF');
  assert.equal(forgePolicyReadiness(normalized,[{code:'MASTER_STAR',is_active:1},{code:'PROTECT',is_active:0}]).ready,false);
});
test('malformed rows, shared star/protection item, invalid totals and unsupported modes fail with controlled policy errors',()=>{
  for(const change of [p=>p.steps[0]=null,p=>p.protection.sources[0]=null,p=>p.protection.itemCode='MASTER_STAR',p=>p.mode='ON',p=>p.steps[0].successPpm=99999,p=>Object.assign(p.steps[0],{successPpm:800000,maintainPpm:200000,destroyPpm:100000}),p=>p.restoration.itemQuantity=1]){
    const p=forgeRuntimeDraft();change(p);assert.throws(()=>validateForgePolicy(p),{code:'FORGE_POLICY',status:400});
  }
});

for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: OWNER CMS loads catalog/readiness without creating records or charging`,async t=>{
  const f=await forgeFixture(t,{postgres}),before=await f.coin(),response=await request(f),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.saveScope,'DRAFT_ONLY');assert.equal(body.executionMode,'OFF');assert.equal(body.releaseEnabled,false);
  assert.equal(body.readiness.completedSteps,10);assert.equal(body.readiness.ready,false);assert(body.catalog.some(i=>i.code==='MASTER_STAR'&&i.is_active===1));
  assert.equal(await f.coin(),before);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n),0);
  assert.equal((await request(f,{anonymous:true})).status,401);assert.equal((await request(f,{role:'ADMIN'})).status,403);
 });
 test(`${label}: every step/material/protection/drop/restoration setting round-trips atomically with CAS`,async t=>{
  const f=await forgeFixture(t,{postgres}),policy=validateForgePolicy(f.policy);
  policy.mode='OFF';policy.version='forge-cms-test-20260922';policy.quoteSeconds=900;
  for(const step of policy.steps)Object.assign(step,{successPpm:100000+step.level,maintainPpm:899990-step.level,destroyPpm:10,coinCost:1e12-step.level,itemQuantity:step.level+1,protectionQuantity:step.level+2});
  policy.protection.consume='ON_ATTEMPT';policy.protection.sources.forEach((s,i)=>Object.assign(s,{enabled:true,chancePpm:i+1,quantity:i+1}));
  policy.restoration={enabled:true,coinCost:1e12,itemCode:'FORGE_TEST_PROTECTION',itemQuantity:2,levelMode:'ZERO',expiresHours:87600};
  const response=await request(f,{method:'PATCH',policy}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  assert.deepEqual(body.policy,{...policy,revision:1});assert.equal(body.readiness.ready,true);assert.equal(body.executionMode,'OFF');
  assert.equal((await request(f,{method:'PATCH',policy})).status,409);assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);
  const audit=await f.p("SELECT before_data,after_data FROM admin_logs WHERE target_id=?",FORGE_RUNTIME_KEY).first();assert.deepEqual(JSON.parse(audit.after_data),body.policy);
  f.fail('INSERT INTO admin_logs');await assert.rejects(()=>saveForgeRuntime(f.env,f.user,{...body.policy,quoteSeconds:120}));f.fail('');
  assert.deepEqual(await readForgeRuntime(f.env,{draft:true}),body.policy);
  assert.equal((await request(f,{method:'PATCH',policy:body.policy,origin:'https://other.test'})).status,403);
 });
 test(`${label}: unregistered/inactive materials are rejected before saving or quoting protected attempts`,async t=>{
  const f=await forgeFixture(t,{postgres});
  for(const mutate of [p=>p.protection.itemCode='NOT_REGISTERED',p=>{p.restoration.itemCode='NOT_REGISTERED';p.restoration.itemQuantity=1;}]){
    const policy=structuredClone(f.policy);mutate(policy);await assert.rejects(()=>saveForgeRuntime(f.env,f.user,policy),{code:'FORGE_MATERIAL_CONFIG'});
  }
  await f.p("UPDATE inventory_items SET is_active=0 WHERE code='FORGE_TEST_PROTECTION'").run();
  await assert.rejects(()=>saveForgeRuntime(f.env,f.user,f.policy),{code:'FORGE_MATERIAL_CONFIG'});
  await assert.rejects(()=>forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId,useProtection:true}),{code:'FORGE_MATERIAL_CONFIG'});
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM equipment_forge_quotes_v1').first()).n),0);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n),0);
 });
 test(`${label}: restoration quote cannot extend the configured recovery deadline`,async t=>{
  const f=await forgeFixture(t,{postgres}),now=Date.now(),policy=structuredClone(f.policy);policy.restoration.expiresHours=1;
  await f.setting(FORGE_RUNTIME_KEY,policy);
  const q=await forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId},{now});
  const destroyed=await executeForge(f.env,f.user,{requestId:crypto.randomUUID(),quoteId:q.quoteId},'ENHANCE',{now,randomInt:()=>999999});
  const restore=await forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'RESTORE',recordId:destroyed.recordId},{now:now+3599000});
  assert.equal(Date.parse(restore.expiresAt),now+3600000);
  await assert.rejects(()=>executeForge(f.env,f.user,{requestId:crypto.randomUUID(),quoteId:restore.quoteId},'RESTORE',{now:now+3600001}),{code:'FORGE_QUOTE_EXPIRED'});
  assert.equal(await f.coin(),9999900);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_equipment_instances').first()).n),0);
 });
}
