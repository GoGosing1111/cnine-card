import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NIGHTMARE_PROGRESSION,nightmareProgressionKey,nightmareProgressionPlan,pveDifficultyRuntime } from '../functions/_pve_nightmare.js';

const settings={hpPercent:200,attackPercent:160,defensePercent:150,speedPercent:120,rewardPercent:250};
const anchor={power:400000,reward:8000,displayOrder:22,sortOrder:22};
const plan=nightmareProgressionPlan({anchorPower:anchor.power,anchorReward:anchor.reward,anchorDisplayOrder:anchor.displayOrder,anchorSortOrder:anchor.sortOrder,settings});

assert.equal(plan.length,9);
assert.deepEqual(plan.map(item=>item.key),NIGHTMARE_PROGRESSION.map(item=>item.key));
assert.deepEqual(plan.map(item=>item.pveDisplayOrder),[23,24,25,26,27,28,29,30,31]);
assert.deepEqual([
  '조로','우치하 사스케','우치하 이타치','젠이츠','렌고쿠 코쥬로','쿄라쿠 슌스이','이타치 암부','셋쇼마루','태양신 루피'
].map(nightmareProgressionKey),plan.map(item=>item.key));

let previousPower=anchor.power;
let previousReward=anchor.reward;
for(const item of plan){
  const runtime=pveDifficultyRuntime({nightmare:settings},{pveTab:'NIGHTMARE',battlePower:item.battlePower,rewardCoin:item.rewardCoin});
  assert.ok(runtime.effectiveBattlePower>previousPower,`${item.key} power must be above the previous boss`);
  assert.ok(runtime.effectiveRewardCoin>previousReward,`${item.key} reward must be above the previous boss`);
  assert.ok(runtime.effectiveBattlePower>=item.effectiveBattlePower);
  assert.ok(runtime.effectiveRewardCoin>=item.effectiveRewardCoin);
  previousPower=runtime.effectiveBattlePower;
  previousReward=runtime.effectiveRewardCoin;
}

assert.equal(plan[0].effectiveBattlePower,440000);
assert.equal(plan[0].effectiveRewardCoin,9200);
assert.equal(plan.at(-1).effectiveBattlePower,1075000);
assert.equal(plan.at(-1).effectiveRewardCoin,25600);

const apiSource=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
assert.match(apiSource,/safe_runtime_upgrade_v1696_nightmare_after_hell_nika/);
assert.match(apiSource,/CASE WHEN name LIKE '%니카%' THEN 0 ELSE 1 END,battle_power DESC/);
assert.match(apiSource,/nightmareProgressionPlan\(\{/);
assert.match(apiSource,/SET battle_power=\?,reward_coin=\?,pve_display_order=\?,sort_order=\?/);

console.log('PVE Nightmare v1696: HELL Nika anchored power, reward and ordering progression verified');
