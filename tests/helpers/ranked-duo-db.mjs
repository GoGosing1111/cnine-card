import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import nodePg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {DUO_DEFAULTS} from '../../shared/ranked-duo-v1.mjs';
import {handleRankedDuo} from '../../functions/_ranked_duo.js';
const schema=[
 'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
 "CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT DEFAULT 'ACTIVE',banned_until TEXT)",
 'CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
 'CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT)',
 'CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,power_type TEXT,base_power BIGINT,image_url TEXT,focus_x INTEGER,focus_y INTEGER,member_id BIGINT)',
 'CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards',
 'CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level INTEGER,PRIMARY KEY(user_id,card_id))',
 'CREATE TABLE pvp_decks(user_id BIGINT PRIMARY KEY,card_ids TEXT)',
 'CREATE TABLE pvp_deck_presets(user_id BIGINT,preset_no INTEGER,card_ids TEXT,PRIMARY KEY(user_id,preset_no))',
 'CREATE TABLE pvp_active_presets(user_id BIGINT PRIMARY KEY,preset_no INTEGER)',
 'CREATE TABLE pvp_magic_presets(user_id BIGINT,preset_no INTEGER,magic_card_ids TEXT,PRIMARY KEY(user_id,preset_no))',
 'CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,slot TEXT,total_power BIGINT,pvp_power BIGINT,is_active INTEGER)',
 'CREATE TABLE user_equipment_instances(id BIGINT PRIMARY KEY,user_id BIGINT,equipment_id BIGINT)',
 'CREATE INDEX gear_owner ON user_equipment_instances(user_id)',
 'CREATE TABLE equipment_forge_states_v1(instance_id BIGINT PRIMARY KEY,user_id BIGINT,level INTEGER,revision INTEGER)',
 'CREATE TABLE user_equipment_loadout(user_id BIGINT,slot TEXT,instance_id BIGINT,PRIMARY KEY(user_id,slot))',
 'CREATE TABLE character_garage_items(id BIGINT PRIMARY KEY,pvp_power BIGINT,is_active INTEGER)',
 'CREATE TABLE user_garage_vehicles(user_id BIGINT,garage_id BIGINT,PRIMARY KEY(user_id,garage_id))',
 'CREATE TABLE user_garage_loadout(user_id BIGINT PRIMARY KEY,garage_id BIGINT)',
 'CREATE TABLE character_titles(id BIGINT PRIMARY KEY,pve_power BIGINT,is_active INTEGER)',
 'CREATE TABLE user_character_titles(user_id BIGINT,title_id BIGINT,expires_at TEXT,PRIMARY KEY(user_id,title_id))',
 'CREATE TABLE user_title_loadout(user_id BIGINT PRIMARY KEY,title_id BIGINT)',
 'CREATE TABLE user_mercenary_cards_v1(user_id BIGINT,mercenary_code TEXT,total_copies BIGINT,PRIMARY KEY(user_id,mercenary_code))',
 'CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT)',
 'CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER)'
];
export async function duoFixture(t,{postgres=false}={}){
 let native,pg,DB,queries=[],failAt='';
 if(postgres){
  pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");await pg.exec(schema.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;queries.push(sql);if(failAt&&sql.includes(failAt))throw Error('INJECTED_DUO_FAILURE');if(postgres==='pipeline'&&typeof input==='string'){const rows=(await pg.exec(sql)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return rows.length===1?rows[0]:rows;}const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};},...(postgres==='pipeline'?{escapeLiteral:value=>nodePg.Client.prototype.escapeLiteral.call(null,value)}:{})});
 }else{
  native=new DatabaseSync(':memory:');native.exec(schema.join(';'));
  const execute=s=>{queries.push(s.source);if(failAt&&s.source.includes(failAt))throw Error('INJECTED_DUO_FAILURE');const q=native.prepare(s.source);if(q.columns().length)return {results:q.all(...s.values),meta:{changes:0}};const r=q.run(...s.values);return {results:[],meta:{changes:Number(r.changes)}};};
  DB={prepare(source){return {source,values:[],bind(...values){return {...this,values};},async all(){return execute(this);},async first(){return execute(this).results[0]||null;},async run(){return execute(this);}};},async batch(list){native.exec('BEGIN');try{const result=list.map(execute);native.exec('COMMIT');return result;}catch(e){native.exec('ROLLBACK');throw e;}}};
 }
 t.after(()=>pg?pg.close():native.close());const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);
 let now=Date.parse('2026-09-25T00:00:00Z');
 await p('INSERT INTO mercenary_cms_documents_v1 VALUES(?,?,?)','config',JSON.stringify(MERCENARY_CMS_SEED.document),1).run();
 await p('INSERT INTO members VALUES(1,?)','카드 멤버').run();const cardIds=[];
 for(let i=0;i<5;i++){const id=`C-${i}`;cardIds.push(id);await p('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?)',id,`카드 ${i}`,['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i],['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],10000,'/assets/ui/cninelogo.png',50,50,1).run();}
 for(let uid=1;uid<=7;uid++){
  await p('INSERT INTO users(id,nickname,role) VALUES(?,?,?)',uid,uid===1?'운영자':`참가자${uid}`,uid===1?'OWNER':'USER').run();
  await p('INSERT INTO pvp_decks VALUES(?,?)',uid,JSON.stringify(cardIds)).run();await p('INSERT INTO pvp_active_presets VALUES(?,1)',uid).run();await p('INSERT INTO pvp_deck_presets VALUES(?,1,?)',uid,JSON.stringify(cardIds)).run();
  for(const id of cardIds)await p('INSERT INTO user_cards VALUES(?,?,1,?)',uid,id,14-uid).run();
 }
 const deps={now:()=>now,authenticate:async request=>p('SELECT * FROM users WHERE id=?',Number(request.headers.get('x-test-user'))).first(),readBody:request=>request.json(),json:(data,status=200)=>Response.json(data,{status}),
  readBattleSettings:async()=>({}),cardBattlePower:(card,level)=>Number(card.base_power||3200)*(1+level),cardUniqueDeckStates:async(_env,entries)=>entries.map(e=>({cards:e.cards})),evaluateDeckSynergiesBatch:async(_env,entries)=>entries.map(()=>({totals:{attackPercent:0}})),magicBattleLoadout:async()=>({cards:[]})};
 async function call(path,{user=1,method='GET',body={}}={}){const response=await handleRankedDuo({path:path.split('?')[0],request:new Request(`https://test/api/${path}`,{method,headers:{'x-test-user':String(user),'Content-Type':'application/json'},...(['GET','HEAD'].includes(method)?{}:{body:JSON.stringify(body)})}),env,deps});return {status:response.status,data:await response.json()};}
 const config={...structuredClone(DUO_DEFAULTS),visible:true,startsAt:new Date(now+72*3600000).toISOString(),endsAt:new Date(now+14*86400000).toISOString(),energy:{maximum:10,dailyGrant:10,cost:1}};
 return {env,DB,p,pg,native,deps,call,config,advance:ms=>now+=ms,clock:()=>now,queries:()=>queries,resetQueries:()=>queries=[],fail:value=>failAt=value,
  async ready(){for(const path of ['create','recruit']){const r=await call('admin/ranked-duo/'+path,{method:'POST',body:path==='create'?{config}:{}});if(r.status!==200)throw Error(JSON.stringify(r));}for(const user of [2,3,4,5]){const r=await call('ranked-duo/join',{user,method:'POST'});if(r.status!==200)throw Error(JSON.stringify(r));}now+=72*3600000;await call('admin/ranked-duo/pair',{method:'POST'});for(let i=0;i<8;i++){const r=await call('admin/ranked-duo/pair-step',{method:'POST'});if(r.status!==200)throw Error(JSON.stringify(r));if(r.data.done)break;}const r=await call('admin/ranked-duo/start',{method:'POST'});if(r.status!==200)throw Error(JSON.stringify(r));return r;}
 };
}
