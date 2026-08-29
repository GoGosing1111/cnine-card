import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {matchPowerScale,pickPowerMatchedOpponent} from '../functions/_territory_war.js';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');

// 가까운 상대가 있으면 방어 횟수가 많아도 먼 상대에게 밀려나지 않는다.
const strict=pickPowerMatchedOpponent([
  {user_id:1,deck_power:101_000,defenses:80},
  {user_id:2,deck_power:108_000,defenses:0},
  {user_id:3,deck_power:130_000,defenses:0}
],100_000);
assert.equal(strict.user_id,1);
assert.equal(strict.match_power_gap_percent,1);

// 5% 이내의 동급 풀에서는 방어 횟수를 분산해 동일 수비수 반복 매칭을 줄인다.
const rotated=pickPowerMatchedOpponent([
  {user_id:1,deck_power:101_000,defenses:9},
  {user_id:2,deck_power:104_500,defenses:1},
  {user_id:3,deck_power:106_000,defenses:0}
],100_000);
assert.equal(rotated.user_id,2);
assert.equal(rotated.match_pool_size,2);
assert.ok(rotated.match_power_gap_percent<=5);

// 최상위·최하위 고립 전투력도 전투를 막지 않고 양 진영 중 최인접 풀만 사용한다.
const outlier=pickPowerMatchedOpponent([
  {user_id:1,deck_power:115_000,defenses:8},
  {user_id:2,deck_power:117_000,defenses:0},
  {user_id:3,deck_power:140_000,defenses:0}
],100_000);
assert.equal(outlier.user_id,2);
assert.equal(outlier.match_power_gap_percent,17);
assert.equal(pickPowerMatchedOpponent([],100_000),null);

const balanced=matchPowerScale(100_000,108_000,15);
assert.equal(balanced.active,false);
assert.equal(balanced.attackerScale,1);
assert.equal(balanced.defenderScale,1);

const weakAttacker=matchPowerScale(100_000,303_000,15);
assert.equal(weakAttacker.active,true);
assert.equal(weakAttacker.attackerScale,1);
assert.ok(Math.abs(weakAttacker.defenderScale-(115_000/303_000))<1e-9);

const strongAttacker=matchPowerScale(303_000,100_000,15);
assert.equal(strongAttacker.active,true);
assert.ok(Math.abs(strongAttacker.attackerScale-(115_000/303_000))<1e-9);
assert.equal(strongAttacker.defenderScale,1);

assert.match(server,/ORDER BY ABS\(w\.deck_power-\?\) ASC/);
assert.match(server,/LIMIT 12/);
assert.doesNotMatch(server,/w\.deck_power BETWEEN \? AND \?/);
assert.match(server,/matchPowerGapPercent/);
assert.match(server,/matchPowerEqualized/);
assert.match(server,/sourceAttackerPower/);

console.log('territory power match v1912: ok');
