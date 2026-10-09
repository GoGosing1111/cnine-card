import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {redeemChickenTicketCoupon,CHICKEN_COUPON_MAX} from '../functions/_chicken_coupon.js';
import {CHICKEN_TICKET,CHICKEN_KEY,chickenDraft} from '../shared/chicken-event-v1.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const server=read('functions/api/[[path]].js'),cms=read('admin/admin-v1276.js');
const specs=server.slice(server.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),server.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
const {couponRewardSpec,verifiedMessageRewardSpec}=Function(specs+';return {couponRewardSpec,verifiedMessageRewardSpec}')();
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const createSource=server.slice(server.indexOf("    if(path==='admin/coupon-create-permanent-v3')"),server.indexOf("    if(path==='admin/users/card-grant')"));
const createRoute=new AsyncFunction('path','request','env','requirePermission','readBody','releaseDeletedCouponCode','json',specs+createSource);
const redeemSource=server.slice(server.indexOf("    if(path==='coupon/redeem'"),server.indexOf("    if(path==='admin/daily-quests')"));
const redeemRoute=new AsyncFunction('path','request','env','authenticate','readBody','redeemLandCoupon','profile','isRandomDrawExcluded','json','redeemChickenTicketCoupon',redeemSource);
const json=(value,status=200)=>Response.json(value,{status}),owner={id:99,role:'OWNER',nickname:'관리자'};
const paths=['admin/coupon-create-permanent-v3','admin/coupons','admin/coupons-v2'];

async function fixture(){
 const pg=new PGlite();await pg.exec(`
  CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE TABLE users(id bigint PRIMARY KEY,status text,coin bigint,banned_until text);
  INSERT INTO users VALUES(1,'ACTIVE',5000000000,NULL),(2,'ACTIVE',7000000000,NULL),(99,'ACTIVE',0,NULL);
  CREATE TABLE inventory_items(code text PRIMARY KEY,name text,is_active bigint);
  INSERT INTO inventory_items VALUES('PINGDU_BAEMIN_TICKET','핑두의 배민권',1);
  CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
  CREATE TABLE inventory_logs(id bigserial PRIMARY KEY,user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text);
  CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
  CREATE TABLE coupons(id bigserial PRIMARY KEY,code text UNIQUE,reward_coin bigint DEFAULT 0,reward_type text,reward_amount bigint,starts_at text,ends_at text,max_uses bigint,used_count bigint DEFAULT 0,is_active bigint DEFAULT 1,created_by bigint,deleted_at text,updated_at text);
  CREATE TABLE coupon_redemptions(coupon_id bigint,user_id bigint,reward_coin bigint,reward_type text,reward_amount bigint,operation_key text,PRIMARY KEY(coupon_id,user_id));
  CREATE TABLE app_meta(key text PRIMARY KEY,value text);
 `);
 const settings=JSON.stringify({settings:chickenDraft(),revision:'keep-existing-settings'});
 await pg.query('INSERT INTO app_meta VALUES($1,$2)',[CHICKEN_KEY,settings]);
 let fault='',zero='';const queries=[];
 const client={async query(input){const text=input.text,values=input.values||[];queries.push(text);
  if(fault&&text.startsWith(fault))throw Error('Injected failure');if(zero&&text.startsWith(zero))return {rows:[],rowCount:0};
  const result=await pg.query(text,values);return {...result,rowCount:result.affectedRows??result.rows.length};
 }};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const rows=async(sql,values=[])=>(await pg.query(sql,values)).rows,row=async(sql,values=[])=>(await rows(sql,values))[0];
 const request=body=>new Request('https://qa.test/api/coupon',{method:'POST',body:JSON.stringify(body)});
 const profile=async(_env,u)=>({id:Number(u.id),coin:Number(u.coin)});
 const create=(body={},path=paths[0],admin=owner)=>createRoute(path,request({code:'BAEMIN-QA',rewardType:CHICKEN_TICKET,rewardAmount:3,maxUses:10,...body}),env,async()=>admin,r=>r.json(),async()=>{},json);
 const redeem=({userId=1,key='BAEMIN_QA_REQUEST_1',code='BAEMIN-QA',extra={}}={})=>redeemRoute('coupon/redeem',request({code,operationKey:key,...extra}),env,async()=>userId?{id:userId}:null,r=>r.json(),async()=>null,profile,()=>false,json,redeemChickenTicketCoupon);
 return {pg,env,rows,row,queries,settings,create,redeem,setFault:v=>{fault=v},setZero:v=>{zero=v},close:()=>pg.close()};
}
async function noRedemption(f){
 for(const table of ['coupon_redemptions','inventory_logs','cnine_user_inventory'])assert.equal(Number((await f.row('SELECT COUNT(*) n FROM '+table)).n),0,table);
 assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),0);
 assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),5000000000);
 assert.equal((await f.row('SELECT value FROM app_meta')).value,f.settings);
}

test('Baemin coupon metadata is wired to CMS and remains separate from message rewards',()=>{
 const spec=couponRewardSpec(' pingdu_baemin_ticket ');assert.equal(spec.max,CHICKEN_COUPON_MAX);assert.equal(spec.label,'핑두의 배민권');assert.equal(spec.inventory,true);
 assert.equal(verifiedMessageRewardSpec(CHICKEN_TICKET),null);assert.equal(couponRewardSpec('COIN').max,10000000000);
 const meta=Function(cms.slice(cms.indexOf('const COUPON_REWARD_META='),cms.indexOf('function syncCouponRewardForm'))+';return COUPON_REWARD_META')();
 assert.equal(meta[CHICKEN_TICKET].max,spec.max);assert.equal(meta[CHICKEN_TICKET].label,spec.label);
 assert.match(read('admin/index.html'),/<option value="PINGDU_BAEMIN_TICKET">핑두의 배민권/);
 assert.match(read('admin/chicken-event-v1.js'),/select.value='PINGDU_BAEMIN_TICKET'/);
 assert.match(read('admin/admin-v1062-coupon-bulk-delete.js'),/PINGDU_BAEMIN_TICKET:'핑두의 배민권'/);
});

test('all issue routes create coupons with existing issue permissions and preserve event settings',async(t)=>{
 const f=await fixture();t.after(f.close);
 for(const [i,path] of paths.entries()){
  assert.equal((await f.create({},path,null)).status,403);
  const response=await f.create({code:'BAEMIN-QA-'+i},path,i===1?{id:99,role:'ADMIN'}:owner);assert.equal(response.status,201);
  const {coupon}=await response.json();assert.equal(coupon.reward_type,CHICKEN_TICKET);assert.equal(Number(coupon.reward_amount),3);assert.equal(Number(coupon.reward_coin),0);assert.equal(coupon.ends_at,null);
  assert.equal((await f.create({code:'BAEMIN-QA-'+i},path)).status,409);
  for(const body of [{code:'SLD-BAEMIN'},{code:'!!'},{rewardAmount:0},{rewardAmount:1.5},{rewardAmount:100001},{maxUses:0},{maxUses:1000001}])assert.equal((await f.create(body,path)).status,400);
 }
 assert.equal((await f.rows('SELECT * FROM coupons')).length,3);assert.equal((await f.rows('SELECT * FROM admin_logs')).length,3);await noRedemption(f);
});

test('missing or disabled event ticket blocks issuance without recreating catalogs or settings',async(t)=>{
 const f=await fixture();t.after(f.close);
 await f.pg.exec('UPDATE inventory_items SET is_active=0');for(const path of paths)assert.equal((await f.create({},path)).status,409);
 await f.pg.exec('DELETE FROM inventory_items');for(const path of paths)assert.equal((await f.create({},path)).status,409);
 assert.equal((await f.rows('SELECT * FROM coupons')).length,0);assert.equal((await f.rows('SELECT * FROM inventory_items')).length,0);
 assert.equal((await f.row('SELECT value FROM app_meta')).value,f.settings);
});

test('public redemption adds the actual chicken ticket and replays the same receipt once',async(t)=>{
 const f=await fixture();t.after(f.close);await f.create();
 await f.pg.exec("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'PINGDU_BAEMIN_TICKET',9,4)");
 assert.equal((await f.redeem({userId:0})).status,401);
 const response=await f.redeem({extra:{userId:2,rewardAmount:999}});assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.rewardType,CHICKEN_TICKET);assert.equal(result.rewardAmount,3);assert.equal(result.rewardLabel,'핑두의 배민권');assert.equal(result.rewardCoin,0);assert.equal(result.user.coin,5000000000);assert.match(result.message,/철구네 치킨/);
 const inventory=await f.row('SELECT * FROM cnine_user_inventory');assert.equal(inventory.item_code,CHICKEN_TICKET);assert.equal(Number(inventory.quantity),12);assert.equal(Number(inventory.unseen_quantity),7);assert.equal(Number(inventory.user_id),1);
 await f.pg.exec('UPDATE coupons SET is_active=0');assert.equal((await (await f.redeem()).json()).replayed,true);assert.equal((await f.redeem({key:'OTHER_REQUEST_KEY'})).status,409);
 for(const table of ['coupon_redemptions','inventory_logs'])assert.equal((await f.rows('SELECT * FROM '+table)).length,1);
 assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),1);assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),12);
 assert.equal((await f.row('SELECT value FROM app_meta')).value,f.settings);assert(f.queries.some(sql=>/FROM coupons .*FOR UPDATE/.test(sql)));
});

test('duplicate requests and different users racing for the final use grant only once',async(t)=>{
 const f=await fixture();t.after(f.close);await f.create({maxUses:1});
 const results=await Promise.all([f.redeem(),f.redeem(),f.redeem({userId:2,key:'SECOND_USER_REQUEST'})]);assert.deepEqual(results.map(r=>r.status),[200,200,409]);
 assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),3);assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),1);assert.equal((await f.rows('SELECT * FROM coupon_redemptions')).length,1);
});

test('inventory, usage, log or receipt failures roll back; a later retry grants once',async(t)=>{
 const f=await fixture();t.after(f.close);await f.create();
 for(const sql of ['INSERT INTO cnine_user_inventory','UPDATE coupons','INSERT INTO inventory_logs','INSERT INTO coupon_redemptions']){
  f.setFault(sql);await assert.rejects(f.redeem(),/Injected failure/);f.setFault('');await noRedemption(f);
  f.setZero(sql);assert.equal((await f.redeem()).status,sql==='UPDATE coupons'?409:500);f.setZero('');await noRedemption(f);
 }
 assert.equal((await f.redeem()).status,200);assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),3);
});

test('disabled/deleted/exhausted/invalid coupons, disabled tickets and blocked users grant nothing',async(t)=>{
 const f=await fixture();t.after(f.close);await f.create();
 for(const update of ["UPDATE coupons SET is_active=0","UPDATE coupons SET deleted_at='2026-10-09'","UPDATE coupons SET used_count=max_uses","UPDATE coupons SET reward_amount=0","UPDATE coupons SET reward_amount=100001","UPDATE inventory_items SET is_active=0","UPDATE users SET status='BANNED' WHERE id=1","UPDATE users SET banned_until='2999-01-01 00:00:00' WHERE id=1"]){
  await f.pg.exec(update);assert((await f.redeem()).status>=400);await f.pg.exec("UPDATE coupons SET is_active=1,deleted_at=NULL,used_count=0,reward_amount=3;UPDATE inventory_items SET is_active=1;UPDATE users SET status='ACTIVE',banned_until=NULL");await noRedemption(f);
 }
 assert.equal(await redeemChickenTicketCoupon({coupon:{reward_type:'COIN'}}),null);
});
