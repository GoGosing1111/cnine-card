import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
const adminHtml=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const start=server.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES=');
const end=server.indexOf('let verifiedRewardMessageV1276ReadyPromise',start);
assert.ok(start>=0&&end>start,'쿠폰 보상 한도 정의 구간을 찾을 수 있어야 합니다.');
const {verifiedMessageRewardSpec,couponRewardSpec}=Function(`${server.slice(start,end)};return {verifiedMessageRewardSpec,couponRewardSpec};`)();

test('코인 쿠폰은 최대 10억까지 허용하고 인증 메시지 보상 한도는 분리 유지한다',()=>{
  assert.equal(couponRewardSpec('COIN').max,1_000_000_000);
  assert.equal(verifiedMessageRewardSpec('COIN').max,100_000_000);
  assert.equal(couponRewardSpec('MASTER_STAR').max,1_000_000);
  assert.equal(couponRewardSpec('PREMIUM_CUBE').max,100_000);
});

test('신규·호환 쿠폰 발급 라우트가 모두 쿠폰 전용 한도를 사용한다',()=>{
  const permanentRoute=server.slice(server.indexOf("if(path==='admin/coupon-create-permanent-v3')"),server.indexOf("if(path==='admin/coupons'||path==='admin/coupons-v2')"));
  const compatibleRoute=server.slice(server.indexOf("if(path==='admin/coupons'||path==='admin/coupons-v2')"),server.indexOf("if(path==='admin/users/card-grant')"));
  assert.match(permanentRoute,/const spec=couponRewardSpec\(rewardType\)/);
  assert.match(permanentRoute,/rewardAmount>spec\.max/);
  assert.match(compatibleRoute,/spec=couponRewardSpec\(rewardType\)/);
  assert.match(compatibleRoute,/rewardAmount>Number\(spec\.max/);
});

test('CMS도 보상 종류별 최대값을 즉시 표시하고 10억 초과 입력을 차단한다',()=>{
  assert.match(admin,/COUPON_REWARD_META=\{COIN:\{label:'코인',max:1000000000\}/);
  assert.match(admin,/amount\.max=String\(meta\.max\)/);
  assert.match(admin,/rewardAmount>meta\.max/);
  assert.match(adminHtml,/admin-v1276\.js\?v=2032-ranked-challenger/);
});

test('쿠폰 한도 회귀 검사가 운영 출시 게이트에 포함된다',()=>{
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:coupon/);
});
