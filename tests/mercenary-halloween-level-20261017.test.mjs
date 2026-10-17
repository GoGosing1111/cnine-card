import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenLevelFixture} from './helpers/halloween-level-fixture.mjs';
import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
import {mercenaryLevelRequiredXp,mercenaryLevelXpMultiplier,initialMercenaryLevel} from '../shared/mercenary-level-v1.mjs';
import {readMercenaryLevelState,attachReleasedMercenaryLevels} from '../functions/_mercenary_level_policy.js';
import {runPreparedMercenaryLevel} from '../functions/_mercenary_level.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';

const regular='V-001';
const training=(code,extra={})=>({requestId:crypto.randomUUID(),mercenaryCode:code,revision:0,materials:[{code:regular,quantity:38}],...extra});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 할로윈 7종 성장 목록·전수·돌파`,async t=>{
  const f=await halloweenLevelFixture(t,postgres),state=await f.call('state');
  assert.equal(state.status,200);assert.equal(state.body.enabled,true);
  for(const card of HALLOWEEN_MERCENARIES){
    const shown=state.body.cards.find(c=>c.code===card.code);assert.ok(shown,card.code);
    assert.equal(shown.rank,'SS');assert.equal(shown.name,card.name);assert.ok(shown.sourceArt);
    assert.equal(mercenaryLevelXpMultiplier({...shown,edition:'NORMAL'}),5);
    assert.equal(mercenaryLevelRequiredXp(f.growthPolicy,1,shown),3750);
    const request=training(card.code),preview=await f.call('preview',request);
    assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.after.level,2);assert.equal(preview.body.after.experience,50);
    const result=await f.call('train',request);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.result.requiredXpMultiplier,5);
    assert.deepEqual(result.body.result.after,preview.body.after);
    const replay=await f.call('train',request);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.result,result.body.result);
    const snapshots=await attachReleasedMercenaryLevels(f.env,new Map([[7,limitedDeploymentSnapshot(card.code)]]));
    assert.equal(snapshots.get(7).level,2);assert.equal(snapshots.get(7).mercenaryLevel.version,2);
  }
  assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',regular).first()).total_copies),1000-7*38);
  const identical=await f.call('train',training('V-980',{revision:1,materials:[{code:'V-980',quantity:1}]}));
  assert.equal(identical.status,200);assert.equal(identical.body.result.xp,300);
  const protectedCard=await f.call('train',training('V-980',{revision:2,materials:[{code:'V-980',quantity:1}]}));
  assert.equal(protectedCard.body.code,'MERCENARY_LEVEL_DUPLICATES');
  assert.equal((await f.call('train',training('V-980'),8)).status,403);
  assert.equal((await f.call('train',training('V-980'))).status,409);
  // All milestone thresholds use the same limited 5x rule; a successful final
  // breakthrough stays at level 20 and never consumes the protected original.
  for(const [i,level] of [5,10,15,20].entries()){
    const xp=mercenaryLevelRequiredXp(f.growthPolicy,level,{code:'V-980'}),revision=10+i;
    await f.p('UPDATE user_mercenary_levels_v1 SET level=?,experience=?,breakthrough_mask=?,revision=? WHERE user_id=7 AND mercenary_code=?',level,xp,(1<<i)-1,revision,'V-980').run();
    const request={requestId:crypto.randomUUID(),mercenaryCode:'V-980',revision};
    const result=await runPreparedMercenaryLevel(f.env,f.user,request,'BREAKTHROUGH',{randomInt:()=>0});
    assert.equal(result.result.success,true);assert.equal(result.result.after.level,Math.min(level+1,20));assert.equal(result.result.complete,level===20);
  }
  assert.equal(Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-980'").first()).total_copies),1);
  assert.equal(await f.coin(),10000000);
});

test('PostgreSQL: 할로윈 성장 저장 실패는 재료·성장 함께 롤백',async t=>{
  const f=await halloweenLevelFixture(t),request=training('V-980');
  f.fail('INSERT INTO user_mercenary_levels_v1');assert.equal((await f.call('train',request)).status,503);f.fail('');
  assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-980'),initialMercenaryLevel());
  assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',regular).first()).total_copies),1000);
  assert.equal((await f.call('train',request)).status,200);
});
