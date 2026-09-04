import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [server,admin,html,packageRaw]=await Promise.all([
  readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),
  readFile(new URL('../admin/admin-v1276.js',import.meta.url),'utf8'),
  readFile(new URL('../admin/index.html',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);
const packageJson=JSON.parse(packageRaw);
const start=server.indexOf('function defaultPvpSettings()');
const end=server.indexOf('async function readPvpSettings',start);
assert.ok(start>=0&&end>start,'PVP 설정 정규화 함수 구간을 찾을 수 있어야 합니다.');
const cleanPvpSettings=Function(`${server.slice(start,end)};return cleanPvpSettings;`)();

test('티어와 최종 순위 코인 보상은 1억을 넘겨도 잘리지 않는다',()=>{
  const settings=cleanPvpSettings({
    tiers:[{id:'grandmaster',name:'그랜드마스터',min:2500,color:'#ff6f91',aura:true,rewardCoin:1_234_567_890,rewardShards:500}],
    rankRewards:[{from:1,to:1,rewardCoin:9_876_543_210,rewardShards:700}]
  });
  assert.equal(settings.tiers[0].rewardCoin,1_234_567_890);
  assert.equal(settings.rankRewards[0].rewardCoin,9_876_543_210);
});

test('코인 보상은 음수를 막고 JavaScript 안전 정수 범위 안에서 정리한다',()=>{
  const settings=cleanPvpSettings({
    tiers:[{id:'bronze',name:'브론즈',min:0,color:'#b87333',rewardCoin:-1,rewardShards:0}],
    rankRewards:[{from:1,to:1,rewardCoin:Number.MAX_VALUE,rewardShards:0}]
  });
  assert.equal(settings.tiers[0].rewardCoin,0);
  assert.equal(settings.rankRewards[0].rewardCoin,Number.MAX_SAFE_INTEGER);
});

test('CMS 코인 입력은 상한 없이 안내하고 새 스크립트 버전을 로드한다',()=>{
  assert.match(admin,/보상 코인 · 한도 없음<\/span><input class="ptCoin" type="number" min="0" step="1"/);
  assert.match(admin,/보상 코인 · 한도 없음<\/span><input class="prCoin" type="number" min="0" step="1"/);
  assert.doesNotMatch(admin,/class="(?:ptCoin|prCoin)"[^>]*max=/);
  assert.match(html,/admin-v1276\.js\?v=2024-core-raid-ticket/);
});

test('랭크전 보상 회귀 검사는 운영 배포 게이트에 포함된다',()=>{
  assert.match(packageJson.scripts['test:ranked-reward']||'',/ranked-reward-cap-v1980\.test\.mjs/);
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:ranked-reward/);
});
