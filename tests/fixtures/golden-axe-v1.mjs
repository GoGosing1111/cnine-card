import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {AXE_KEY,AXE_REWARDS,AXE_PARTS,OLD_AXE,SUPERSTAR_13,PARTS_CHOICE,cleanAxeSettings,axeSettingsComplete,axePhase,pickAxeReward} from '../../js/golden-axe-model-v1.js';
import {goldenAxeAdmin,goldenAxeState,drawGoldenAxe,useGoldenAxeItem,goldenAxeItemOptions,handleGoldenAxe} from '../../functions/_golden_axe.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
const admin={id:99};
const settings=(key='COIN_500',extra={})=>({visible:true,enabled:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),axeCost:1,dailyLimit:0,rates:Object.fromEntries(AXE_REWARDS.map(r=>[r.key,r.key===key?100:0])),...extra});
export async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE users(id BIGINT PRIMARY KEY,status TEXT,coin BIGINT,banned_until TEXT);
 INSERT INTO users VALUES(1,'ACTIVE',0,NULL),(2,'ACTIVE',-3000000000,NULL),(99,'ACTIVE',0,NULL);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 CREATE TABLE inventory_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,name TEXT,slot TEXT,image_url TEXT,is_active BIGINT,is_public BIGINT);
 CREATE TABLE user_equipment_instances(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,equipment_id BIGINT,source_type TEXT,source_id TEXT,request_id TEXT UNIQUE);
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,image_url TEXT,is_active BIGINT,card_status TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level INTEGER,breakthrough_fail_count INTEGER,PRIMARY KEY(user_id,card_id));
 INSERT INTO cards_effective_v1210 VALUES('ss','테스트 슈퍼스타','SUPERSTAR','/card.png',1,'PUBLIC'),('fur','테스트 FUR','FUR','/card.png',1,'PUBLIC'),('max','13강 슈퍼스타','SUPERSTAR','/card.png',1,'PUBLIC');
 INSERT INTO user_cards VALUES(1,'ss',3,7,4),(1,'fur',1,10,2),(1,'max',1,13,0);
 `);
 const doc=structuredClone(MERCENARY_CMS_SEED.document);doc.mercenaries.forEach((m,i)=>m.rank=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===m.code).rank||(i<2?'S':'C'));await pg.query("INSERT INTO mercenary_cms_documents_v1 VALUES('config',$1,1)",[JSON.stringify(doc)]);
 for(const [i,r] of AXE_REWARDS.filter(r=>r.kind==='EQUIPMENT').entries())await pg.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,$4,$5,1,1)',[i+1,r.code,r.name,'BATTLE_SUIT',r.image]);
 for(const code of ['UNIQUE_ADVANCEMENT_PASS',...AXE_PARTS.map(p=>p.code)])await pg.query('INSERT INTO inventory_items(code,name,is_active) VALUES($1,$1,1)',[code]);
 let fault=null,clockReads=0,expire=false;
 const client={async query(input){const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];if(fault&&sql.includes(fault))throw Error('injected transaction failure');if(sql==='SELECT clock_timestamp() AS now'&&expire&&++clockReads===2)return {rows:[{now:new Date(Date.now()+3*86400000)}],rowCount:1};const r=await pg.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)},row=async(sql,args=[])=>(await pg.query(sql,args)).rows[0];
 await goldenAxeAdmin(env,admin);await pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,10,10),(2,$1,10,10)',[OLD_AXE]);
 const configure=async(key='COIN_500',extra={})=>{const c=await goldenAxeAdmin(env,admin);return goldenAxeAdmin(env,admin,{...settings(key,extra),revision:c.revision});};
 const body=async(id=1)=>{const s=await goldenAxeState(env,id);return {requestId:crypto.randomUUID(),revision:s.revision,quote:s.quote};};
 return {pg,env,doc,row,configure,body,state:(id=1)=>goldenAxeState(env,id),draw:(body,id=1,n=0)=>drawGoldenAxe(env,id,body,{randomInt:max=>n%max}),use:body=>useGoldenAxeItem(env,1,body),fault:value=>{fault=value;},expire:()=>{expire=true;clockReads=0;},close:()=>pg.close()};
}
