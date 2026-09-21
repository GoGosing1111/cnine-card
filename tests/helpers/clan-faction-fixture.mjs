import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {ensureFactionSchema} from '../../functions/_clan_faction.js';
import {newFactionState} from '../../functions/_clan_faction_model.js';
import {createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
import fs from 'node:fs';

export class FactionSQLite {
  sql=new DatabaseSync(':memory:');failAt='';beforeBatch=null;
  prepare(source){const db=this;return {source,values:[],bind(...values){this.values=values;return this;},
    async first(){return db.sql.prepare(source).get(...this.values)||null;},async all(){return {results:db.sql.prepare(source).all(...this.values)};},
    async run(){const r=db.sql.prepare(source).run(...this.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};}
  async batch(statements){
    if(this.beforeBatch){const fn=this.beforeBatch;this.beforeBatch=null;await fn();}
    this.sql.exec('BEGIN');try{const out=statements.map(s=>{if(this.failAt&&s.source.includes(this.failAt))throw Error('INJECTED_FAILURE');const q=this.sql.prepare(s.source);if(q.columns().length)return {results:q.all(...s.values)};const r=q.run(...s.values);return {meta:{changes:Number(r.changes)}};});this.sql.exec('COMMIT');return out;}catch(e){this.sql.exec('ROLLBACK');throw e;}
  }
}
const original=JSON.parse(fs.readFileSync(new URL('../../assets/ui/project-v/characters/prestige/manifest-v1.json',import.meta.url),'utf8'));
export const factionReviewCards=original.characters.slice(0,5).map((c,i)=>({id:c.cardId,title:c.title,name:c.member,grade:'PRESTIGE',type:['ATTACK','DEFENSE','SPEED','HP','BALANCED'][i],image:c.sourceArt,sourceArt:c.sourceArt}));
export async function factionFixture({postgres=false,seeded=false,realBattle=false}={}){
  let DB,pg,failAt='';
  if(postgres){
    pg=new PGlite();DB=new __postgresCompatTest.PostgresD1Database({async query(q){const sql=typeof q==='string'?q:q.text;if(failAt&&sql.includes(failAt))throw Error('INJECTED_FAILURE');const r=await pg.query(sql,typeof q==='string'?[]:q.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else DB=new FactionSQLite();
  const int=postgres?'BIGINT':'INTEGER';
  const schema=[`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)`,`CREATE TABLE users(id ${int} PRIMARY KEY,nickname TEXT,role TEXT,coin ${int} DEFAULT 100)`,
    `CREATE TABLE clan_seasons(id ${int} PRIMARY KEY,season_no INTEGER,phase TEXT,starts_at TEXT,ends_at TEXT)`,
    `CREATE TABLE clan_organizations(id ${int} PRIMARY KEY,name TEXT,mark_key TEXT,primary_color TEXT)`,
    `CREATE TABLE clan_season_teams(season_id ${int},clan_id ${int},master_user_id ${int},score INTEGER DEFAULT 50,wins INTEGER DEFAULT 5,losses INTEGER DEFAULT 2,PRIMARY KEY(season_id,clan_id))`,
    `CREATE TABLE clan_members(season_id ${int},user_id ${int},clan_id ${int},PRIMARY KEY(season_id,user_id))`];
  if(postgres)await pg.exec(schema.join(';'));else DB.sql.exec(schema.join(';'));
  const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args),clock={now:Date.now()},season={id:7,season_no:2,phase:'ACTIVE',starts_at:new Date(clock.now-86400000).toISOString(),ends_at:new Date(clock.now+86400000*14).toISOString()};
  await p('INSERT INTO clan_seasons VALUES(?,?,?,?,?)',season.id,season.season_no,season.phase,season.starts_at,season.ends_at).run();
  const clans=[['DK','DK','#2f7cff'],['T1','T1','#d32f4a'],['FM','FM','#1dad72'],['DC','DC','#7b4ae2'],['한화','HANWHA','#f1781f'],['LG','LG','#d64192'],['삼성','SAMSUNG','#3c74c9'],['롯데','LOTTE','#7b2445']];
  for(let i=0;i<clans.length;i++){
    await p('INSERT INTO clan_organizations VALUES(?,?,?,?)',i+1,...clans[i]).run();await p('INSERT INTO clan_season_teams(season_id,clan_id,master_user_id) VALUES(7,?,?)',i+1,i*100+1).run();
    for(let j=1;j<=12;j++){const id=i*100+j;await p('INSERT INTO users(id,nickname,role) VALUES(?,?,?)',id,j===1?`${clans[i][0]} 지휘관`:`${clans[i][0]} 부대원 ${j}`,'USER').run();await p('INSERT INTO clan_members VALUES(7,?,?)',id,i+1).run();}
  }
  await ensureFactionSchema(env);
  if(seeded){
    const s=newFactionState(clock.now-3600000);
    for(let i=1;i<=8;i++)s.formations[i]={attack1:[(i-1)*100+1,(i-1)*100+2,(i-1)*100+3],attack2:[(i-1)*100+4,(i-1)*100+5],defense1:[(i-1)*100+6,(i-1)*100+7,(i-1)*100+8],defense2:[(i-1)*100+9,(i-1)*100+10,(i-1)*100+11]};
    s.districts.forEach((d,i)=>{d.owner=i<22?i%8+1:0;d.defense=d.owner?'defense1':'';d.protectedUntil=i===3||i===13?clock.now+45*60000:0;});
    Object.assign(s.districts.find(d=>d.id==='11680'),{owner:2,defense:'defense1'});
    s.events=[{id:'demo-cap',kind:'CAPTURE',districtId:'11440',clanId:1,at:clock.now-20*60000},{id:'demo-def',kind:'DEFENDED',districtId:'11170',clanId:3,at:clock.now-45*60000}];
    await p('INSERT INTO clan_faction_state(season_id,state_json) VALUES(7,?)',JSON.stringify(s)).run();
  }
  let buildCalls=0;
  // Legacy combat/tax tests opt out explicitly; session fixtures replace this with the policy under test.
  const deps={factionSessionPolicy:{enabled:false},now:()=>clock.now,async buildFactionBattle(env,deps,user,opponent,seed){buildCalls++;
    if(!realBattle)return {battleV2:{teams:{B:{cards:[{maxHp:100}]}},result:{winner:'A',final:{B:[{hp:0}]}}},attackerPower:1000,defenderPower:1000};
    const cards=factionReviewCards;
    const a=cards.map(c=>({...c,power:90000})),b=cards.map(c=>({...c,power:85000}));
    const battleV2=createPvpBattleV2({attackerCards:a,defenderCards:b,seed});
    return {battleV2,attackerDeck:a,defenderDeck:b,attackerPower:battleV2.teams.A.summary.power,defenderPower:battleV2.teams.B.summary.power};
  }};
  return {env,DB,p,season,clock,deps,user:await p('SELECT * FROM users WHERE id=1').first(),buildCalls:()=>buildCalls,
    setFailure(value){failAt=value;if(!postgres)DB.failAt=value;},async close(){if(pg)await pg.close();else DB.sql.close();}};
}
