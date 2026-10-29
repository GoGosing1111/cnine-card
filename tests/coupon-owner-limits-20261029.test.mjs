import test from 'node:test';
import assert from 'node:assert/strict';
import {couponIssueFixture,COUPON_ISSUE_PATHS} from './helpers/coupon-issue-fixture.mjs';
import {couponIssueDay,couponOwnerDailyLimit,createCouponWithinIssueLimit,readCouponIssueLimit} from '../functions/_coupon_issue_limits.js';

test('한국시간 자정 경계와 고정 계정 예외: 닉네임만으로 한도를 면제하지 않는다',()=>{
 assert.equal(couponIssueDay('2026-10-29T14:59:59Z').dayKey,'2026-10-29');
 assert.deepEqual(couponIssueDay('2026-10-29T15:00:00Z'),{dayKey:'2026-10-30',start:'2026-10-29 15:00:00',end:'2026-10-30 15:00:00',createdAt:'2026-10-29 15:00:00'});
 assert.equal(couponOwnerDailyLimit({id:1,role:'OWNER',nickname:'changed'}),null);
 assert.equal(couponOwnerDailyLimit({id:2,role:'OWNER',nickname:'핑크빛유두'}),1e13);
 assert.equal(couponOwnerDailyLimit({id:99,role:'ADMIN'}),null);
});

test('모든 발급 API를 합쳐 1조 10회: 인원 100만도 1조로 집계하고 11회째는 거부',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 for(let i=0;i<10;i++){const r=await f.call({path:COUPON_ISSUE_PATHS[i%3],body:{code:'TEN-'+i,maxUses:i%2?1000000:1}});assert.equal(r.status,201,JSON.stringify(r.body));}
 for(const path of COUPON_ISSUE_PATHS){const r=await f.call({path,body:{code:'OVER-'+path.replaceAll('/','-')}});assert.equal(r.status,409);assert.equal(r.body.code,'COUPON_OWNER_DAILY_LIMIT');assert.equal(r.body.issueLimit.remainingCoin,0);}
 const d=await f.call({path:'admin/coupons',method:'GET'});assert.equal(d.body.issueLimit.issuedCoin,1e13);assert.equal(d.body.issueLimit.countBy,'FACE_VALUE');
 assert.equal((await f.rows('SELECT * FROM coupons')).length,10);assert.equal((await f.rows('SELECT * FROM admin_logs')).length,10);assert.equal((await f.rows('SELECT * FROM joint_atomic_guards_v1')).length,0);
 assert.deepEqual((await f.rows('SELECT coin FROM users ORDER BY id')).map(x=>Number(x.coin)),[9,8,7,5,6]);
});

test('계정별 독립 한도와 핑크빛유두 일일 예외에도 1회 1조 상한을 적용한다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 for(const id of [2,6,5663]){await f.pg.query("INSERT INTO coupons(code,reward_type,reward_amount,max_uses,created_by) VALUES($1,'COIN',10000000000000,1,$2)",['HISTORY-'+id,id]);const r=await f.call({admin:{id,role:'OWNER'},body:{code:'NO-'+id,rewardAmount:1}});assert.equal(r.body.code,'COUPON_OWNER_DAILY_LIMIT');}
 for(let i=0;i<11;i++)assert.equal((await f.call({admin:{id:1,role:'OWNER'},body:{code:'EXEMPT-'+i}})).status,201);
 for(const path of COUPON_ISSUE_PATHS)assert.equal((await f.call({path,admin:{id:1,role:'OWNER'},body:{code:'EXEMPT-OVER',rewardAmount:1e12+1}})).status,400);
 assert.equal((await readCouponIssueLimit(f.env,{id:1,role:'OWNER'})).dailyCoinLimit,null);
 await f.pg.query('UPDATE coupons SET created_at=$1 WHERE created_by=6',['2026-10-01 00:00:00']);
 assert.equal((await f.call({admin:{id:6,role:'OWNER'},body:{code:'FRESH-SIX'}})).status,201);
});

test('더 작은 쿠폰은 금액으로 합산하고 한도 정확히 일치까지만 허용한다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 for(let i=0;i<20;i++)assert.equal((await f.call({body:{code:'HALF-'+i,rewardAmount:5e11}})).status,201);
 assert.equal((await f.call({body:{code:'ONE-EXTRA',rewardAmount:1}})).body.code,'COUPON_OWNER_DAILY_LIMIT');
 for(const rewardAmount of [0,-1,1.5,1e12+1,'NaN'])assert.equal((await f.call({body:{code:'INVALID',rewardAmount}})).status,400);
});

test('삭제·중지·수령·사용 인원 변경·삭제 코드 재발행은 당일 발행량을 환급하지 않는다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 assert.equal((await f.call()).status,201);
 await f.pg.query("UPDATE coupons SET deleted_at=sqlite_now(),is_active=0,used_count=1,max_uses=1 WHERE code='COUPON-QA'");
 assert.equal((await readCouponIssueLimit(f.env,f.owner)).issuedCoin,1e12);
 assert.equal((await f.call()).status,201);
 assert.equal((await readCouponIssueLimit(f.env,f.owner)).issuedCoin,2e12);
 assert.equal((await f.rows('SELECT * FROM coupons')).length,2);
 assert.equal((await f.rows("SELECT * FROM admin_logs WHERE action_type='COUPON_CODE_RELEASE'")).length,1);
 const patch=await f.call({path:'admin/coupons',method:'PATCH',body:{id:2,maxUses:999999,isActive:false}});assert.equal(patch.status,200);
 assert.equal((await readCouponIssueLimit(f.env,f.owner)).issuedCoin,2e12);
});

test('운영에 이미 발행된 당일 쿠폰도 집계하고 어제·다른 아이템·다른 OWNER는 제외한다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 await f.pg.exec(`INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,max_uses,created_by,created_at,deleted_at) VALUES
 ('OLD-LEGACY',100000000000,NULL,0,999999,2,'2026-10-28 15:00:00','2026-10-29 01:00:00'),
 ('YESTERDAY',0,'COIN',1000000000000,1,2,'2026-10-28 14:59:59',NULL),
 ('ITEM',0,'MASTER_STAR',1000000,1,2,'2026-10-29 01:00:00',NULL),
 ('OTHER',0,'COIN',1000000000000,1,6,'2026-10-29 01:00:00',NULL);`);
 const usage=await readCouponIssueLimit(f.env,f.owner,new Date('2026-10-29T10:00:00Z'));assert.equal(usage.issuedCoin,1e11);assert.equal(usage.remainingCoin,9.9e12);
 assert.equal((await readCouponIssueLimit(f.env,f.owner,new Date('2026-10-29T15:00:00Z'))).issuedCoin,0);
});

test('감사 저장 실패는 쿠폰·삭제 코드 이동·집계를 전부 원복하고 재시도는 한 번만 집계한다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 assert.equal((await f.call()).status,201);await f.pg.query("UPDATE coupons SET deleted_at=sqlite_now() WHERE code='COUPON-QA'");
 f.fail('INSERT INTO admin_logs');
 await assert.rejects(createCouponWithinIssueLimit(f.env,f.owner,{code:'COUPON-QA',rewardType:'COIN',rewardAmount:1e12,maxUses:1}),/INJECTED_COUPON_ISSUE_FAILURE/);
 f.fail('');assert.equal((await f.rows("SELECT * FROM coupons WHERE code='COUPON-QA'")).length,1);assert.equal((await f.rows('SELECT * FROM coupons')).length,1);
 assert.equal((await f.rows('SELECT * FROM admin_logs')).length,1);assert.equal((await f.rows('SELECT * FROM joint_atomic_guards_v1')).length,0);
 assert.equal((await f.call()).status,201);assert.equal((await f.call()).body.code,'COUPON_CODE_EXISTS');assert.equal((await readCouponIssueLimit(f.env,f.owner)).issuedCoin,2e12);
});

test('동시 요청은 거래 안에서 최신 합계를 확인해 마지막 1조를 한 번만 발급한다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 await f.pg.exec("INSERT INTO coupons(code,reward_type,reward_amount,max_uses,created_by) VALUES('PRIOR','COIN',9000000000000,1,2)");
 const results=await Promise.all(Array.from({length:6},(_,i)=>f.call({path:COUPON_ISSUE_PATHS[i%3],body:{code:'RACE-'+i}})));
 assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.body.code==='COUPON_OWNER_DAILY_LIMIT').length,5);
 assert.equal((await readCouponIssueLimit(f.env,f.owner)).issuedCoin,1e13);assert.equal((await f.rows('SELECT * FROM admin_logs')).length,1);
 const lock=f.queries.findIndex(q=>q==='SELECT id FROM users WHERE id=$1 FOR UPDATE');assert(lock>=0);assert.match(f.queries[lock+1],/^INSERT INTO joint_atomic_guards_v1/);
});

test('권한 없는 요청은 어떤 발행 API에서도 저장하지 않는다',async t=>{
 const f=await couponIssueFixture();t.after(f.close);
 for(const path of COUPON_ISSUE_PATHS)assert.equal((await f.call({path,admin:null})).status,403);
 assert.equal((await f.rows('SELECT * FROM coupons')).length,0);assert.equal((await f.rows('SELECT * FROM admin_logs')).length,0);
});
