import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forgeTicketFixture} from './helpers/admin-forge-ticket-fixture.mjs';
import {NOVEMBER_GIFT_COUPON as gift,redeemNovemberGiftCoupon} from '../functions/_november_gift_coupon.js';
const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const redeemSource=source.slice(source.indexOf("    if(path==='coupon/redeem'"),source.indexOf("    if(path==='admin/daily-quests')"));
const route=new (Object.getPrototypeOf(async()=>{}).constructor)('deps',`const {env,request,authenticate,readBody,redeemLandCoupon,json,profile,redeemNovemberGiftCoupon,isRandomDrawExcluded}=deps;const path='coupon/redeem';${redeemSource}`);
async function fixture(t){
 const f=await forgeTicketFixture(t);
 await f.pg.exec(`CREATE TABLE coupons(id bigserial PRIMARY KEY,code text UNIQUE,reward_coin bigint,reward_type text,reward_amount bigint,starts_at text,ends_at text,max_uses bigint,used_count bigint DEFAULT 0,is_active bigint DEFAULT 1,deleted_at text,updated_at text);
 CREATE TABLE coupon_redemptions(coupon_id bigint,user_id bigint,reward_coin bigint,reward_type text,reward_amount bigint,operation_key text,PRIMARY KEY(coupon_id,user_id));
 CREATE TABLE coin_logs(user_id bigint,change_amount bigint,balance_after bigint,reason text);
 INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,max_uses) VALUES('${gift.code}',${gift.coin},'${gift.type}',1,100);
 INSERT INTO inventory_items(code,name,is_active) VALUES('RANK_EXP_POTION_3X_60M','3배 물약',1),('MASTER_STAR','마스터의 별',1);
 INSERT INTO app_meta(key,value) VALUES('account_rank_potion_v1:1','existing-buff-preserved');`);
 f.redeem=(userId=1,key='NOVEMBER_GIFT_QA_001',code=gift.code)=>route({env:f.env,request:new Request('http://qa.test/api/coupon/redeem',{method:'POST',body:JSON.stringify({code,operationKey:key})}),authenticate:async()=>userId?{id:userId}:null,readBody:r=>r.json(),redeemLandCoupon:async()=>null,json:(b,status=200)=>Response.json(b,{status}),profile:async(_e,u)=>({id:Number(u.id),coin:String(u.coin)}),redeemNovemberGiftCoupon,isRandomDrawExcluded:()=>false});
 f.count=async table=>Number((await f.one('SELECT COUNT(*) n FROM '+table)).n);
 f.snapshot=async()=>{const result={};for(const table of ['users','cnine_user_inventory','coin_logs','inventory_logs','coupons','coupon_redemptions','app_meta'])result[table]=(await f.pg.query('SELECT * FROM '+table)).rows;return result;};
 return f;
}
test('one code grants the exact three rewards once, preserves buff, and retries after response loss',async t=>{
 const f=await fixture(t);const before=await f.snapshot();
 assert.equal((await f.redeem(null)).status,401);
 assert.equal((await f.redeem(1,undefined,'NO-SUCH-COUPON')).status,404);
 assert.deepEqual(await f.snapshot(),before);
 f.fault({ack:true});await assert.rejects(f.redeem(),/lost commit response/);
 const response=await f.redeem();assert.equal(response.status,200);const body=await response.json();assert.equal(body.replayed,true);
 assert.deepEqual(body.rewards,[{type:'COIN',amount:30000000000000},{type:'RANK_EXP_POTION_3X_60M',amount:2},{type:'MASTER_STAR',amount:20000000}]);
 assert.equal(String((await f.one('SELECT coin FROM users WHERE id=1')).coin),'30000000001234');
 assert.equal(await f.quantity('RANK_EXP_POTION_3X_60M'),2);assert.equal(await f.quantity('MASTER_STAR'),20000000);
 assert.equal(await f.count('coin_logs'),1);assert.equal(await f.count('inventory_logs'),2);assert.equal(await f.count('coupon_redemptions'),1);
 assert.equal((await f.one("SELECT value FROM app_meta WHERE key='account_rank_potion_v1:1'")).value,'existing-buff-preserved');
 assert.equal((await f.redeem(1,'NOVEMBER_GIFT_OTHER')).status,409);
 await f.pg.exec('UPDATE coupons SET is_active=0');assert.equal((await (await f.redeem()).json()).replayed,true);
});
test('the hundredth recipient succeeds and the next account is refused without any reward',async t=>{
 const f=await fixture(t);await f.pg.exec('UPDATE coupons SET used_count=99');
 const results=await Promise.all([f.redeem(),f.redeem(2,'NOVEMBER_GIFT_QA_002')]);assert.deepEqual(results.map(r=>r.status),[200,409]);
 assert.equal(Number((await f.one('SELECT used_count FROM coupons')).used_count),100);
 assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200);assert.equal(await f.quantity('MASTER_STAR',2),0);assert.equal(await f.quantity('RANK_EXP_POTION_3X_60M',2),0);
});
test('each write failure rolls the entire reward, receipt and use counter back',async t=>{
 const f=await fixture(t);const before=await f.snapshot();
 for(const pattern of ['UPDATE users SET coin','INSERT INTO coin_logs','INSERT INTO cnine_user_inventory','INSERT INTO inventory_logs','UPDATE coupons SET used_count','INSERT INTO coupon_redemptions']){
  f.fault({pattern});await assert.rejects(f.redeem(),/QA injected/);assert.deepEqual(await f.snapshot(),before);
 }
});
test('inactive items/accounts, malformed bundle, duplicate code and overflowing inventory never partially pay',async t=>{
 const f=await fixture(t);
 for(const setup of ["UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'","UPDATE users SET status='BANNED' WHERE id=1","UPDATE coupons SET max_uses=101","UPDATE coupons SET reward_coin=1","UPDATE coupons SET is_active=0","UPDATE coupons SET code='OTHER-CODE'","UPDATE coupons SET deleted_at='2026-11-01 00:00:00'","INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',9007199254740991,0,NULL,NULL)"]){
  await f.pg.exec('BEGIN');await f.pg.exec(setup);await f.pg.exec('COMMIT');const before=await f.snapshot();
  const response=await f.redeem();assert(response.status>=400);assert.deepEqual(await f.snapshot(),before);
  await f.pg.exec(`UPDATE inventory_items SET is_active=1;UPDATE users SET status='ACTIVE';UPDATE coupons SET code='${gift.code}',max_uses=100,reward_coin=${gift.coin},is_active=1,deleted_at=NULL;DELETE FROM cnine_user_inventory`);
 }
});
test('regular CMS limits still reject the special bundle and 3X issuance',()=>{
 const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
 const spec=Function(specs+';return couponRewardSpec')();
 assert.equal(spec(gift.type),null);assert.equal(spec('RANK_EXP_POTION_3X_60M'),null);assert.equal(spec('COIN').max,1000000000000);assert.equal(spec('MASTER_STAR').max,1000000);
});
