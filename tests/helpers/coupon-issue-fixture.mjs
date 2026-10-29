import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {createCouponWithinIssueLimit,readCouponIssueLimit} from '../../functions/_coupon_issue_limits.js';

const server=readFileSync(new URL('../../functions/api/[[path]].js',import.meta.url),'utf8');
const specs=server.slice(server.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),server.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
const routes=server.slice(server.indexOf("    if(path==='admin/coupon-create-permanent-v3')"),server.indexOf("    if(path==='admin/users/card-grant')"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const route=new AsyncFunction('path','request','env','requirePermission','readBody','json','createCouponWithinIssueLimit','readCouponIssueLimit','releaseDeletedCouponCode','writeAdminLog',specs+routes);
export const COUPON_ISSUE_PATHS=['admin/coupon-create-permanent-v3','admin/coupons','admin/coupons-v2'];
export async function couponIssueFixture(){
 const pg=new PGlite();await pg.exec(`
  CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE TABLE users(id bigint PRIMARY KEY,role text,nickname text,status text,coin bigint);
  INSERT INTO users VALUES(1,'OWNER','핑크빛유두','ACTIVE',9),(2,'OWNER','Inception','ACTIVE',8),(6,'OWNER','남수단','ACTIVE',7),(5663,'OWNER','비숑','ACTIVE',6),(99,'ADMIN','쿠폰운영','ACTIVE',5);
  CREATE TABLE coupons(id bigserial PRIMARY KEY,code text UNIQUE,reward_coin bigint DEFAULT 0,reward_type text,reward_amount bigint,starts_at text,ends_at text,max_uses bigint,used_count bigint DEFAULT 0,is_active bigint DEFAULT 1,created_by bigint,deleted_at text,deleted_by bigint,created_at text DEFAULT sqlite_now(),updated_at text);
  CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
  CREATE TABLE joint_atomic_guards_v1(token text PRIMARY KEY,verified bigint NOT NULL CHECK(verified=1));
 `);
 let failPrefix='';const queries=[];
 const client={async query(input){const text=typeof input==='string'?input:input.text;queries.push(text);if(failPrefix&&text.startsWith(failPrefix))throw Error('INJECTED_COUPON_ISSUE_FAILURE');const r=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)},json=(body,status=200)=>Response.json(body,{status});
 const rows=async(sql,args=[])=>(await pg.query(sql,args)).rows;
 const owner={id:2,role:'OWNER',nickname:'Inception'};
 const release=async()=>{throw Error('Unexpected non-coin deleted code reuse in fixture');};
 const log=async(_env,user,action,type,id,before,after)=>env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(user.id,action,type,id,JSON.stringify(before),JSON.stringify(after)).run();
 const call=async({path=COUPON_ISSUE_PATHS[0],admin=owner,method='POST',body={}}={})=>{
  const req=new Request('https://qa.test/api/'+path,{method,...(method==='GET'?{}:{body:JSON.stringify({code:'COUPON-QA',rewardType:'COIN',rewardAmount:1e12,maxUses:1000000,...body})})});
  const response=await route(path,req,env,async()=>admin,r=>r.json(),json,createCouponWithinIssueLimit,readCouponIssueLimit,release,log);
  return {status:response.status,body:await response.json()};
 };
 return {pg,env,owner,rows,call,queries,fail:prefix=>{failPrefix=prefix},close:()=>pg.close()};
}
