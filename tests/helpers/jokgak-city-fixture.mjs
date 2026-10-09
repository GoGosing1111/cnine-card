import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {ensureCitySchema} from '../../functions/_jokgak_city_schema.js';
import {assignedCityRole,cityAction} from '../../functions/_jokgak_city.js';
import {cityShift} from '../../shared/jokgak-city-v1.mjs';
import {defaultCitySettings} from '../../shared/jokgak-city-settings-v1.mjs';
export async function cityFixture(t,postgres=false){
  let sql,DB,fail='',lost=false,queryCount=0;const schema=["CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)","CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',banned_until TEXT,coin INTEGER DEFAULT 123456,card_shards INTEGER DEFAULT 0,magic_crystals INTEGER DEFAULT 0)",
    "CREATE TABLE admin_logs(admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)",
    "CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER)",
    "CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))",
    "CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)",
    "CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT)"
  ];
  if(postgres){
    sql=new PGlite();await sql.exec(schema.map(s=>s.replaceAll('INTEGER','BIGINT')).join(';'));
    await sql.exec("CREATE FUNCTION sqlite_datetime(VARIADIC args TEXT[]) RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    await sql.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){queryCount++;const text=typeof input==='string'?input:input.text;if(fail&&text.includes(fail))throw Error('INJECTED_FAILURE');const r=await sql.query(text,typeof input==='string'?[]:input.values||[]);if(text==='COMMIT'&&lost){lost=false;throw Error('LOST_COMMIT_RESPONSE');}return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{
    sql=new DatabaseSync(':memory:');sql.exec(schema.join(';'));
    DB={prepare(text){return {text,values:[],bind(...values){return {...this,values};},async first(){queryCount++;return sql.prepare(text).get(...this.values)||null;},async all(){queryCount++;return {results:sql.prepare(text).all(...this.values)};},async run(){queryCount++;if(fail&&text.includes(fail))throw Error('INJECTED_FAILURE');const r=sql.prepare(text).run(...this.values);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');let committed=false;try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');committed=true;if(lost){lost=false;throw Error('LOST_COMMIT_RESPONSE');}return out;}catch(e){if(!committed)sql.exec('ROLLBACK');throw e;}}};
  }
  t.after(()=>sql.close());const env={DB},p=(s,...v)=>DB.prepare(s).bind(...v);await ensureCitySchema(env);
  await p("INSERT INTO app_meta(key,value) VALUES('jokgak_city_role_seed_v1','isolated-test-only-seed')").run();
  await p("INSERT INTO app_meta(key,value) VALUES('jokgak_city_settings_v1',?)",JSON.stringify({...defaultCitySettings(),mode:'ON'})).run();
  await p("INSERT INTO inventory_items VALUES('CITY_TEST_ITEM','도시 검수 재료','NORMAL','assets/test.png',1),('OFF_ITEM','비활성','NORMAL','assets/test.png',0)").run();
  let now=Date.parse('2026-10-09T01:10:00Z');const users=new Map();
  for(let id=1;id<=80;id++){const user={id,nickname:id===20?'<img src=x onerror=alert(1)>':'참가자 '+id,role:'USER'};await p('INSERT INTO users(id,nickname) VALUES(?,?)',id,user.nickname).run();users.set(id,user);}
  const cards=Array.from({length:5},(_,i)=>({id:String(i),power:1000}));
  const deps={now:()=>now,pvpDeckSnapshot:async()=>cards,battleSettings:async()=>({}),cardBattlePower:card=>card.power,prepareCityBattle:async()=>({battleV2:{result:{winner:'A'}},attackerCards:cards,defenderCards:cards,mode:'PVP'}),withUserMutationLock:async(_e,_id,_path,fn)=>fn()};
  const action=(id,kind,values={})=>cityAction(env,deps,users.get(id),kind,{requestId:crypto.randomUUID(),epoch:cityShift(now).id,...values});
  const join=async(id,location='MARKET')=>{await action(id,'join');await p('UPDATE jokgak_city_players_v1 SET location=? WHERE user_id=?',location,id).run();};
  const roles={};for(let id=1;id<=80;id++){const role=await assignedCityRole(env,id,cityShift(now).id);roles[role]??=id;}
  return {env,p,deps,users,roles,action,join,get now(){return now;},advance:ms=>{now+=ms;},setTime:value=>{now=value;},fail:value=>{fail=value;},lost:()=>{lost=true;},queries:()=>queryCount};
}
