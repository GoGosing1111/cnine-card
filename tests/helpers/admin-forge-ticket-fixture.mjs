import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {JOINT_TRANSACTION_SCHEMA} from '../../functions/_joint_transactions.js';
import {JOINT_ATOMIC_SCHEMA} from '../../functions/_joint_atomic.js';
import {grantForgeTickets,isForgeTicketGrant} from '../../functions/_admin_forge_ticket_grant.js';
import {readFileSync} from 'node:fs';

export async function forgeTicketFixture(t){
 const pg=new PGlite();t?.after(()=>pg.close());
 await pg.exec([
  "CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$",
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
  'CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT,banned_until TEXT,ban_reason TEXT)',
  "INSERT INTO users VALUES(1,'지급 검수 계정','USER','ACTIVE',1234,45,NULL,NULL),(2,'다른 계정','USER','ACTIVE',200,7,NULL,NULL),(9,'검수 운영자','OWNER','ACTIVE',999,0,NULL,NULL),(10,'검수 관리자','ADMIN','ACTIVE',0,0,NULL,NULL)",
  'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT,updated_at TEXT)',
  'CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT NOT NULL,unseen_quantity BIGINT NOT NULL,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
  'CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
  'CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
  ...JOINT_TRANSACTION_SCHEMA,...JOINT_ATOMIC_SCHEMA
 ].join(';'));
 let fault=null,queries=0;const sqls=[],locks=[];
 const client={async query(input){
  const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
  queries++;sqls.push(sql);
  if(fault?.pattern&&sql.includes(fault.pattern)){fault=null;throw Error('QA injected grant failure');}
  const result=await pg.query(sql,values);
  if(fault?.ack&&sql==='COMMIT'){fault=null;throw Error('QA lost commit response');}
  const rows=result.rows.map(convert);return {...result,rows,rowCount:result.affectedRows??rows.length};
 }};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)},owner={id:9,role:'OWNER',permissions:['USER_MANAGE']};
 const api=readFileSync(new URL('../../functions/api/[[path]].js',import.meta.url),'utf8');
 const source=api.slice(api.indexOf("    if(path==='admin/users/action'"),api.indexOf("    if(path==='admin/users/inventory-audit'"));
 const route=new (Object.getPrototypeOf(async()=>{}).constructor)('path','request','env','requirePermission','readBody','json','isForgeTicketGrant','grantForgeTickets','withJointUserMutationLock',source);
 const response=async(payload,admin=owner)=>route('admin/users/action',new Request('http://localhost/api/admin/users/action',{method:'POST',body:JSON.stringify(payload)}),env,
  async(_request,_env,permission)=>admin&&(admin.role==='OWNER'||(admin.role==='ADMIN'&&admin.permissions?.includes(permission)))?admin:null,
  request=>request.json(),(body,status=200)=>Response.json(body,{status}),isForgeTicketGrant,grantForgeTickets,
  async(_env,userId,path,work)=>{locks.push({userId,path});return work();});
 const one=async(sql,values=[])=>{const row=(await pg.query(sql,values)).rows[0];return row?convert(row):null;};
 const quantity=async(itemCode,userId=1)=>Number((await one('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[userId,itemCode]))?.quantity||0);
 return {pg,env,owner,one,quantity,response,locks,sqls,queries:()=>queries,fault:value=>{fault=value;},
  grant:(payload,admin=owner)=>grantForgeTickets(env,admin,{userId:1,itemCode:'PINGDU_REPAIR_COUPON',amount:3,reason:'검수 지급',requestId:crypto.randomUUID(),...payload})};
}
function convert(row){return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?Number(value):value]));}
