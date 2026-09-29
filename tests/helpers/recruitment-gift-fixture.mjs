import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {JOINT_TRANSACTION_SCHEMA} from '../../functions/_joint_transactions.js';
import {JOINT_ATOMIC_SCHEMA} from '../../functions/_joint_atomic.js';
import {RECRUITMENT_GIFT as gift,openRecruitmentGift,grantRecruitmentGift} from '../../functions/_recruitment_gift.js';
export async function recruitmentGiftFixture(t){
  const pg=new PGlite();t?.after(()=>pg.close());
  await pg.exec([
    "CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$",
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
    'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT NOT NULL,nickname TEXT,role TEXT,status TEXT,card_shards BIGINT DEFAULT 0,banned_until TEXT,ban_reason TEXT)',
    "INSERT INTO users(id,coin,nickname,role,status) VALUES(1,123,'영입전 검수 계정','USER','ACTIVE'),(2,400,'다른 계정','USER','ACTIVE'),(9,1000,'검수 운영자','OWNER','ACTIVE')",
    "INSERT INTO app_meta VALUES('safe_runtime_upgrade_v2121_foundation','1',NULL)",
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT,updated_at TEXT)',
    "INSERT INTO inventory_items(code,is_active) VALUES('MASTER_STAR',1),('STARLIGHT_ARMOR_CORE',1)",
    'CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT NOT NULL,unseen_quantity BIGINT NOT NULL,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
    "INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',17,3,NULL,NULL)",
    'CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
    'CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
    ...JOINT_TRANSACTION_SCHEMA,...JOINT_ATOMIC_SCHEMA
  ].join(';'));
  let fault=null,queries=0;const sqls=[];
  const client={async query(input){
    const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    queries++;sqls.push(sql);
    if(fault?.pattern&&sql.includes(fault.pattern)&&(!fault.itemCode||values.includes(fault.itemCode))){fault=null;throw Error('QA injected write failure');}
    const result=await pg.query(sql,values);
    if(fault?.ack&&sql==='COMMIT'){fault=null;throw Error('QA commit acknowledgement lost');}
    const rows=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v])));
    return {...result,rows,rowCount:result.affectedRows??rows.length};
  }};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const one=async(sql,values=[])=>{const row=(await pg.query(sql,values)).rows[0];return row&&Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]));};
  const quantity=async(code=gift.code,userId=1)=>Number((await one('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[userId,code]))?.quantity||0);
  const stock=async(n,userId=1)=>pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES($1,$2,$3,$3) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity',[userId,gift.code,n]);
  const open=(requestId=crypto.randomUUID(),count=1,userId=1)=>openRecruitmentGift(env,{id:userId},{requestId,count});
  const grant=(requestId=crypto.randomUUID(),amount=2,userId=1)=>grantRecruitmentGift(env,{id:9},{requestId,amount,userId,reason:'대회 검수'});
  return {pg,env,one,quantity,stock,open,grant,sqls,queries:()=>queries,fault:value=>{fault=value;}};
}
