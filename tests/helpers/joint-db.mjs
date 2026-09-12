import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {__scrapyardTest} from '../../functions/_scrapyard.js';
import {__dropPoolTest,invalidateUnifiedDropPoolCache} from '../../functions/_drop_pool.js';
import {ensureScrapyardV3Schema} from '../../functions/_scrapyard_v3_runs.js';
import {ensureTowerV3Schema} from '../../functions/_tower_v3_runs.js';
import {ensureExpeditionV3Schema} from '../../functions/_expedition_v3_runs.js';
import {TOWER_V3_DRAFT} from '../../functions/_tower_v3.js';
import {TOWER_V3_ECONOMY_DRAFT} from '../../functions/_tower_v3_economy.js';
import {EXPEDITION_V3_DRAFTS} from '../../functions/_expedition_v3_settings.js';
import {__idleDungeonTest} from '../../functions/_idle_dungeon.js';
import {ensureJointAtomicSchema} from '../../functions/_joint_atomic.js';
import {discoverCowPortalReady} from '../../functions/_cow_room_portal.js';

export class JointSQLiteDB{
  constructor(filename=':memory:'){this.sql=new DatabaseSync(filename);this.failAt='';this.afterCommit=null;}
  prepare(source){const db=this;return {source,values:[],bind(...values){return {...this,values};},
    async first(){return db.sql.prepare(source).get(...this.values)||null;},
    async all(){return {results:db.sql.prepare(source).all(...this.values)};},
    async run(){return db.execute(this);}};}
  execute(s){if(this.failAt&&s.source.includes(this.failAt))throw Error('INJECTED_FAILURE');const q=this.sql.prepare(s.source);
    if(q.columns().length)return {results:q.all(...s.values),meta:{changes:0}};
    const r=q.run(...s.values);return {results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  async batch(statements){this.sql.exec('BEGIN');let r;try{r=statements.map(s=>this.execute(s));this.sql.exec('COMMIT');}catch(e){this.sql.exec('ROLLBACK');throw e;}await this.afterCommit?.(statements);return r;}
}
export const jointFixtureSchema=[...__scrapyardTest.FOUNDATION_SQL,...__dropPoolTest.FOUNDATION_SQL,
  "CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'OWNER',coin INTEGER DEFAULT 10000000,card_shards INTEGER DEFAULT 0,magic_crystals INTEGER DEFAULT 0)",
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
  'CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,effect_type TEXT,effect_value INTEGER,is_active INTEGER,is_public INTEGER)',
  'CREATE TABLE avatar_user_ownership_v1(user_id INTEGER,avatar_code TEXT,expires_at TEXT,PRIMARY KEY(user_id,avatar_code))',
  'CREATE TABLE avatar_user_loadout_v1(user_id INTEGER PRIMARY KEY,avatar_code TEXT)',
  'CREATE TABLE avatar_effect_options_v1(avatar_code TEXT,option_order INTEGER,effect_type TEXT,effect_value INTEGER,PRIMARY KEY(avatar_code,option_order))',
  'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,subtitle TEXT,description TEXT,sort_order INTEGER DEFAULT 0,is_active INTEGER DEFAULT 1)',
  'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER DEFAULT 0,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))',
  'CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)',
  'CREATE TABLE coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT)',
  'CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER DEFAULT 1,is_public INTEGER DEFAULT 1)',
  'CREATE TABLE user_equipment_instances(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,equipment_id INTEGER,source_type TEXT,source_id TEXT,request_id TEXT UNIQUE,acquired_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE user_equipment_loadout(user_id INTEGER,slot TEXT,instance_id INTEGER,PRIMARY KEY(user_id,slot))',
  'CREATE TABLE tower_user_progress(user_id INTEGER,highest_floor INTEGER)',
  'CREATE TABLE tower_seasons(id INTEGER PRIMARY KEY,status TEXT)',
  'CREATE TABLE tower_floor_ranges(id INTEGER PRIMARY KEY,season_id INTEGER,start_floor INTEGER,end_floor INTEGER,reward_coin INTEGER,monster_id INTEGER,is_active INTEGER)',
  'CREATE TABLE tower_floors(season_id INTEGER,floor_no INTEGER,reward_coin INTEGER,is_active INTEGER)',
  'CREATE TABLE battle_monsters(id INTEGER PRIMARY KEY,name TEXT,image_url TEXT,battle_power INTEGER,is_boss INTEGER DEFAULT 0,pve_enabled INTEGER DEFAULT 1,pve_display_order INTEGER,sort_order INTEGER,is_active INTEGER DEFAULT 1,tower_enabled INTEGER DEFAULT 1)',
  'CREATE TABLE tower_monsters(id INTEGER PRIMARY KEY,name TEXT,image_url TEXT,base_power INTEGER,is_boss INTEGER,is_active INTEGER,sort_order INTEGER)',
  'CREATE TABLE tower_clear_history(player_power INTEGER)',
  'CREATE TABLE raid_participants(total_power INTEGER)',
  'CREATE TABLE card_unique_effects(card_id TEXT,attack_percent INTEGER,defense_percent INTEGER,hp_percent INTEGER,speed_percent INTEGER,effect_name TEXT,effect_description TEXT,effect_type TEXT,trigger_type TEXT,effect_value INTEGER,trigger_chance INTEGER,max_activations INTEGER,is_active INTEGER,scope_pve INTEGER)',
  "CREATE TABLE idle_dungeon_progress(user_id INTEGER PRIMARY KEY,difficulty TEXT NOT NULL DEFAULT 'NORMAL',unlocked_difficulty INTEGER NOT NULL DEFAULT 1,current_floor INTEGER NOT NULL DEFAULT 1,highest_floor INTEGER NOT NULL DEFAULT 0,run_started_at TEXT,last_settled_at TEXT,pending_coin INTEGER NOT NULL DEFAULT 0,daily_coin INTEGER NOT NULL DEFAULT 0,daily_key TEXT,total_coin INTEGER NOT NULL DEFAULT 0,total_resets INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  'CREATE TABLE idle_dungeon_claim_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,reward_coin INTEGER NOT NULL DEFAULT 0,response_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE idle_dungeon_active_sessions(user_id INTEGER PRIMARY KEY,session_id TEXT NOT NULL,heartbeat_at TEXT NOT NULL,active_until TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)'
];
export async function jointFixture(t,{postgres=false,filename}={}){
  invalidateUnifiedDropPoolCache();__idleDungeonTest.resetCaches();let DB,pg,failAt='';
  if(postgres){pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    await pg.exec(jointFixtureSchema.map(s=>s.replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT','BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY').replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')).join(';'));
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;if(failAt&&sql.includes(failAt))throw Error('INJECTED_FAILURE');const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{DB=new JointSQLiteDB(filename);DB.sql.exec(jointFixtureSchema.join(';'));}
  const close=()=>pg?pg.close():DB.sql.close();t?.after(close);
  const env={DB},p=(sql,...v)=>DB.prepare(sql).bind(...v);await ensureTowerV3Schema(env);await ensureScrapyardV3Schema(env);await ensureExpeditionV3Schema(env);await ensureJointAtomicSchema(env);
  for(const id of [7,8])await p('INSERT INTO users(id,nickname) VALUES(?,?)',id,`검수 계정 ${id}`).run();
  for(let i=0;i<6;i++)await discoverCowPortalReady(env,{id:7},{sourceType:'HUNT',sourceRef:`fixture-portal-${i}`,result:'WIN'},{randomInt:()=>0});
  await p("INSERT INTO tower_seasons VALUES(1,'ACTIVE')").run();await p('INSERT INTO tower_floors VALUES(1,1,1000000,1)').run();
  await p("INSERT INTO battle_monsters(id,name,image_url,battle_power) VALUES(1,'귀여운 슬라임','assets/cards/monster/sla2.jfif',500000)").run();
  for(const code of ['SCRAPYARD_ENTRY_TICKET','VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE'])await p('INSERT INTO inventory_items(code,name,rarity,image_url) VALUES(?,?,?,?)',code,code,'SPECIAL','/test.png').run();
  await p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,'SCRAPYARD_ENTRY_TICKET',5)").run();
  const setting=async(key,value)=>p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
  await setting('tower_v3_settings_v1',{revision:0,config:{...TOWER_V3_DRAFT,mode:'TEST'},economy:{...TOWER_V3_ECONOMY_DRAFT}});
  await setting('expedition_v3_cow_room',{...EXPEDITION_V3_DRAFTS.COW_ROOM,mode:'TEST'});
  await setting('scrapyard_settings_v1676',{...__scrapyardTest.DEFAULT_SETTINGS,mode:'ON'});
  let power=20000000,clock=Date.parse('2026-09-13T00:00:00Z'),reads=0;
  const cards=()=>['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),title:`검수 카드 ${i+1}`,rarity:'FUR',power_type,power,base_power:power,image:'/test-card.png'}));
  const locks=new Map(),withUserMutationLock=async(_env,uid,_path,work)=>{const previous=locks.get(uid)||Promise.resolve();const next=previous.then(work,work);locks.set(uid,next.catch(()=>{}));return next;};
  const deps={json:(body,status=200)=>Response.json(body,{status}),now:()=>clock,authenticate:async request=>{
    const match=/^Bearer local-account-(7|8)$/.exec(request.headers.get('authorization')||'');return match?{id:Number(match[1]),nickname:`검수 계정 ${match[1]}`,role:'OWNER'}:null;},withUserMutationLock,
    raidDeckPower:async(_env,uid,ids,mode)=>{reads++;if(ids!==null||!['PVE','TOWER'].includes(mode))throw Error('INVALID_SNAPSHOT_CALL');return {ids:['1','2','3','4','5'],cards:cards(),power:power*5,characterBonus:{pve:0},battleSettings:{engine:{}}};},
    cardBattlePower:card=>card.base_power,magicBattleLoadout:async()=>({cards:[]}),selectActivatedUltimate:()=>null};
  return {env,p,DB,pg,deps,close,setting,setPower:n=>power=n,setClock:n=>clock=n,get reads(){return reads;},fail:s=>{failAt=s;DB.failAt=s;},
    user:{id:7,role:'OWNER',nickname:'검수 계정 7'},coin:async(id=7)=>Number((await p('SELECT coin FROM users WHERE id=?',id).first()).coin)};
}
