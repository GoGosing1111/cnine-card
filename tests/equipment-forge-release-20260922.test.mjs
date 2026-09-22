import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import * as held from './helpers/forge-held-runtime.mjs';
import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {handleForgeRuntime} from '../functions/_equipment_forge_routes.js';
import {handleEquipmentForgePublic} from '../functions/_equipment_forge_public.js';
import {readActiveForgeProtectionPolicy,planForgeProtectionDrop,guardForgeProtectionGrant} from '../functions/_forge_protection_drop.js';
import release from '../docs/releases/equipment-forge-approved-20260922.json' with {type:'json'};
import cms from './fixtures/equipment-forge-cms-20260922.json' with {type:'json'};
import {forgeFixture} from './helpers/forge-db.mjs';
import {jointHash} from '../functions/_joint_transactions.js';
import {readReleasedForgePolicy,validateEquipmentForgeRelease} from '../functions/_equipment_forge_release.js';
import {prepareTowerForgeProtectionClear,prepareTowerForgeProtectionClearReady} from '../functions/_forge_tower_protection.js';
import {EQUIPMENT_FORGE_RELEASE_KEY,EQUIPMENT_FORGE_RELEASE_ENABLED,FORGE_RUNTIME_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
const completePolicy=()=>structuredClone(release.policy);
const document=()=>({schemaVersion:1,approved:true,approvedBy:7,approvedAt:'2026-09-22T00:00:00Z',approvalReference:'ISOLATED TEST ONLY — never a production approval',policy:completePolicy()});
const enabledRuntime={handleForgeRuntime,handleEquipmentForgePublic,readActiveForgeProtectionPolicy,planForgeProtectionDrop};
test('explicit equipment release is enabled, global V3 stays held, and rollback still performs no DB work',async()=>{
 assert.equal(EQUIPMENT_FORGE_RELEASE_ENABLED,true);assert.equal(FORGE_RUNTIME_RELEASE_ENABLED,true);assert.equal(V3_JOINT_RELEASE_ENABLED,false);
 assert.equal(validateEquipmentForgeRelease(release).revision,6);
 const env={get DB(){throw Error('DB touched while held');}};
 assert.equal(await held.readReleasedForgePolicy(env),null);assert.deepEqual(await held.prepareTowerForgeProtectionClear(env,{}),{statements:[],reward:null});
 for(const edit of [{approved:false},{policy:cms},{approvedBy:0},{approvalReference:'missing'}])assert.throws(()=>validateEquipmentForgeRelease({...document(),...edit}),{code:'FORGE_RELEASE_PENDING'});
});
test('actual live hooks use equipment-only readiness, not a global tower/re-ascent release',()=>{
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 assert.match(api,/FORGE_RUNTIME_RELEASE_ENABLED\?forgeEquipmentBonuses/);assert.match(api,/FORGE_RUNTIME_RELEASE_ENABLED&&isForgeRuntimePath/);
 const tower=api.slice(api.indexOf("if(path==='tower/fight'"),api.indexOf("if(path==='deck-synergy/status'"));
 assert.match(tower,/if\(result==='WIN'\)[\s\S]*prepareTowerForgeProtectionClear[\s\S]*towerClearWrites.push\(\.\.\.forgeProtection.statements\)[\s\S]*await env.DB.batch\(towerClearWrites\)/);
 assert.match(tower,/forgeProtectionReward/);
 assert.match(readFileSync(new URL('../js/tower-v1038.js',import.meta.url),'utf8'),/d.forgeProtectionReward.quantity/);
});
test('unrelated rewards incur no forge lookup, but protected-item grants still fail closed',async()=>{
 const noDb={get DB(){throw Error('unrelated reward touched forge DB');}};
 await guardForgeProtectionGrant(noDb,{rewards:[{rewardType:'INVENTORY_ITEM',rewardRef:'VEHICLE_PART_TIRE',quantity:1}]});
 await assert.rejects(()=>guardForgeProtectionGrant(noDb,{rewards:[{rewardType:'INVENTORY_ITEM',rewardRef:'EQUIPMENT_PROTECTION_TICKET',quantity:1}]}),/touched forge DB/);
 const changed=document();changed.policy.protection.itemCode='UNAPPROVED_PROTECTION';
 assert.throws(()=>validateEquipmentForgeRelease(changed),{code:'FORGE_RELEASE_PENDING'});
});
for(const postgres of [false,true]){
 const name=postgres?'PostgreSQL':'SQLite';
 test(`${name}: release requires an explicit immutable complete snapshot and valid hash`,async t=>{
  const f=await forgeFixture(t,{postgres}),doc=document();
  await f.p('DELETE FROM app_meta WHERE key=?',EQUIPMENT_FORGE_RELEASE_KEY).run();
  await assert.rejects(()=>readReleasedForgePolicy(f.env,{enabled:true}),{code:'FORGE_RELEASE_PENDING'});
  await f.setting(EQUIPMENT_FORGE_RELEASE_KEY,{document:doc,sha256:await jointHash(doc)});
  assert.equal((await readReleasedForgePolicy(f.env,{enabled:true})).restoration.coinCost,100000000000);
  doc.policy.restoration.coinCost=0;await f.setting(EQUIPMENT_FORGE_RELEASE_KEY,{document:doc,sha256:'bad'});
  await assert.rejects(()=>readReleasedForgePolicy(f.env,{enabled:true}),{code:'FORGE_RELEASE_DOCUMENT'});
 });
 test(`${name}: isolated final gate + approved document + OWNER switch run actual routes without V3 activation`,async t=>{
  const f=await forgeFixture(t,{postgres}),runtime=await enabledRuntime,doc=document();
  for(const code of ['EQUIPMENT_PROTECTION_TICKET','PINGDU_REPAIR_COUPON'])await f.p('INSERT INTO inventory_items(code,name,is_active) VALUES(?,?,1)',code,code).run();
  await f.setting(EQUIPMENT_FORGE_RELEASE_KEY,{document:doc,sha256:await jointHash(doc)});
  const publicKey='equipment_forge_public_settings_v1';await f.setting(publicKey,{schemaVersion:1,revision:1,publicVisible:true,executionMode:'OFF',notice:'TEST'});
  const call=async(path,method='GET',body)=>{const request=new Request('https://game.test/api/'+path,{method,headers:{authorization:'Bearer local-account-7',origin:'https://game.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const deps={...f.deps,requirePermission:f.deps.authenticate,forgeRandomInt:()=>0};const response=await (path==='admin/equipment-forge'?runtime.handleEquipmentForgePublic:runtime.handleForgeRuntime)({path,request,env:f.env,deps});return {status:response.status,body:await response.json()};};
  assert.equal((await call('character/equipment/forge/state')).body.canEnhance,false);
  assert.equal(await runtime.readActiveForgeProtectionPolicy(f.env),null);
  assert.equal((await call('admin/equipment-forge','PATCH',{expectedRevision:1,settings:{publicVisible:true,executionMode:'ON',notice:'TEST'}})).status,200);
  assert.equal((await call('character/equipment/forge/state')).body.canEnhance,true);
  const statusResponse=await runtime.handleForgeRuntime({path:'character/equipment/forge/status',request:new Request('https://game.test/api/character/equipment/forge/status'),env:f.env,deps:{...f.deps,authenticate:()=>{throw Error('public status must not authenticate');}}});
  const status=await statusResponse.json();assert.equal(statusResponse.status,200);assert.equal(status.canEnhance,true);assert.equal(status.canRestore,true);assert.equal(status.wallet,undefined);assert.equal(status.items,undefined);assert.equal(status.policy.steps[0].destroyPpm,0);
  // Ordinary CMS draft edits cannot change the released costs.
  await f.setting(FORGE_RUNTIME_KEY,{...doc.policy,steps:doc.policy.steps.map(s=>({...s,coinCost:1}))});
  for(const content of ['TOWER','SCRAPYARD','COW_ROOM'])assert.equal((await runtime.planForgeProtectionDrop(f.env,content,{cleared:true,randomInt:()=>0}))[0].quantity,1);
  await f.p('UPDATE users SET coin=1000000000 WHERE id=7').run();await f.p("UPDATE cnine_user_inventory SET quantity=100000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  const q=await call('character/equipment/forge/quote','POST',{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId});assert.equal(q.status,200);
  assert.equal(q.body.cost.coinCost,100000000);
  const body={requestId:crypto.randomUUID(),quoteId:q.body.quoteId},r=await call('character/equipment/forge/enhance','POST',body);assert.equal(r.body.outcome,'SUCCESS');assert.equal(await f.coin(),900000000);
  await call('admin/equipment-forge','PATCH',{expectedRevision:2,settings:{publicVisible:true,executionMode:'OFF',notice:'TEST'}});
  assert.equal(await runtime.readActiveForgeProtectionPolicy(f.env),null);
  assert.equal((await call('character/equipment/forge/enhance','POST',body)).body.replayed,true);
  assert.equal((await call('character/equipment/forge/quote','POST',{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId})).status,423);
  await call('admin/equipment-forge','PATCH',{expectedRevision:3,settings:{publicVisible:false,executionMode:'OFF',notice:'TEST'}});
  assert.equal((await call('character/equipment/forge/state')).status,403);
  assert.equal(await f.p("SELECT value FROM app_meta WHERE key='v3_joint_release_20260913-joint1'").first(),null);
 });
 test(`${name}: live tower freezes one first-clear protection roll; grant/progression roll back together`,async t=>{
  const f=await forgeFixture(t,{postgres}),policy=completePolicy();
  await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('EQUIPMENT_PROTECTION_TICKET','장비 보호권','SPECIAL','/test.png')").run();
  await f.p('INSERT INTO tower_user_progress(user_id,highest_floor) VALUES(7,0)').run();
  const input={userId:7,seasonId:1,floorNo:1};
  const first=await prepareTowerForgeProtectionClearReady(f.env,policy,input,{randomInt:()=>0});
  assert.equal(first.reward.quantity,1);assert.equal(await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='EQUIPMENT_PROTECTION_TICKET'").first(),null);
  const batch=statements=>f.DB.batch([f.p('UPDATE tower_user_progress SET highest_floor=1 WHERE user_id=7'),...statements]);
  f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>batch(first.statements));assert.equal(Number((await f.p('SELECT highest_floor FROM tower_user_progress WHERE user_id=7').first()).highest_floor),0);
  f.fail('');const retry=await prepareTowerForgeProtectionClearReady(f.env,{...policy,protection:{...policy.protection,sources:[]}},input,{randomInt:()=>{throw Error('reroll');}});await batch(retry.statements);
  assert.equal(await f.qty('EQUIPMENT_PROTECTION_TICKET'),1);assert.equal(Number((await f.p('SELECT highest_floor FROM tower_user_progress WHERE user_id=7').first()).highest_floor),1);
  const replay=await prepareTowerForgeProtectionClearReady(f.env,policy,input,{randomInt:()=>{throw Error('reroll');}});assert.equal(replay.replayed,true);assert.deepEqual(replay.statements,[]);
  const miss=await prepareTowerForgeProtectionClearReady(f.env,policy,{...input,floorNo:2},{randomInt:()=>10000});assert.equal(miss.reward,null);await f.DB.batch(miss.statements);assert.equal(await f.qty('EQUIPMENT_PROTECTION_TICKET'),1);
 });
}
test('offline release SQL checks the exact CMS snapshot, stays OFF and is repeat-safe in PostgreSQL',async t=>{
 const f=await forgeFixture(t,{postgres:true}),doc=document(),directory=mkdtempSync(join(tmpdir(),'cnine-forge-release-test-'));
 await f.p('DELETE FROM app_meta WHERE key=?',EQUIPMENT_FORGE_RELEASE_KEY).run();
 // This path is the exact disposable directory returned by mkdtempSync.
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const input=join(directory,'isolated-approval.json'),output=join(directory,'candidate.sql');
 writeFileSync(input,JSON.stringify(doc));
 execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/prepare-equipment-forge-release.mjs',import.meta.url)),input,output],{stdio:'pipe'});
 const sql=readFileSync(output,'utf8'),publicKey='equipment_forge_public_settings_v1';
 await f.setting(FORGE_RUNTIME_KEY,doc.policy);await f.setting(publicKey,{schemaVersion:1,revision:1,publicVisible:true,executionMode:'OFF',notice:'TEST'});
 const beforeCoin=await f.coin();await f.pg.exec(sql);await f.pg.exec(sql);
 assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM admin_logs WHERE action_type='EQUIPMENT_FORGE_RELEASE_PREPARE'").first()).n),1);
 assert.equal(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',publicKey).first()).value).executionMode,'OFF');
 assert.equal(await f.coin(),beforeCoin);assert.equal((await readReleasedForgePolicy(f.env,{enabled:true})).restoration.coinCost,100000000000);
 await f.setting(FORGE_RUNTIME_KEY,{...doc.policy,revision:doc.policy.revision+1});
 await assert.rejects(()=>f.pg.exec(sql),/CMS policy changed/);await f.pg.exec('ROLLBACK');
 assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM admin_logs WHERE action_type='EQUIPMENT_FORGE_RELEASE_PREPARE'").first()).n),1);
});
