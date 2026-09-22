import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {mercenarySnapshotPower,growMercenary} from '../functions/_mercenary_account.js';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {forgeRuntimeDraft,validateForgePolicy,FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge} from './helpers/forge-held-runtime.mjs';

test('all six ranks use approved fixed power and canonical mode stats, ignoring obsolete growth',()=>{
 for(const [rank,power]of Object.entries(MERCENARY_POWER_STANDARD.basePowerByRank))for(const mode of ['PVP','PVE']){
  const snapshot={code:'V-001',rank,statMode:'RANK_FIXED',basePower:1,level:999,combat:{powerGrowthPercentPerLevel:100},skills:[]};
  const fighter=buildMercenaryFighter(snapshot,'A',mode,buildFighter),card=buildFighter({id:1,power,type:'NONE'},5,'A',null,mode);
  assert.equal(mercenarySnapshotPower(snapshot),power);assert.equal(fighter.power,power);assert.equal(fighter.level,1);
  for(const key of ['maxHp','attack','defense','speed'])assert.equal(fighter[key],card[key]);
 }
});
test('future mercenary upgrading cannot touch inventory, balances or growth even with an old request',async()=>{
 const env={get DB(){throw Error('unexpected database access');}};
 await assert.rejects(()=>growMercenary(env,{id:1},{requestId:crypto.randomUUID()},'LEVEL'),{code:'MERCENARY_UPGRADE_PENDING',status:423});
});
test('forge drafts keep unapproved amounts empty but fix the enhancement material to master stars',()=>{
 const draft=validateForgePolicy(forgeRuntimeDraft());assert.ok(draft.steps.every(s=>s.itemCode==='MASTER_STAR'&&s.coinCost===null&&s.itemQuantity===null));
 const invalid=structuredClone(draft);invalid.steps[0].itemCode='STARLIGHT_ARMOR_CORE';assert.throws(()=>validateForgePolicy(invalid),{code:'FORGE_POLICY'});
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: coin plus stars required, failure rolls back both, retry charges once`,async t=>{
 const f=await forgeFixture(t,{postgres}),quote=()=>forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId});
 const pending=structuredClone(f.policy);pending.steps[0].itemQuantity=null;await f.setting(FORGE_RUNTIME_KEY,pending);await assert.rejects(quote,{code:'FORGE_POLICY_PENDING'});
 await f.setting(FORGE_RUNTIME_KEY,f.policy);const q=await quote(),body={requestId:crypto.randomUUID(),quoteId:q.quoteId};
 await f.p("UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE'),{code:'FORGE_MATERIAL'});assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),1);
 await f.p("UPDATE cnine_user_inventory SET quantity=100 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 f.fail('INSERT INTO equipment_forge_states_v1');await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0}));assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);
 f.fail('');const result=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('reroll');}});assert.equal(result.itemCode,'MASTER_STAR');assert.equal(result.itemQuantity,2);
 await executeForge(f.env,f.user,body,'ENHANCE');assert.equal(await f.coin(),9999900);assert.equal(await f.qty('MASTER_STAR'),98);
});
