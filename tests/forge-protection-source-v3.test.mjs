import test from 'node:test';import assert from 'node:assert/strict';
import {protectionDrop,assertProtectionGrant} from '../functions/_forge_protection_drop.js';
import {planForgeProtectionDrop} from './helpers/forge-held-runtime.mjs';
import {forgeRuntimeDraft,validateForgePolicy} from '../shared/equipment-forge-policy-v1.mjs';
test('protection sources are explicit gameplay-only drafts, with no default operating rate',async()=>{
 const draft=forgeRuntimeDraft();assert.ok(draft.protection.sources.every(s=>!s.enabled&&s.chancePpm===null));
 assert.deepEqual(await planForgeProtectionDrop({get DB(){throw Error('DB during release hold');}},'TOWER',{cleared:true}),[]);
 const invalid=forgeRuntimeDraft();invalid.protection.sources[0].content='BLACK_MIRACLE';assert.throws(()=>validateForgePolicy(invalid),{code:'FORGE_POLICY'});
});
test('protection rare roll boundary, failure/budget exclusion, frozen reward and box denial',()=>{
 const p=forgeRuntimeDraft();p.protection.itemCode='TEST_PROTECTION';p.protection.sources[0]={content:'TOWER',enabled:true,chancePpm:10,quantity:1};
 const yes=protectionDrop(p,'TOWER',{cleared:true,randomInt:()=>9});assert.equal(yes.length,1);assert.deepEqual(protectionDrop(p,'TOWER',{cleared:true,randomInt:()=>10}),[]);
 for(const conditions of[{cleared:false},{cleared:true,eligible:false}])assert.deepEqual(protectionDrop(p,'TOWER',{...conditions,randomInt:()=>{throw Error('ineligible roll');}}),[]);
 for(const source of['BOX','BLACK_MIRACLE','PRIME','SHOP','MERCENARY_OPEN']){assert.deepEqual(protectionDrop(p,source,{cleared:true}),[]);assert.throws(()=>assertProtectionGrant({sourceType:source,triggerType:'CLEAR',rewards:yes},p),{code:'FORGE_PROTECTION_SOURCE'});}
 assert.doesNotThrow(()=>assertProtectionGrant({sourceType:'TOWER',triggerType:'CLEAR',rewards:yes},p));
 assert.throws(()=>assertProtectionGrant({sourceType:'TOWER',triggerType:'CLEAR',rewards:[{...yes[0],entryId:3}]},p),{code:'FORGE_PROTECTION_SOURCE'});
});
