import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ensureWishLamp,wishLampState} from '../functions/_wish_lamp.js';
import {redeemWishTicketCoupon,WISH_COUPON_MAX} from '../functions/_wish_lamp_coupon.js';
import {WISH_TICKET} from '../js/wish-lamp-model-v2077.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const api=read('functions/api/[[path]].js'),cms=read('admin/admin-v1276.js'),wishCms=read('admin/wish-lamp-v2077.js');
const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
const {couponRewardSpec,verifiedMessageRewardSpec}=Function(specs+';return {couponRewardSpec,verifiedMessageRewardSpec}')();
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const permanent=api.slice(api.indexOf("    if(path==='admin/coupon-create-permanent-v3')"),api.indexOf("    if(path==='admin/coupons'||path==='admin/coupons-v2')"));
const compatible=api.slice(api.indexOf("    if(path==='admin/coupons'||path==='admin/coupons-v2')"),api.indexOf("    if(path==='admin/users/card-grant')"));
const creationRoute=new AsyncFunction('path','request','env','requirePermission','readBody','releaseDeletedCouponCode','ensureWishLamp','json',specs+permanent+compatible);
const json=(value,status=200)=>Response.json(value,{status});
const deps={json,profile:async(_env,user)=>({id:Number(user.id),coin:Number(user.coin)})};

async function fixture(){
 const pg=new PGlite();await pg.exec(`
  CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE TABLE users(id bigint PRIMARY KEY,status text,coin bigint,banned_until text);
  INSERT INTO users VALUES(1,'ACTIVE',5000000000,NULL),(2,'ACTIVE',7000000000,NULL),(99,'ACTIVE',0,NULL);
  CREATE TABLE inventory_items(code text PRIMARY KEY,name text,subtitle text,description text,category text,rarity text,image_url text,sort_order bigint,is_active bigint);
  CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
  CREATE TABLE inventory_logs(id bigserial PRIMARY KEY,user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text);
  CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text);
  CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
  CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
  CREATE TABLE coupons(id bigserial PRIMARY KEY,code text UNIQUE,reward_coin bigint DEFAULT 0,reward_type text,reward_amount bigint,starts_at text,ends_at text,
   max_uses bigint,used_count bigint DEFAULT 0,is_active bigint DEFAULT 1,created_by bigint,deleted_at text,created_at text DEFAULT sqlite_now(),updated_at text);
  CREATE TABLE coupon_redemptions(coupon_id bigint,user_id bigint,reward_coin bigint,reward_type text,reward_amount bigint,operation_key text,redeemed_at text DEFAULT sqlite_now(),PRIMARY KEY(coupon_id,user_id));
  CREATE TABLE character_equipment_items(id bigint,code text,name text,slot text,image_url text,is_active bigint,is_public bigint);
  CREATE TABLE character_garage_items(id bigint,code text,name text,image_url text,is_active bigint,is_public bigint);
  CREATE TABLE user_garage_vehicles(user_id bigint,garage_id bigint);
 `);
 let fault='',zero='',permitted=true;
 const queries=[];
 const client={async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];queries.push(text);
  if(fault&&text.startsWith(fault))throw new Error('Injected failure');if(zero&&text.startsWith(zero))return {rows:[],rowCount:0};
  const r=await pg.query(text,values);return {...r,rowCount:r.affectedRows??r.rows.length};
 }};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const rows=async(sql,values=[])=>(await pg.query(sql,values)).rows;
 const row=async(sql,values=[])=>(await rows(sql,values))[0];
 async function create(body={},path='admin/coupon-create-permanent-v3'){
  const request=new Request('https://example.test/api/'+path,{method:'POST',body:JSON.stringify({code:'PINGDU-QA',rewardType:WISH_TICKET,rewardAmount:3,maxUses:10,...body})});
  return creationRoute(path,request,env,async()=>permitted?{id:99,role:'OWNER'}:null,r=>r.json(),async()=>{},ensureWishLamp,json);
 }
 async function redeem({userId=1,key='WISH_QA_REQUEST_1',code='PINGDU-QA',extra={}}={}){
  const coupon=await row('SELECT * FROM coupons WHERE code=$1',[code]);
  return redeemWishTicketCoupon({env,user:{id:userId},coupon,body:{operationKey:key,...extra},deps});
 }
 return {pg,env,rows,row,queries,create,redeem,setFault:v=>{fault=v},setZero:v=>{zero=v},deny:()=>{permitted=false},close:()=>pg.close()};
}
async function noRedemption(f){
 for(const t of ['coupon_redemptions','inventory_logs','cnine_user_inventory','coin_logs'])assert.equal(Number((await f.row('SELECT COUNT(*) n FROM '+t)).n),0,t);
 assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),0);
 assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),5000000000);
}

test('wish ticket is a coupon-only reward and keeps all existing coin/item limits',()=>{
 const spec=couponRewardSpec(' pingdu_wish_ticket ');assert.equal(spec.label,'핑두의 소원권');assert.equal(spec.inventory,true);assert.equal(spec.max,WISH_COUPON_MAX);
 assert.equal(verifiedMessageRewardSpec(WISH_TICKET),null);assert.equal(couponRewardSpec('COIN').max,1000000000);
 const meta=Function(cms.slice(cms.indexOf('const COUPON_REWARD_META='),cms.indexOf('function syncCouponRewardForm'))+';return COUPON_REWARD_META')();
 assert.equal(meta[WISH_TICKET].max,spec.max);assert.equal(meta[WISH_TICKET].label,spec.label);
});

test('both real CMS create routes register ticket, preserve settings, and never issue items on creation',async()=>{
 const f=await fixture();try{
  for(const [i,path] of ['admin/coupon-create-permanent-v3','admin/coupons','admin/coupons-v2'].entries()){
   const response=await f.create({code:'PINGDU-QA-'+i},path);assert.equal(response.status,201);const {coupon}=await response.json();
   assert.equal(coupon.reward_type,WISH_TICKET);assert.equal(Number(coupon.reward_amount),3);assert.equal(Number(coupon.reward_coin),0);assert.equal(coupon.starts_at,null);assert.equal(coupon.ends_at,null);
  }
  assert.equal((await f.row('SELECT code FROM inventory_items')).code,WISH_TICKET);await noRedemption(f);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM app_meta')).n),0);
  assert.equal((await wishLampState(f.env,1)).phase,'HIDDEN');
 }finally{await f.close()}
});

test('create rejects missing permission, zero/fractional/over-limit quantity, invalid code and use limits',async()=>{
 const f=await fixture();try{
  for(const change of [{rewardAmount:0},{rewardAmount:-1},{rewardAmount:1.5},{rewardAmount:100001},{rewardAmount:null},{code:'!!'},{code:'SLD-WISH'},{maxUses:0},{maxUses:1000001}])assert.equal((await f.create(change)).status,400);
  f.deny();assert.equal((await f.create()).status,403);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coupons')).n),0);
 }finally{await f.close()}
});

test('redemption credits the event inventory immediately, with one receipt/log and no coin change',async()=>{
 const f=await fixture();try{
  await f.create();const response=await f.redeem({extra:{userId:2,rewardAmount:999}});assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.rewardType,WISH_TICKET);assert.equal(result.rewardAmount,3);assert.equal(result.rewardCoin,0);assert.equal(result.user.coin,5000000000);assert.match(result.message,/소원램프/);
  const inventory=await f.row('SELECT * FROM cnine_user_inventory');assert.equal(Number(inventory.user_id),1);assert.equal(inventory.item_code,WISH_TICKET);assert.equal(Number(inventory.quantity),3);assert.equal(Number(inventory.unseen_quantity),3);
  const state=await wishLampState(f.env,1);assert.equal(state.tickets,3);assert.equal(state.phase,'HIDDEN');assert.equal(state.coin,5000000000);
  assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),1);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM inventory_logs')).n),1);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),0);assert(f.queries.some(s=>/FROM coupons .*FOR UPDATE/.test(s)));
  await f.pg.exec('UPDATE coupons SET is_active=0');const replay=await f.redeem();assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await f.redeem({key:'WISH_QA_OTHER_KEY'})).status,409);assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),3);
 }finally{await f.close()}
});

test('existing inventory accumulates and parallel last-use requests cannot exceed the global cap',async()=>{
 const f=await fixture();try{
  await f.create({maxUses:1});await f.pg.exec("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'PINGDU_WISH_TICKET',9,4)");
  const results=await Promise.all([f.redeem(),f.redeem({userId:2,key:'WISH_QA_SECOND_USER'})]);assert.deepEqual(results.map(r=>r.status),[200,409]);
  const inventory=await f.row('SELECT quantity,unseen_quantity FROM cnine_user_inventory');assert.equal(Number(inventory.quantity),12);assert.equal(Number(inventory.unseen_quantity),7);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coupon_redemptions')).n),1);assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),1);
 }finally{await f.close()}
});

test('duplicate concurrent requests return the saved result without a second grant',async()=>{
 const f=await fixture();try{await f.create();const responses=await Promise.all([f.redeem(),f.redeem()]);assert(responses.every(r=>r.status===200));
  assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),3);assert.equal(Number((await f.row('SELECT used_count FROM coupons')).used_count),1);
 }finally{await f.close()}
});

test('inventory/usage/log/receipt zero-row or write failures roll the entire redemption back',async()=>{
 const f=await fixture();try{
  await f.create();for(const sql of ['INSERT INTO cnine_user_inventory','UPDATE coupons','INSERT INTO inventory_logs','INSERT INTO coupon_redemptions']){
   f.setFault(sql);await assert.rejects(f.redeem(),/Injected failure/);f.setFault('');await noRedemption(f);
   f.setZero(sql);assert.equal((await f.redeem()).status,sql==='UPDATE coupons'?409:500);f.setZero('');await noRedemption(f);
  }
 }finally{await f.close()}
});

test('disabled/deleted/exhausted/misconfigured coupons, disabled tickets and inactive users grant nothing',async()=>{
 const f=await fixture();try{
  await f.create();
  for(const update of ["UPDATE coupons SET is_active=0","UPDATE coupons SET deleted_at='2026-09-10'","UPDATE coupons SET used_count=max_uses","UPDATE coupons SET reward_amount=0","UPDATE inventory_items SET is_active=0","UPDATE users SET status='BANNED' WHERE id=1","UPDATE users SET banned_until='2999-01-01 00:00:00' WHERE id=1"]){
   await f.pg.exec(update);const response=await f.redeem();assert(response.status>=400);await f.pg.exec("UPDATE coupons SET is_active=1,deleted_at=NULL,used_count=0,reward_amount=3;UPDATE inventory_items SET is_active=1;UPDATE users SET status='ACTIVE',banned_until=NULL");await noRedemption(f);
  }
  assert.equal(await redeemWishTicketCoupon({coupon:{reward_type:'COIN'}}),null);
 }finally{await f.close()}
});

test('event shortcut selects wish ticket and one item without generating a coupon',()=>{
 const functionText=wishCms.slice(wishCms.indexOf('export function openWishTicketCouponForm(){'),wishCms.indexOf('function mount(){')).replace('export ','');
 let clicked=0,focused=0,scrolled=0,changed=0;const amount={value:'1000'},select={value:'COIN',dispatchEvent:e=>{assert.equal(e.type,'change');changed++}};
 const document={querySelector:s=>s.startsWith('#nav')?{hidden:false,click:()=>clicked++}:{scrollIntoView:()=>scrolled++},getElementById:id=>({couponRewardType:select,couponRewardAmount:amount,couponCode:{focus:()=>focused++}}[id])};
 Function('document','Event',functionText+';openWishTicketCouponForm()')(document,Event);
 assert.equal(select.value,WISH_TICKET);assert.equal(amount.value,'1');assert.deepEqual([clicked,focused,scrolled,changed],[1,1,1,1]);
 const html=read('admin/index.html');assert.match(html,/<option value="PINGDU_WISH_TICKET">핑두의 소원권/);assert.match(html,/wish-coupon-2079/);assert.match(html,/coupon-bulk-delete\.js\?v=2079/);
 assert.match(wishCms,/소원권 쿠폰 만들기/);assert.match(wishCms,/data-ticket-coupon\]'\)\.disabled=false/);
});

test('bulk coupon list renders wish ticket amount rather than zero coins',()=>{
 const bulk=read('admin/admin-v1062-coupon-bulk-delete.js'),labels=bulk.slice(bulk.indexOf('  const rewardLabels='),bulk.indexOf('  const shortDate='));
 const render=bulk.slice(bulk.indexOf('  function renderCoupons(){'),bulk.indexOf('  async function loadCouponBulkAdmin'));
 const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 Function('document',labels+`const couponsCache=[{id:1,code:'PINGDU-QA',reward_type:'PINGDU_WISH_TICKET',reward_amount:5,reward_coin:0}];
  const escapeHtml=String,number=String,shortDate=()=>'',statusOf=()=>({label:'사용 가능',className:'on'}),syncSelectionUi=()=>{};
  ${render};renderCoupons();`)({querySelector:()=>root});
 assert.match(root.innerHTML,/<small>핑두의 소원권<\/small><strong>5<\/strong>/);assert(!root.innerHTML.includes('보상 코인'));
});
