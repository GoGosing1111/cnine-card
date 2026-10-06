import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {ensureJointTransactionSchema} from '../../functions/_joint_transactions.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../../functions/_mercenary_draw_accounting.js';
import {ensureLimitedPackSchema} from '../../functions/_mercenary_limited_pack.js';
import {limitedPackDraft,LIMITED_PACK_KEY} from '../../shared/mercenary-limited-pack-v1.mjs';
import {limitedPolicyDraft,LIMITED_POLICY_KEY} from '../../shared/mercenary-limited-policy-v1.mjs';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw} from '../../shared/mercenary-draw-policy-v1.mjs';
export const schema=[
 "CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT NOT NULL DEFAULT 1000000)",
 "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)",
 "CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER)",
 "CREATE TABLE mercenary_draw_config_v1(id INTEGER PRIMARY KEY,payload_json TEXT,revision INTEGER)",
 "CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active BIGINT NOT NULL DEFAULT 1)",
 "CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT DEFAULT 0,unseen_quantity BIGINT DEFAULT 0,updated_at TEXT,PRIMARY KEY(user_id,item_code))",
 "CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)",
 "CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)",
 "CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)"
];
export async function limitedFixture(t){
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
 await pg.exec(schema.join(';'));
 const stats={queries:0,batches:0,statements:0,sql:[]};let failAt='',lostAck=false;
 const DB=new __postgresCompatTest.PostgresD1Database({async query(input){
  const sql=typeof input==='string'?input:input.text;stats.queries++;stats.sql.push(sql);
  if(failAt&&sql.includes(failAt))throw Error('INJECTED_FAILURE');
  const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};
 }});
 // PGlite exposes one session. Production multi-connection contention is measured separately.
 const batch=DB.batch.bind(DB);let tail=Promise.resolve();
 DB.batch=async list=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;
  try{stats.batches++;stats.statements+=list.length;const result=await batch(list);if(lostAck){lostAck=false;throw Error('LOST_COMMIT_ACK');}return result;}finally{release();}};
 const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);
 await ensureJointTransactionSchema(env);await DB.execSchema(MERCENARY_ACCOUNTING_SCHEMA);await ensureLimitedPackSchema(env);
 await pg.exec("INSERT INTO users(id) SELECT generate_series(1,70); INSERT INTO inventory_items(code) VALUES('MASTER_STAR'),('STARLIGHT_ARMOR_CORE')");
 const document=structuredClone(MERCENARY_CMS_SEED.document);
 // Isolated test ranks stand in for the operator's persisted ordinary roster.
 document.mercenaries.filter(c=>c.rank===null).forEach((c,i)=>{c.rank=['C','B','A','S'][i%4];});
 await p('INSERT INTO mercenary_cms_documents_v1(doc_key,payload_json,revision) VALUES(?,?,1)','config',JSON.stringify(document)).run();
 await p('INSERT INTO mercenary_draw_config_v1(id,payload_json,revision) VALUES(1,?,1)',JSON.stringify(suggestedMercenaryDraw())).run();
 const setting=async(key,value)=>p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
 const policy=limitedPolicyDraft(),packSettings=limitedPackDraft();policy.rankRatesPpm={SS:1000000,SSS:0};policy.cardWeights=Object.fromEntries(Object.keys(policy.cardWeights).map(code=>[code,code==='V-990'?1:0]));
 packSettings.normalRankRatesPpm=Object.fromEntries(Object.keys(packSettings.normalRankRatesPpm).map(rank=>[rank,0]));
 packSettings.prices={single:100,ten:900};for(const code in packSettings.stockLimits)packSettings.stockLimits[code]=100;packSettings.extraRewards=packSettings.extraRewards.map(r=>({...r,chancePpm:0,quantity:r.id==='NONE'?0:10}));
 const configure=async({enabled=true,limit=100,revision=1}={})=>{
  packSettings.mode=enabled?'ON':'OFF';packSettings.stockLimits['V-990']=limit;
  await setting(LIMITED_POLICY_KEY,{revision,policy});
  await setting(LIMITED_PACK_KEY,{revision,settings:packSettings});
  for(const [code,n]of Object.entries(packSettings.stockLimits))await p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET stock_limit=excluded.stock_limit',code,n).run();
 };
 return {env,DB,pg,p,policy,packSettings,setting,configure,stats,fail:value=>failAt=value,loseAck:()=>lostAck=true,user:{id:1,role:'OWNER'},coin:async(id=1)=>Number((await p('SELECT coin FROM users WHERE id=?',id).first()).coin)};
}
