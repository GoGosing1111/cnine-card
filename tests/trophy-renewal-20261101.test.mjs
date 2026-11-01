import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {readRenewedTrophyHonors,trophyHonors} from '../functions/_trophy_honors.js';
import {TROPHY_RENEWAL_KEY,RENEWED_TROPHY_CODES,parseTrophyRenewal} from '../functions/_trophy_renewal.js';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js';
import {emptyTrophyBonuses,validateTrophyBonuses,trophyBonusProjection} from '../shared/trophy-bonuses-v1.mjs';
import {applyTrophyManualGrants} from '../functions/_trophy_manual_grants.js';
const at='2026-11-01T03:00:00.000Z',ms=Date.parse(at);
async function fixture(t,postgres){
 const trace=[];let DB,exec,close;
 if(postgres){
  const pg=new PGlite();close=()=>pg.close();exec=q=>pg.exec(q);
  await exec("CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS')$$;");
  const compat=readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8');await exec(compat.match(/CREATE OR REPLACE FUNCTION sqlite_json_extract[\s\S]*?\$\$;/)[0]);
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const text=typeof input==='string'?input:input.text;trace.push(text);const r=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  const sql=new DatabaseSync(':memory:');close=()=>sql.close();exec=async q=>sql.exec(q);
  DB={prepare(source){return {args:[],bind(...args){return {...this,args};},async first(){trace.push(source);return sql.prepare(source).get(...this.args)||null;},async run(){trace.push(source);return sql.prepare(source).run(...this.args);}};}};
 }
 t.after(close);
 await exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text);
 CREATE TABLE pvp_season_settlements(id bigint PRIMARY KEY,season_name text,status text,started_at text,completed_at text);
 CREATE TABLE pvp_season_settlement_ranks(settlement_id bigint,user_id bigint,tier_id text,tier_name text,final_rank int,season_score int,wins int,losses int);
 CREATE TABLE clan_seasons(id bigint,phase text);
 CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,joined_at text);
 CREATE TABLE clan_organizations(id bigint);INSERT INTO clan_organizations VALUES(1);
 CREATE TABLE clan_season_settlements(season_id bigint,champion_clan_id bigint,status text,reward_status text,completed_at text);
 CREATE TABLE clan_championships(season_id bigint,winner_clan_id bigint,status text,completed_at text,reward_status text);
 CREATE TABLE clan_championship_rewards(season_id bigint,user_id bigint,reward_type text,reward_amount int,status text,completed_at text);
 CREATE TABLE clan_championship_members(season_id bigint,user_id bigint,clan_id bigint);
 CREATE TABLE raid_blackwing_rooms_v1(room_id text PRIMARY KEY,status text,state_json text);`);
 const p=(q,...a)=>DB.prepare(q).bind(...a),run=(q,...a)=>p(q,...a).run();
 const activate=()=>run('INSERT INTO app_meta VALUES(?,?)',TROPHY_RENEWAL_KEY,JSON.stringify({version:1,launchedAt:at}));
 const read=async(user=7,options)=>{trace.length=0;const result=await readRenewedTrophyHonors({DB},user,options);assert(trace.every(q=>/^\s*(SELECT|WITH)\b/i.test(q)),trace.join('\n'));return result;};
 const season=async(id,date,{tier='challenger',rank=20,participate=true,status='COMPLETED'}={})=>{
  await run('INSERT INTO pvp_season_settlements VALUES(?,?,?,?,?)',id,'s'+id,status,date,status==='COMPLETED'?date:null);
  if(participate)await run('INSERT INTO pvp_season_settlement_ranks VALUES(?,7,?,?,?,1000,1,0)',id,tier,tier,rank);
 };
 const raid=async(id,finishedAt,{mode='ON',status='CLEAR',user=7,left=false,proof=true,rewardStatus='WEEKLY_LIMIT'}={})=>run('INSERT INTO raid_blackwing_rooms_v1 VALUES(?,?,?)',id,status,JSON.stringify({releaseMode:mode,finishedAt,members:[{id:String(user),left}],clearRewards:proof?{[user]:{status:rewardStatus,granted:false}}:{}}));
 return {DB,run,read,activate,season,raid,trace};
}
for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(engine+': new collection stays locked until the immutable launch record exists, old manual grants never expand',async t=>{
  const f=await fixture(t,postgres);const result=await f.read();assert.deepEqual(Object.keys(result),RENEWED_TROPHY_CODES);assert(Object.values(result).every(x=>x.count===0));assert.equal(f.trace.length,1);
  const manual=applyTrophyManualGrants({...trophyHonors({}),...result},{grants:[{code:'CHALLENGER_STREAK_3',grantedAt:'2026-10-01T00:00:00Z'}]});assert.equal(manual.CHALLENGER_STREAK_3.count,1);assert.equal(manual.CHALLENGER_STREAK_3_V2.count,0);
  await f.run('INSERT INTO app_meta VALUES(?,?)',TROPHY_RENEWAL_KEY,'{}');await assert.rejects(f.read(),/INVALID_TROPHY_RENEWAL/);
 });
 test(engine+': ranked eras do not borrow old seasons; exact cutoff, gaps, retained records, and subsequent streaks',async t=>{
  const f=await fixture(t,postgres);await f.activate();
  for(let i=1;i<=3;i++)await f.season(i,'2026-10-'+String(20+i));
  await f.season(4,at);await f.season(5,'2026-11-02');
  let r=await f.read();assert.equal(r.CHALLENGER_STREAK_3.count,1);assert.equal(r.CHALLENGER_STREAK_3_V2.count,0);assert.equal(r.CHALLENGER_STREAK_3_V2.progress,2);
  await f.season(6,'2026-11-03',{participate:false});await f.season(7,'2026-11-04');await f.season(8,'2026-11-05');await f.season(9,'2026-11-06');
  r=await f.read();assert.equal(r.CHALLENGER_STREAK_3_V2.count,1);assert.equal(r.CHALLENGER_STREAK_3_V2.acquiredAt,'2026-11-06');assert.equal(r.CHALLENGER_STREAK_3.acquiredAt,'2026-10-23');
  await f.season(10,'2026-11-07',{tier:'master'});r=await f.read();assert.equal(r.CHALLENGER_STREAK_3_V2.count,1);assert.equal(r.CHALLENGER_STREAK_3_V2.progress,0);assert.equal((await f.read(8)).CHALLENGER_STREAK_3_V2.count,0);
 });
 test(engine+': Blackwing requires fifteen distinct post-launch official clears; rewards and later departure do not affect proof',async t=>{
  const f=await fixture(t,postgres);await f.activate();for(let i=0;i<14;i++)await f.raid('new'+i,ms+i*1000,{left:true});
  for(const [id,time,opts]of [['old',ms-1,{}],['test',ms,{mode:'TEST'}],['failed',ms,{status:'FAILED'}],['other',ms,{user:8}],['noproof',ms,{proof:false}],['active',ms,{status:'ACTIVE'}]])await f.raid(id,time,opts);
  let r=await f.read();assert.equal(r.BLACKWING_CLEAR_15.progress,14);assert.equal(r.BLACKWING_CLEAR_15.count,0);
  await f.raid('fifteenth',ms+14000);r=await f.read();assert.deepEqual(r.BLACKWING_CLEAR_15,{count:1,progress:15,goal:15,acquiredAt:new Date(ms+14000).toISOString(),availableFrom:at});assert.deepEqual(await f.read(),r);
  await f.raid('sixteenth',ms+15000);r=await f.read();assert.equal(r.BLACKWING_CLEAR_15.progress,16);assert.equal(r.BLACKWING_CLEAR_15.count,1);assert.equal(r.BLACKWING_CLEAR_15.acquiredAt,new Date(ms+14000).toISOString());
 });
 test(engine+': regular and champions victories split at launch and keep distinct verified winner memberships',async t=>{
  const f=await fixture(t,postgres);await f.activate();
  for(const [id,date]of [[1,'2026-10-30'],[2,at]]){
   await f.run("INSERT INTO clan_seasons VALUES(?,'COMPLETE')",id);await f.run("INSERT INTO clan_members VALUES(?,1,7,'2026-01-01')",id);await f.run("INSERT INTO clan_season_settlements VALUES(?,1,'COMPLETED','PAID',?)",id,date);
   await f.run("INSERT INTO clan_championships VALUES(?,1,'COMPLETED',?,'PAID')",id,date);await f.run("INSERT INTO clan_championship_members VALUES(?,7,1)",id);await f.run("INSERT INTO clan_championship_rewards VALUES(?,7,'CLAN_CHAMPIONS_TROPHY',1,'SENT',?)",id,date);
  }
  let r=await f.read();for(const code of ['CLAN_CHAMPION','CLAN_CHAMPION_V2','CLAN_CHAMPIONS_TROPHY','CLAN_CHAMPIONS_TROPHY_V2'])assert.equal(r[code].count,1,code);
  await f.run("UPDATE clan_championship_rewards SET status='PENDING' WHERE season_id=2");r=await f.read();assert.equal(r.CLAN_CHAMPIONS_TROPHY_V2.count,0);assert.equal(r.CLAN_CHAMPION_V2.count,1);
  await f.run("UPDATE clan_members SET joined_at='2026-12-01' WHERE season_id=2");r=await f.read();assert.equal(r.CLAN_CHAMPION_V2.count,0);assert.equal(r.CLAN_CHAMPION.count,1);assert.equal((await f.read(8)).CLAN_CHAMPION.count,0);
 });
}
test('twelve saved bonus settings remain unchanged and four additions default to zero; UI retains indices and marks old designs',()=>{
 const current=emptyTrophyBonuses(),old={version:1,trophies:current.trophies.filter(t=>!RENEWED_TROPHY_CODES.includes(t.code))};old.trophies.forEach(t=>t.rewardBonuses={coinPercent:2,dropPercent:1,accountXpPercent:3});
 const before=JSON.stringify(old),normalized=validateTrophyBonuses(old,{allowLegacy:true});assert.equal(normalized.trophies.length,16);assert.equal(JSON.stringify(old),before);assert.throws(()=>validateTrophyBonuses(old));
 const honors=trophyHonors({stats:{longest_streak:3},clanStats:{wins:1},champions:{wins:1}}),projection=trophyBonusProjection(normalized,honors);assert.deepEqual(projection.totals,{coinPercent:6,dropPercent:3,accountXpPercent:9});
 const window={location:{origin:'https://qa.test'}};vm.runInNewContext(readFileSync(new URL('../js/player-card-v2052.js',import.meta.url),'utf8'),{window,URL,Intl,AbortController});
 const reversed=[...projection.trophies].reverse(),html=window.PlayerCallingCard.render({player:{nickname:'검수'},ranked:{},trophies:reversed});
 const indices=[...html.matchAll(/data-pc-trophy="(\d+)"/g)].map(m=>Number(m[1]));assert.deepEqual(indices.slice(0,4).map(i=>reversed[i].code),RENEWED_TROPHY_CODES);assert(indices.slice(-3).every(i=>reversed[i].name.startsWith('(구) ')));
 assert.equal(TROPHY_CATALOG.filter(t=>t.edition==='legacy').length,3);assert.equal(parseTrophyRenewal(null),null);
});
