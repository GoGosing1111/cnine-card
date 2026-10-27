import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {RANKED_REFORM_SCHEMA} from '../../functions/_ranked_reform.js';
import {readRankedRosters,saveRankedSeriesTicket} from '../../functions/_ranked_series.js';
import {RANKED_SERIES_RULES} from '../../shared/ranked-series-v1.mjs';
const schema=[...RANKED_REFORM_SCHEMA,
 'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
 'CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER,magic_crystals INTEGER)',
 'CREATE TABLE pvp_profiles(user_id INTEGER PRIMARY KEY,season_score INTEGER,highest_score INTEGER,wins INTEGER,losses INTEGER,updated_at TEXT)',
 'CREATE TABLE user_pvp_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,updated_at TEXT)',
 'CREATE TABLE user_mercenary_cards_v1(user_id INTEGER,mercenary_code TEXT,total_copies INTEGER,PRIMARY KEY(user_id,mercenary_code))',
 'CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER)',
 'CREATE TABLE pvp_ranked_match_tickets_v1671(token TEXT PRIMARY KEY,attacker_id INTEGER,defender_id INTEGER,used_at TEXT,expires_at TEXT)',
 'CREATE UNIQUE INDEX live_ticket ON pvp_ranked_match_tickets_v1671(attacker_id) WHERE used_at IS NULL',
 'CREATE TABLE pvp_match_history(attacker_id INTEGER,winner TEXT)',
];
export async function rankedFixture(t,postgres,{codes=['V-001','V-002','V-003'],ranks=[],rules=RANKED_SERIES_RULES}={}){
 let DB,db;
 if(postgres){db=new PGlite();await db.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') $$;"+schema.join(';'));DB=new __postgresCompatTest.PostgresD1Database({escapeLiteral:pg.Client.prototype.escapeLiteral,async query(input){if(typeof input==='string'){const r=(await db.exec(input)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return r.length===1?r[0]:r;}const r=await db.query(input.text,input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});}
 else{db=new DatabaseSync(':memory:');db.exec(schema.join(';'));const run=s=>{const q=db.prepare(s.sql);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...s.values).changes)}};};DB={prepare(sql){return {sql,values:[],bind(...values){return {...this,values};},async all(){return run(this)},async first(){return run(this).results[0]||null},async run(){return run(this)}}},async batch(list){db.exec('BEGIN');try{const r=list.map(run);db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};}
 const queries=[],prepare=DB.prepare.bind(DB);DB.prepare=sql=>{queries.push(sql);return prepare(sql);};
 t.after(()=>db.close());const env={DB},q=(sql,...values)=>DB.prepare(sql).bind(...values);
 const document=structuredClone(seed.document);for(const m of document.mercenaries)if(codes.includes(m.code))m.rank=ranks[codes.indexOf(m.code)]||'A';
 await q('INSERT INTO mercenary_cms_documents_v1 VALUES(?,?,?)','config',JSON.stringify(document),1).run();
 for(const id of [1,2]){for(const code of codes)await q('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,?)',id,code,1).run();await q('INSERT INTO users VALUES(?,?,?)',id,100,0).run();await q('INSERT INTO pvp_profiles VALUES(?,?,?,?,?,?)',id,1000,1000,0,0,'original').run();}
 const settings={enabled:true,seasonName:'ranked-test',startsAt:'2020-01-01 00:00:00',endsAt:'2039-01-01 00:00:00',energy:{maxEnergy:10,costPerBattle:1,rechargeMinutes:5}};
 await q('INSERT INTO app_meta VALUES(?,?,CURRENT_TIMESTAMP)','pvp_settings_v1',JSON.stringify(settings)).run();
 const createTicket=async(token='t')=>{const rosters=await readRankedRosters(env,[1,2],rules);return saveRankedSeriesTicket(env,{insert:q('INSERT OR IGNORE INTO pvp_ranked_match_tickets_v1671 VALUES(?,?,?,NULL,?)',token,1,2,'2039-01-01 00:00:00'),ticket:{token},attacker:1,defender:2,rosters},rules);};
 return {env,q,settings,createTicket,queries};
}
