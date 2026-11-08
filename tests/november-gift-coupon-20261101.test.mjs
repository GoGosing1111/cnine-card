import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forgeTicketFixture} from './helpers/admin-forge-ticket-fixture.mjs';
import {NOVEMBER_GIFT_COUPON as gift,LUCKY_SEVEN_COUPON as lucky,redeemNovemberGiftCoupon} from '../functions/_november_gift_coupon.js';
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
 assert.equal(spec(gift.type),null);assert.equal(spec(lucky.type),null);assert.equal(spec('RANK_EXP_POTION_3X_60M'),null);assert.equal(spec('COIN').max,1000000000000);assert.equal(spec('MASTER_STAR').max,1000000);
});

test('large-wallet coupon records every coin and retains one redemption after response loss',async t=>{
 const f=await fixture(t);await f.pg.exec('UPDATE users SET coin=100000000000000001 WHERE id=1');
 f.fault({ack:true});await assert.rejects(f.redeem(),/lost commit response/);
 assert.equal((await (await f.redeem()).json()).replayed,true);
 const expected=(100000000000000001n+BigInt(gift.coin)).toString();
 assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=1')).coin,expected);
 assert.equal((await f.one('SELECT CAST(balance_after AS TEXT) coin FROM coin_logs')).coin,expected);
 assert.equal(await f.count('coupon_redemptions'),1);assert.equal(await f.count('coin_logs'),1);
});

test('large-wallet coupon rollback and signed BIGINT ceiling preserve unused coupon',async t=>{
 const f=await fixture(t);await f.pg.exec('UPDATE users SET coin=100000000000000001 WHERE id=1');
 const before=await f.snapshot();f.fault({pattern:'INSERT INTO coin_logs'});await assert.rejects(f.redeem(),/QA injected/);assert.deepEqual(await f.snapshot(),before);
 await f.pg.exec('UPDATE users SET coin=9223372036854775807 WHERE id=1');const ceiling=await f.snapshot();assert.equal((await f.redeem()).status,409);assert.deepEqual(await f.snapshot(),ceiling);
});

async function luckyFixture(t){
 const f=await fixture(t);
 await f.pg.query('INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,max_uses) VALUES($1,$2,$3,1,100)',['CNINE7LUCK','250000000000000','NOVEMBER_GIFT_20261107']);
 return f;
}
test('7일의 행운 pays 250조, 1억 stars and one 60 min potion once, including after a lost response',async t=>{
 const f=await luckyFixture(t);
 await f.pg.exec("UPDATE users SET coin=100000000000000001 WHERE id=1; INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',21,0,NULL,NULL),(1,'RANK_EXP_POTION_3X_60M',3,0,NULL,NULL)");
 f.fault({ack:true});await assert.rejects(f.redeem(1,'LUCKY_SEVEN_1',' cnine7luck '),/lost commit response/);
 const r=await f.redeem(1,'LUCKY_SEVEN_1',lucky.code);assert.equal(r.status,200);const body=await r.json();
 assert(body.replayed);assert.equal(body.rewardLabel,'7일의 행운');
 assert.deepEqual(body.rewards,[{type:'COIN',amount:250000000000000},{type:'MASTER_STAR',amount:100000000},{type:'RANK_EXP_POTION_3X_60M',amount:1}]);
 assert.match(body.message,/코인 250조, 마스터의 별 1억 개, 계급 경험치 3배 물약 \(60분\) 1개/);
 assert.equal((await f.one('SELECT coin::text FROM users WHERE id=1')).coin,'100250000000000001');
 assert.equal((await f.one('SELECT balance_after::text FROM coin_logs')).balance_after,'100250000000000001');
 assert.equal(await f.quantity('MASTER_STAR'),100000021);assert.equal(await f.quantity('RANK_EXP_POTION_3X_60M'),4);
 assert.equal(await f.count('inventory_logs'),2);assert.equal(await f.count('coin_logs'),1);assert.equal(await f.count('coupon_redemptions'),1);
 assert.equal((await f.one("SELECT value FROM app_meta WHERE key='account_rank_potion_v1:1'")).value,'existing-buff-preserved');
 assert.equal((await f.redeem(1,'LUCKY_SEVEN_DIFFERENT',lucky.code)).status,409);
 assert.equal((await f.one('SELECT used_count FROM coupons WHERE code=$1',[lucky.code])).used_count,1);
 assert.equal((await f.one('SELECT used_count FROM coupons WHERE code=$1',[gift.code])).used_count,0);
 assert.equal((await f.redeem(1,'OLD_CAMPAIGN_1',gift.code)).status,200);assert.equal(await f.quantity('RANK_EXP_POTION_3X_60M'),6);
});
test('a single spot at 99/100 belongs to just one account; exhaustion does not consume the old coupon',async t=>{
 const f=await luckyFixture(t);await f.pg.query('UPDATE coupons SET used_count=99 WHERE code=$1',[lucky.code]);
 const pair=await Promise.all([f.redeem(1,'LUCKY_LAST_001',lucky.code),f.redeem(2,'LUCKY_LAST_002',lucky.code)]);
 assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);const loser=pair[0].ok?2:1;
 assert.equal(await f.quantity('MASTER_STAR',loser),0);assert.equal(await f.quantity('RANK_EXP_POTION_3X_60M',loser),0);
 assert.equal((await f.one('SELECT used_count FROM coupons WHERE code=$1',[lucky.code])).used_count,100);
 assert.equal(await f.count('coupon_redemptions'),1);assert.equal(await f.count('coin_logs'),1);assert.equal(await f.count('inventory_logs'),2);
 assert.equal((await f.redeem(loser,'OLD_LAST_003',gift.code)).status,200);
});
test('a blocked final potion or a mismatched reward definition rolls back the entire lucky coupon',async t=>{
 const f=await luckyFixture(t);
 await f.pg.exec("INSERT INTO cnine_user_inventory VALUES(1,'RANK_EXP_POTION_3X_60M',9007199254740991,0,NULL,NULL)");
 let before=await f.snapshot();assert.equal((await f.redeem(1,'LUCKY_ATOMIC_1',lucky.code)).status,409);assert.deepEqual(await f.snapshot(),before);
 await f.pg.query("UPDATE coupons SET reward_type='COIN' WHERE code=$1",[lucky.code]);
 before=await f.snapshot();assert.equal((await f.redeem(1,'LUCKY_ATOMIC_1',lucky.code)).status,409);assert.deepEqual(await f.snapshot(),before);
});

async function suwonFixture(t){
 const f=await luckyFixture(t);
 await f.pg.query('INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,max_uses) VALUES($1,$2,$3,1,100)',['SUWONK1UP','250000000000000','NOVEMBER_GIFT_SUWON_K1_20261108']);
 return f;
}
test('Suwon fans can claim after Lucky Seven with an independent limit, exact rewards and safe replay',async t=>{
 const f=await suwonFixture(t);await f.pg.exec('UPDATE users SET coin=100000000000000001 WHERE id=1');
 assert.equal((await f.redeem(1,'LASTLUCK_ALREADY_USED',lucky.code)).status,200);
 await f.pg.query('UPDATE coupons SET used_count=99 WHERE code=$1',['SUWONK1UP']);
 f.fault({ack:true});await assert.rejects(f.redeem(1,'SUWON_TEST_LAST',' suwonk1up '),/lost commit response/);
 const r=await f.redeem(1,'SUWON_TEST_LAST','SUWONK1UP');assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.rewardLabel,'수원삼성 K1 승격 기념');assert.equal(data.replayed,true);
 assert.deepEqual(data.rewards,[{type:'COIN',amount:250000000000000},{type:'MASTER_STAR',amount:100000000},{type:'RANK_EXP_POTION_3X_60M',amount:1}]);
 assert.equal((await f.one('SELECT coin::text FROM users WHERE id=1')).coin,'100500000000000001');
 assert.equal(await f.quantity('MASTER_STAR'),200000000);assert.equal(await f.quantity('RANK_EXP_POTION_3X_60M'),2);
 const before=await f.snapshot();
 assert.equal((await f.redeem(1,'SUWON_DIFF_KEY','SUWONK1UP')).status,409);
 assert.equal((await f.redeem(2,'SUWON_ACCOUNT_101','SUWONK1UP')).status,409);
 assert.deepEqual(await f.snapshot(),before);
 assert.equal((await f.one('SELECT used_count FROM coupons WHERE code=$1',[lucky.code])).used_count,1);
 assert.equal((await f.one('SELECT used_count FROM coupons WHERE code=$1',['SUWONK1UP'])).used_count,100);
 assert.equal(await f.count('coupon_redemptions'),2);assert.equal(await f.count('coin_logs'),2);assert.equal(await f.count('inventory_logs'),4);
});
test('Suwon coupon cannot pay a partial bundle or fall back to an ordinary coupon if its type changes',async t=>{
 const f=await suwonFixture(t);
 const before=await f.snapshot();f.fault({pattern:'INSERT INTO coupon_redemptions'});
 await assert.rejects(f.redeem(1,'SUWON_ROLLBACK','SUWONK1UP'),/QA injected/);assert.deepEqual(await f.snapshot(),before);
 await f.pg.query('UPDATE coupons SET reward_type=$1 WHERE code=$2',['COIN','SUWONK1UP']);
 const mismatched=await f.snapshot();assert.equal((await f.redeem(1,'SUWON_INVALID','SUWONK1UP')).status,409);assert.deepEqual(await f.snapshot(),mismatched);
});
