import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryPityFixture} from './helpers/mercenary-pity-fixture.mjs';
import {MERCENARY_LEVEL_RULES,mercenaryLevelState,mercenaryLevelStateFromStorage,mercenaryLevelStorageLevel,levelProgress,planMercenaryBreakthrough,attachMercenaryLevel,applyMercenaryLevelStats} from '../shared/mercenary-level-v1.mjs';
import {mercenaryGrowthSummary} from '../shared/mercenary-growth-review-v2.mjs';
import {readMercenaryLevelState,releasedMercenaryLevelSummary} from '../functions/_mercenary_level_policy.js';
import {runPreparedMercenaryLevel,mercenaryLevelReceipt} from '../functions/_mercenary_level.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {zeroDeploymentSnapshot} from '../shared/mercenary-zero-v1.mjs';
import {validateLevelReceipt} from '../mercenary-codex/leveling/client.mjs';
import {growMercenary} from '../functions/_mercenary_account.js';

const request=revision=>({requestId:crypto.randomUUID(),mercenaryCode:'V-049',revision});
const terminal={level:21,experience:0,breakthroughMask:15,revision:5};

test('21 is terminal; 22, missing final breakthrough and terminal XP are rejected',()=>{
 assert.equal(MERCENARY_LEVEL_RULES.maxLevel,21);
 assert.deepEqual(mercenaryLevelState(terminal),terminal);
 for(const change of [{level:22},{level:100},{breakthroughMask:7},{experience:1}])assert.throws(()=>mercenaryLevelState({...terminal,...change}));
 assert.equal(mercenaryLevelStorageLevel(terminal),20);
 assert.deepEqual(mercenaryLevelStateFromStorage({...terminal,level:20}),terminal);
 assert.equal(mercenaryLevelState({...terminal,level:20}).level,20,'historical snapshot validation does not rewrite captured levels');
});

for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(`${engine}: level 20 final success reaches 21 once; direct requests cannot spend materials or reach 22`,async t=>{
  const f=await mercenaryPityFixture(t,postgres);
  await f.setState('V-049',{level:20,experience:300,breakthroughMask:7,revision:4});
  const inventory=async()=>JSON.stringify((await f.p('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results);
  const beforeInventory=await inventory(),beforeCoin=await f.coin(),body=request(4);
  const success=await runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',{randomInt:()=>0});
  assert.deepEqual(success.result.after,terminal);assert.equal(success.result.complete,true);
  validateLevelReceipt(success,body.requestId);
  assert.deepEqual((await runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',{randomInt:()=>assert.fail('rerolled')})).result,success.result);
  assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-049'),terminal);
  assert.equal(Number((await f.p("SELECT level FROM user_mercenary_levels_v1 WHERE user_id=7 AND mercenary_code='V-049'").first()).level),20,'durable final checkpoint encoding needs no schema or account migration');
  const state=await f.call('state');assert.equal(state.status,200);const card=state.body.cards.find(c=>c.code==='V-049');
  assert.equal(card.growth.level,21);assert.equal(card.breakthroughPity,null);
  const progress=levelProgress(f.policy,card.growth,card);assert.equal(progress.complete,true);assert.equal(progress.requiredXp,0);assert.equal(progress.percent,100);
  const summary=await releasedMercenaryLevelSummary(f.env,7);assert.equal(summary.rows.find(c=>c.code==='V-049').level,21);
  for(const action of ['preview','train','breakthrough']){
   const reply=await f.call(action,{...request(5),...(action==='breakthrough'?{}:{materials:[{code:'V-049',quantity:100}]})});
   assert.equal(reply.body.code,'MERCENARY_LEVEL_MAX');assert.ok(reply.status>=400);
  }
  assert.equal(await inventory(),beforeInventory);assert.equal(await f.coin(),beforeCoin);
  assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-049'),terminal);
  assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM joint_operations_v1').first()).n),1);
 });

 test(`${engine}: existing final completion becomes 21 on current reads without rewriting rows or old receipts`,async t=>{
  const f=await mercenaryPityFixture(t,postgres),before={level:20,experience:300,breakthroughMask:7,revision:4};
  const result=planMercenaryBreakthrough({policy:f.policy,state:before,target:{code:'V-049'},roll:0});
  result.after.level=20;
  result.growth={before:mercenaryGrowthSummary(f.policy.growth,before),after:mercenaryGrowthSummary(f.policy.growth,result.after)};
  await f.setState('V-049',result.after);
  const id=crypto.randomUUID(),plan={action:'BREAKTHROUGH',mercenaryCode:'V-049',policyRaw:JSON.stringify(f.policy),result};
  await f.p("INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,?,?,?,?,'COMPLETED',?)",id,7,'MERCENARY_LEVEL_V1','legacy-cap21',JSON.stringify(plan),'2026-10-24').run();
  const rawBefore=await f.p("SELECT * FROM user_mercenary_levels_v1 WHERE user_id=7 AND mercenary_code='V-049'").first();
  assert.equal((await f.call('state')).body.cards.find(c=>c.code==='V-049').growth.level,21);
  const old=await mercenaryLevelReceipt(f.env,f.user,id);assert.deepEqual(old.result,result);validateLevelReceipt(old,id);
  assert.deepEqual(await f.p("SELECT * FROM user_mercenary_levels_v1 WHERE user_id=7 AND mercenary_code='V-049'").first(),rawBefore);
  for(const mode of ['PVE','PVP']){
   const current=attachMercenaryLevel(zeroDeploymentSnapshot(),f.policy,rawBefore);
   const historical={...current,level:20,mercenaryLevel:{...current.mercenaryLevel,level:20}};
   const now=buildMercenaryFighter(current,'A',mode,buildFighter),oldActor=buildMercenaryFighter(historical,'A',mode,buildFighter);
   applyMercenaryLevelStats(now);applyMercenaryLevelStats(oldActor);
   assert.equal(now.mercenaryLevel.level,21);assert.equal(oldActor.mercenaryLevel.level,20);
   assert.ok(now.attack>oldActor.attack);assert.ok(now.maxHp>oldActor.maxHp);
  }
 });
}

test('legacy growth endpoint remains closed and cannot bypass the cap',async()=>{
 await assert.rejects(()=>growMercenary(),{code:'MERCENARY_UPGRADE_PENDING'});
});
