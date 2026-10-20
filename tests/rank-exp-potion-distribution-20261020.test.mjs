import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forgeTicketFixture} from './helpers/admin-forge-ticket-fixture.mjs';
import {grantRankExpPotion,redeemRankExpPotionCoupon,RANK_POTION_GRANT_MAX} from '../functions/_rank_exp_potion_grant.js';
import {isForgeTicketGrant} from '../functions/_admin_forge_ticket_grant.js';

const code='RANK_EXP_POTION_2X_60M',json=(data,status=200)=>Response.json(data,{status});
const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const createSource=source.slice(source.indexOf("    if(path==='admin/coupon-create-permanent-v3')"),source.indexOf("    if(path==='admin/users/card-grant')"));
const createRoute=new AsyncFunction('path','request','env','requirePermission','readBody','releaseDeletedCouponCode','json',specs+createSource);
const redeemSource=source.slice(source.indexOf("    if(path==='coupon/redeem'"),source.indexOf("    if(path==='admin/daily-quests')"));
const redeemRoute=new AsyncFunction('path','request','env','authenticate','readBody','redeemLandCoupon','json','profile','redeemRankExpPotionCoupon','isRandomDrawExcluded',redeemSource);
const grantSource=source.slice(source.indexOf("    if(path==='admin/users/action'"),source.indexOf("    if(path==='admin/users/inventory-audit'"));
const grantRoute=new AsyncFunction('path','request','env','requirePermission','readBody','json','isForgeTicketGrant','grantRankExpPotion','withJointUserMutationLock',grantSource);
const paths=['admin/coupon-create-permanent-v3','admin/coupons','admin/coupons-v2'];
const request=body=>new Request('http://qa.test/api/test',{method:'POST',body:JSON.stringify(body)});
const permission=admin=>async(_r,_e,p)=>admin&&(admin.role==='OWNER'||admin.permissions?.includes(p))?admin:null;

async function fixture(t){
 const f=await forgeTicketFixture(t);
 await f.pg.exec(`
 CREATE TABLE coupons(id bigserial PRIMARY KEY,code text UNIQUE,reward_coin bigint DEFAULT 0,reward_type text,reward_amount bigint,starts_at text,ends_at text,max_uses bigint,used_count bigint DEFAULT 0,is_active bigint DEFAULT 1,created_by bigint,deleted_at text,updated_at text);
 CREATE TABLE coupon_redemptions(coupon_id bigint,user_id bigint,reward_coin bigint,reward_type text,reward_amount bigint,operation_key text,PRIMARY KEY(coupon_id,user_id));
 INSERT INTO inventory_items(code,name,is_active) VALUES('${code}','계급 경험치 2배 물약',1);
 INSERT INTO app_meta(key,value) VALUES('account_rank_potion_v1:1','existing-buff-unchanged');
 `);
 f.create=(payload={},path=paths[0],admin=f.owner)=>createRoute(path,request({code:'EXP2-QA',rewardType:code,rewardAmount:3,maxUses:10,...payload}),f.env,permission(admin),r=>r.json(),async()=>{},json);
 f.redeem=({userId=1,key='RANK_POTION_COUPON_QA',couponCode='EXP2-QA'}={})=>redeemRoute('coupon/redeem',request({code:couponCode,operationKey:key}),f.env,async()=>({id:userId}),r=>r.json(),async()=>null,json,async(_env,u)=>({id:Number(u.id),coin:Number(u.coin)}),redeemRankExpPotionCoupon,()=>false);
 f.grant=(payload={},admin=f.owner)=>grantRoute('admin/users/action',request({userId:1,action:'INVENTORY',itemCode:code,amount:3,reason:'물약 지급 검수',requestId:'rank_potion_grant_qa_001',...payload}),f.env,permission(admin),r=>r.json(),json,isForgeTicketGrant,grantRankExpPotion,async(_env,userId,path,work)=>{f.locks.push({userId,path});return work();});
 f.count=async table=>Number((await f.one('SELECT COUNT(*) n FROM '+table)).n);
 return f;
}
async function noUse(f){
 assert.equal((await f.one("SELECT value FROM app_meta WHERE key='account_rank_potion_v1:1'")).value,'existing-buff-unchanged');
 assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=1')).coin),1234);
}
async function noRedemption(f){
 assert.equal(await f.quantity(code),0);
 for(const table of ['coupon_redemptions','inventory_logs'])assert.equal(await f.count(table),0);
 assert.equal(Number((await f.one('SELECT used_count FROM coupons')).used_count),0);
 await noUse(f);
}

test('only 2X joins coupon rewards; CMS uses the same quantity limit',()=>{
 const {couponRewardSpec,verifiedMessageRewardSpec}=Function(specs+';return {couponRewardSpec,verifiedMessageRewardSpec}')();
 assert.equal(couponRewardSpec(code).max,RANK_POTION_GRANT_MAX);
 assert.equal(couponRewardSpec('RANK_EXP_POTION_3X_60M'),null);
 assert.equal(verifiedMessageRewardSpec(code),null);
 const cms=readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
 const meta=Function(cms.slice(cms.indexOf('const COUPON_REWARD_META='),cms.indexOf('function canIssueMiracleCubeCouponInCms'))+';return COUPON_REWARD_META')();
 assert.equal(meta[code].max,RANK_POTION_GRANT_MAX);
});

test('all issue routes enforce permissions, amount, active catalog, prefix and duplicate code',async t=>{
 const f=await fixture(t);
 for(const [i,path] of paths.entries()){
  assert.equal((await f.create({},path,null)).status,403);
  assert.equal((await f.create({},path,{id:10,role:'ADMIN',permissions:['USER_MANAGE']})).status,403);
  for(const payload of [{rewardAmount:0},{rewardAmount:1.5},{rewardAmount:10000},{maxUses:0},{code:'SLD-POTION'},{rewardType:'RANK_EXP_POTION_3X_60M'}])
   assert.equal((await f.create(payload,path)).status,400);
  const response=await f.create({code:'EXP2-QA-'+i},path,{id:10,role:'ADMIN',permissions:['COUPON_ISSUE']});
  assert.equal(response.status,201);
  const {coupon}=await response.json();assert.equal(coupon.reward_type,code);assert.equal(Number(coupon.reward_coin),0);assert.equal(coupon.ends_at,null);
  assert.equal((await f.create({code:'EXP2-QA-'+i},path)).status,409);
 }
 assert.equal(await f.count('coupons'),3);assert.equal(await f.count('admin_logs'),3);
 await f.pg.exec('UPDATE inventory_items SET is_active=0');
 for(const path of paths)assert.equal((await f.create({code:'EXP2-STOP'},path)).status,409);
 await f.pg.exec('DELETE FROM inventory_items');
 assert.equal((await f.create()).status,409);assert.equal(await f.count('inventory_items'),0);
 await noUse(f);
});

test('redemption adds inventory once; retry/last-use competition and disabled replay preserve receipts',async t=>{
 const f=await fixture(t);assert.equal((await f.create({maxUses:1})).status,201);
 const responses=await Promise.all([f.redeem(),f.redeem(),f.redeem({userId:2,key:'rank_potion_other_user'})]);
 assert.deepEqual(responses.map(r=>r.status),[200,200,409]);
 assert.equal((await responses[1].json()).replayed,true);
 assert.equal(await f.quantity(code),3);assert.equal(await f.quantity(code,2),0);
 assert.equal(await f.count('inventory_logs'),1);assert.equal(await f.count('coupon_redemptions'),1);
 await f.pg.exec('UPDATE coupons SET is_active=0');
 assert.equal((await (await f.redeem()).json()).replayed,true);
 assert.equal((await f.redeem({key:'rank_potion_different_key'})).status,409);
 await noUse(f);
});

test('coupon failure rolls inventory, counter and audit back together; committed response loss replays',async t=>{
 const f=await fixture(t);await f.create();
 for(const pattern of ['INSERT INTO cnine_user_inventory','UPDATE coupons SET used_count','INSERT INTO inventory_logs','INSERT INTO coupon_redemptions']){
  f.fault({pattern});await assert.rejects(f.redeem(),/QA injected/);await noRedemption(f);
 }
 f.fault({ack:true});await assert.rejects(f.redeem(),/lost commit response/);
 assert.equal((await (await f.redeem()).json()).replayed,true);
 assert.equal(await f.quantity(code),3);assert.equal(await f.count('coupon_redemptions'),1);await noUse(f);
});

test('redemption refuses inactive/missing items, inactive accounts and invalid inventory without consumption',async t=>{
 const f=await fixture(t);await f.create();
 await f.pg.exec('UPDATE inventory_items SET is_active=0');
 assert.equal((await f.redeem()).status,409);await noRedemption(f);
 await f.pg.exec("UPDATE inventory_items SET is_active=1;UPDATE users SET status='BANNED' WHERE id=1");
 assert.equal((await f.redeem()).status,403);await noRedemption(f);
 await f.pg.exec("UPDATE users SET status='ACTIVE' WHERE id=1");
 await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,$2,0)',[code,Number.MAX_SAFE_INTEGER]);
 assert.equal((await f.redeem()).status,409);assert.equal(await f.quantity(code),Number.MAX_SAFE_INTEGER);
 assert.equal(await f.count('coupon_redemptions'),0);await noUse(f);
});

test('user-management permission/OWNER protection and idempotent grant keep inventory/audits atomic',async t=>{
 const f=await fixture(t);
 assert.equal((await f.grant({},null)).status,403);
 assert.equal((await f.grant({},{id:10,role:'ADMIN',permissions:['COUPON_ISSUE']})).status,403);
 assert.equal((await f.grant({userId:9},{id:10,role:'ADMIN',permissions:['USER_MANAGE']})).status,403);
 assert.equal((await f.grant({userId:404})).status,404);
 for(const amount of [0,-1,1.5,10000])assert.equal((await f.grant({amount})).status,400);
 const first=await f.grant({}, {id:10,role:'ADMIN',permissions:['USER_MANAGE']});assert.equal(first.status,200);
 const replay=await f.grant({}, {id:10,role:'ADMIN',permissions:['USER_MANAGE']});assert.equal((await replay.json()).replayed,true);
 assert.equal((await f.grant({amount:4},{id:10,role:'ADMIN',permissions:['USER_MANAGE']})).status,409);
 assert.equal(await f.quantity(code),3);assert.equal(await f.count('admin_logs'),1);assert.equal(await f.count('inventory_logs'),1);
 assert(f.locks.every(lock=>lock.path==='admin/rank-exp-potion/grant'));await noUse(f);
});

test('admin audit failure rolls back, retry grants once and item disabling never gets overwritten',async t=>{
 const f=await fixture(t);
 f.fault({pattern:'INSERT INTO admin_logs'});assert.equal((await f.grant()).status,409);
 assert.equal(await f.quantity(code),0);assert.equal(await f.count('admin_logs'),0);assert.equal(await f.count('inventory_logs'),0);
 assert.equal((await f.grant()).status,200);assert.equal(await f.quantity(code),3);
 await f.pg.exec('UPDATE inventory_items SET is_active=0');
 assert.equal((await f.grant({requestId:'rank_potion_disabled_new'})).status,409);
 assert.equal((await (await f.grant()).json()).replayed,true);
 assert.equal(await f.quantity(code),3);await noUse(f);
});
