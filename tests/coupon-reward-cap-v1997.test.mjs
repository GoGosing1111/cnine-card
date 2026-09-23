import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {redeemChuseokCoinCoupon} from '../functions/_chuseok_coupon.js';

const server=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
const adminHtml=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const start=server.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES=');
const end=server.indexOf('let verifiedRewardMessageV1276ReadyPromise',start);
assert.ok(start>=0&&end>start,'쿠폰 보상 한도 정의 구간을 찾을 수 있어야 합니다.');
const {verifiedMessageRewardSpec,couponRewardSpec}=Function(`${server.slice(start,end)};return {verifiedMessageRewardSpec,couponRewardSpec};`)();

test('코인 쿠폰 100억과 인증 메시지 50억 한도는 분리 유지한다',()=>{
  assert.equal(couponRewardSpec('COIN').max,10_000_000_000);
  assert.equal(verifiedMessageRewardSpec('COIN').max,5_000_000_000);
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

test('CMS도 보상 종류별 최대값을 즉시 표시하고 100억 초과 입력을 차단한다',()=>{
  assert.match(admin,/COUPON_REWARD_META=\{COIN:\{label:'코인',max:10000000000\}/);
  assert.match(admin,/amount\.max=String\(meta\.max\)/);
  assert.match(admin,/rewardAmount>meta\.max/);
  assert.match(adminHtml,/admin-v1276\.js\?v=2050-verified-coin-50eok/);
  assert.match(adminHtml,/coupon-100eok-20260918/);
});

test('쿠폰 한도 회귀 검사가 운영 출시 게이트에 포함된다',()=>{
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:coupon/);
});

test('CMS 발급은 100억을 그대로 전송하고 100억+1은 요청 전에 거부한다',async()=>{
  const fields={couponRewardType:{value:'COIN'},couponRewardAmount:{value:'10000000000',setAttribute(){}},couponCode:{value:'CAP100-QA'},couponMax:{value:'1'},createPermanentCouponBtn:{disabled:false}};
  const requests=[],alerts=[];
  const source=admin.slice(admin.indexOf('const COUPON_REWARD_META='),admin.indexOf('async function toggleCoupon('));
  const {syncCouponRewardForm,createPermanentCouponV3}=Function('$','document','api','alert','setBusy','loadCoupons',source+';return {syncCouponRewardForm,createPermanentCouponV3}')(
    selector=>fields[selector.slice(1)],{addEventListener(){}},async(path,options)=>{requests.push(JSON.parse(options.body));return {coupon:{id:1,reward_amount:10000000000}};},message=>alerts.push(message),(button,busy)=>{button.disabled=busy;},async()=>{});
  syncCouponRewardForm();assert.equal(fields.couponRewardAmount.max,'10000000000');
  await createPermanentCouponV3();assert.equal(requests.length,1);assert.equal(requests[0].rewardAmount,10000000000);
  fields.couponCode.value='OVER-CAP';fields.couponRewardAmount.value='10000000001';
  await createPermanentCouponV3();assert.equal(requests.length,1);assert.match(alerts.at(-1),/10,000,000,000/);
});

test('PostgreSQL에서 모든 발급 경로의 100억 저장·수령·재시도와 초과 차단을 검증한다',async(t)=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE users(id bigint PRIMARY KEY,coin bigint);INSERT INTO users VALUES(1,9000000000);
    CREATE TABLE coupons(id bigserial PRIMARY KEY,code text UNIQUE,reward_coin bigint,reward_type text,reward_amount bigint,starts_at text,ends_at text,max_uses bigint,used_count bigint DEFAULT 0,is_active bigint DEFAULT 1,created_by bigint,deleted_at text,updated_at text);
    CREATE TABLE coupon_redemptions(coupon_id bigint,user_id bigint,reward_coin bigint,reward_type text,reward_amount bigint,operation_key text,PRIMARY KEY(coupon_id,user_id));
    CREATE TABLE coin_logs(user_id bigint,change_amount bigint,balance_after bigint,reason text);
    CREATE TABLE admin_logs(admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
  `);
  const client={async query(input){const result=await pg.query(input.text,input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)},json=(value,status=200)=>Response.json(value,{status});
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const createSource=server.slice(server.indexOf("    if(path==='admin/coupon-create-permanent-v3')"),server.indexOf("    if(path==='admin/users/card-grant')"));
  const create=new AsyncFunction('path','request','env','requirePermission','readBody','releaseDeletedCouponCode','ensureGoldenAxe','json',server.slice(start,end)+createSource);
  const redeemSource=server.slice(server.indexOf("    if(path==='coupon/redeem'"),server.indexOf("    if(path==='admin/daily-quests')"));
  const redeem=new AsyncFunction('path','request','env','authenticate','readBody','redeemLandCoupon','redeemWishTicketCoupon','redeemOldAxeCoupon','redeemChuseokCoinCoupon','profile','isRandomDrawExcluded','json',server.slice(start,end)+redeemSource);
  const request=body=>new Request('https://qa.test/api/coupon',{method:'POST',body:JSON.stringify(body)});
  let count=0;
  for(const path of ['admin/coupon-create-permanent-v3','admin/coupons','admin/coupons-v2']){
    const code='COIN-100EOK-'+count,body={code,rewardType:'COIN',rewardAmount:10000000000,maxUses:1};
    const call=payload=>create(path,request(payload),env,async()=>({id:99}),r=>r.json(),async()=>{},async()=>{},json);
    const made=await call(body);assert.equal(made.status,201);const {coupon}=await made.json();assert.equal(Number(coupon.reward_coin),10000000000);assert.equal(Number(coupon.reward_amount),10000000000);
    for(const amount of [10000000001,0,-1,1.5])assert.equal((await call({...body,code:'INVALID-'+count,rewardAmount:amount})).status,400);
    const claim=operationKey=>redeem('coupon/redeem',request({code,operationKey}),env,async()=>({id:1}),r=>r.json(),async()=>null,async()=>null,async()=>null,redeemChuseokCoinCoupon,async(_env,user)=>user,()=>false,json);
    const first=await claim('CAP100-QA-KEY-'+count);assert.equal(first.status,200);const result=await first.json();assert.equal(result.rewardCoin,10000000000);assert.equal(Number(result.user.coin),9000000000+(++count)*10000000000);
    const replay=await claim('CAP100-QA-KEY-'+(count-1));assert.equal((await replay.json()).replayed,true);
    assert.equal((await claim('DIFFERENT-OPERATION-KEY')).status,409);
  }
  const rows=sql=>pg.query(sql).then(r=>r.rows);
  assert.equal(Number((await rows('SELECT coin FROM users'))[0].coin),39000000000);
  assert.equal((await rows('SELECT * FROM coupons')).length,3);
  assert.equal((await rows('SELECT * FROM coin_logs')).length,3);
  assert((await rows('SELECT * FROM coupon_redemptions')).every(r=>Number(r.reward_coin)===10000000000&&Number(r.reward_amount)===10000000000));
});
