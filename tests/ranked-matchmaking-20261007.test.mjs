import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {rankedPowerDifference} from '../shared/ranked-reform-v1.mjs';
import {RANKED_MATCH_BATCH_SIZE,RANKED_MATCH_CANDIDATE_LIMIT,RANKED_MATCH_MIN_POOL_SIZE,RANKED_MATCH_HISTORY_LIMIT,rankedMatchPower,rankedMatchBands,rankedMatchBand,selectRankedCandidate} from '../shared/ranked-matchmaking-v2.mjs';

const settings={matchSeasonRange:250,matchCardRange:20};
const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const matching=source.slice(source.indexOf('async function createRankedMatchTicket('),source.indexOf('async function claimRankedMatchTicket('));
const schema=`CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,banned_until TEXT);
CREATE TABLE pvp_profiles(user_id INTEGER PRIMARY KEY,season_score INTEGER,highest_score INTEGER,wins INTEGER DEFAULT 0,losses INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT);
CREATE TABLE pvp_match_history(id INTEGER PRIMARY KEY,attacker_id INTEGER,defender_id INTEGER);
CREATE TABLE pvp_ranked_match_tickets_v1671(token TEXT PRIMARY KEY,attacker_id INTEGER,defender_id INTEGER,season_key TEXT,attacker_score INTEGER,defender_score INTEGER,attacker_power INTEGER,defender_power INTEGER,expires_at TEXT,used_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX active_ranked_ticket ON pvp_ranked_match_tickets_v1671(attacker_id,season_key) WHERE used_at IS NULL;`;

async function fixture(t,{rows=[],recent=[],postgres=false,myDeckReady=true,myMercenaryPower=0,random=()=>0}={}){
 const sqlite=postgres?null:new DatabaseSync(':memory:'),pg=postgres?new PGlite():null;
 const raw=async(sql,values=[])=>postgres?(await pg.query(sql,values)).rows:sqlite.prepare(sql).all(...values);
 if(postgres){t.after(()=>pg.close());await pg.exec(readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8'));await pg.exec(schema+"CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$ SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') $$;");}
 else{sqlite.exec(schema);t.after(()=>sqlite.close());}
 const queries=[],writes=[],batches=[],mercenaryBatches=[],mercenaries=new Map([{id:1,mercenaryPower:myMercenaryPower},...rows].map(row=>[row.id,{power:row.mercenaryPower??0}])),powers=new Map(rows.map(row=>[row.id,{power:rankedMatchPower(row.power??1000,row.mercenaryPower??0),matchPower:rankedMatchPower(row.power??1000,row.mercenaryPower??0),deckReady:row.deckReady!==false}]));
 let db;
 if(postgres)db=new __postgresCompatTest.PostgresD1Database({async query(q){const result=await pg.query(typeof q==='string'?q:q.text,typeof q==='string'?[]:q.values);return {...result,rowCount:result.affectedRows??result.rows.length};}});
 else db={prepare(sql){let values=[];return {bind(...v){values=v;return this;},all:async()=>({results:sqlite.prepare(sql).all(...values)}),first:async()=>sqlite.prepare(sql).get(...values)||null,run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})};}};
 for(const row of [{id:1,power:100},...rows]){
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(row.id,'player-'+row.id,row.role||'USER',row.status||'ACTIVE',row.bannedUntil||null).run();
  await db.prepare('INSERT INTO pvp_profiles(user_id,season_score,highest_score,updated_at) VALUES(?,?,?,?)').bind(row.id,row.score??1000,row.score??1000,'2026-10-07 00:00:00').run();
  await db.prepare('INSERT INTO pvp_decks VALUES(?,?)').bind(row.id,row.deck||'[1,2,3,4,5]').run();
 }
 for(let i=0;i<recent.length;i++)await db.prepare('INSERT INTO pvp_match_history VALUES(?,?,?)').bind(recent.length-i,1,recent[i]).run();
 const env={DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this;},all:async()=>{queries.push({sql,values});return db.prepare(sql).bind(...values).all();},first:async()=>{queries.push({sql,values});return db.prepare(sql).bind(...values).first();},run:async()=>{writes.push(sql);return db.prepare(sql).bind(...values).run();}};}}};
 const ticketPayloads=new Map(),rosterCodes=['V-001','V-002','V-003'];
 const deps={
  readRankedRosters:async(_,ids)=>new Map(ids.map(id=>[Number(id),{ready:rows.find(row=>row.id===Number(id))?.rosterReady!==false,codes:rosterCodes}])),
  saveRankedSeriesTicket:async(_,{insert,ticket,attacker,defender})=>{const r=await insert.run();if(Number(r.meta.changes)!==1)return null;const payload={token:ticket.token,attacker,defender,A:rosterCodes,B:rosterCodes};ticketPayloads.set(ticket.token,payload);return payload;},
  readRankedSeriesTicket:async(_,token)=>ticketPayloads.get(token)||null,
  rankedTicketPreview:async()=>({opponentOrderHidden:true,attacker:[],opponent:[]}),
  RANKED_MATCH_BATCH_SIZE,RANKED_MATCH_CANDIDATE_LIMIT,RANKED_MATCH_MIN_POOL_SIZE,RANKED_MATCH_HISTORY_LIMIT,rankedMatchPower,rankedMatchBands,rankedMatchBand,
  selectRankedCandidate:(rows,settings,options)=>selectRankedCandidate(rows,settings,{...options,random}),rankedPowerDifference,
  ensureRankedPvpFoundation:async()=>{},pvpSeasonKey:()=> 'fixture-season',publicEquippedTitleMap:async()=>({}),resolvePvpTier:()=>({name:'test'}),pvpChallengerRank:async()=>0,pvpTierIndex:()=>0,
  pvpSeasonScoreAdjustment:()=>({change:24}),ensurePvpProfile:async()=>({season_score:1000}),battleSettings:async()=>({}),pvpFormationPower:async()=>({power:100,matchPower:100,deckReady:myDeckReady}),
  releasedMercenarySnapshots:async(_,ids,mode)=>{assert.equal(mode,'PVP');assert.equal(ids.length,2);mercenaryBatches.push(ids);return new Map(ids.map(id=>[id,mercenaries.get(id)]));},mercenarySnapshotPower:m=>m?.power??0,
  pvpDefenseFormationPowers:async(_,ids)=>{assert.ok(ids.length<=96);batches.push(ids);return new Map(ids.map(id=>[Number(id),powers.get(Number(id))]));},
  PVP_RANKED_ROLE_SQL:"UPPER(TRIM(COALESCE(u.role,'USER'))) <> 'OWNER'",pvpSqlUtc:ms=>new Date(ms).toISOString().replace('T',' ').slice(0,19)
 };
 const match=Function('deps',`with(deps){${matching}\nreturn createRankedMatchTicket;}`)(deps);
 return {call:()=>match(env,{id:1},settings),db,raw,queries,writes,batches,powers,mercenaryBatches};
}

test('widening keeps symmetric finite power caps and CMS baseline, with no unlimited fallback',()=>{
 assert.deepEqual(rankedMatchBands(settings),[{matchSeasonRange:250,matchCardRange:20},{matchSeasonRange:350,matchCardRange:30},{matchSeasonRange:500,matchCardRange:40}]);
 for(const [a,b,score,expected]of [[100,120,250,0],[120,100,250,0],[100,130,350,1],[100,140,500,2],[140,100,500,2],[100,141,500,-1],[100,100,501,-1],[0,100,0,-1]])assert.equal(rankedMatchBand({scoreDiff:score,powerDiff:rankedPowerDifference(a,b)},settings),expected);
 assert.equal(rankedMatchBand({scoreDiff:NaN,powerDiff:0},settings),-1);
 assert.equal(rankedMatchBands({matchSeasonRange:900,matchCardRange:95}).at(-1).matchCardRange,100);
});

test('normal matchmaking stops after one batch and excludes self, OWNER, banned, inactive and invalid decks',async t=>{
 const rows=Array.from({length:250},(_,i)=>({id:i+2}));
 Object.assign(rows[0],{power:100,role:'OWNER'});Object.assign(rows[1],{power:100,status:'SUSPENDED'});
 Object.assign(rows[2],{power:100,bannedUntil:'2999-01-01 00:00:00'});Object.assign(rows[3],{power:100,deck:'[1,2,3,4]'});
 Object.assign(rows[4],{power:100,deckReady:false});Object.assign(rows[5],{power:115});
 for(let i=6;i<13;i++)Object.assign(rows[i],{power:115});
 const f=await fixture(t,{rows}),result=await f.call();assert.equal(result.opponent.id,7);assert.equal(f.batches.length,1);assert.equal(f.batches[0].length,96);
 assert.ok(!f.batches.flat().some(id=>[1,2,3,4,5].includes(id)));
 assert.ok(f.writes.every(sql=>/^(DELETE FROM|INSERT OR IGNORE INTO) pvp_ranked_match_tickets/.test(sql)),'matching cannot charge energy, grant rewards or change scores');
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: searches past 96 rows and prefers baseline before widening`,async t=>{
 const rows=Array.from({length:193},(_,i)=>({id:i+2}));Object.assign(rows[0],{power:125});Object.assign(rows[158],{power:110});
 for(let i=159;i<166;i++)Object.assign(rows[i],{power:112});
 const f=await fixture(t,{rows,postgres}),result=await f.call();assert.equal(result.opponent.id,160);assert.equal(f.batches.length,2);assert.equal(f.batches.flat().length,192);
 const query=f.queries.find(x=>x.sql.includes('FROM users u JOIN pvp_profiles'));assert.equal(query.values.at(-1),768);assert.equal(query.values[2],500);
 const again=await f.call();assert.equal(again.token,result.token);assert.equal(again.reused,true);assert.equal(f.batches.length,2);
});

test('expanded tickets are usable and reused without rebuilding or silently rematching',async t=>{
 const f=await fixture(t,{rows:[{id:2,power:140,score:1500}]}),first=await f.call(),again=await f.call();
 assert.equal(first.opponent.id,2);assert.equal(first.opponent.balance.powerDifferencePercent,40);assert.equal(first.opponent.balance.scoreDifference,500);
 assert.equal(again.token,first.token);assert.equal(again.reused,true);assert.equal(f.batches.length,1);
});

test('third consecutive opponent is permitted only when no alternative fits any bounded band',async t=>{
 const only=await fixture(t,{rows:[{id:2,power:100}],recent:[2,2]});assert.equal((await only.call()).opponent.id,2);
 const alternative=await fixture(t,{rows:[{id:2,power:100},{id:3,power:125}],recent:[2,2]});assert.equal((await alternative.call()).opponent.id,3);
 const fresh=await fixture(t,{rows:[{id:2,power:100},{id:3,power:110}],recent:[2]});assert.equal((await fresh.call()).opponent.id,3);
});

test('search remains bounded and never accepts a deck outside the maximum balance limits',async t=>{
 const rows=Array.from({length:900},(_,i)=>({id:i+2}));rows.at(-1).power=100;
 const f=await fixture(t,{rows});await assert.rejects(f.call(),e=>e.status===409&&/균형 조건/.test(e.message));
 assert.equal(f.batches.length,8);assert.equal(f.batches.flat().length,768);assert.ok(!f.writes.some(sql=>sql.startsWith('INSERT')));
 const imbalance=await fixture(t,{rows:[{id:2,power:141},{id:3,power:100,score:1501}]});await assert.rejects(imbalance.call(),e=>e.status===409);
 const incomplete=await fixture(t,{rows:[{id:2,power:100}],myDeckReady:false});await assert.rejects(incomplete.call(),e=>e.status===400);assert.equal(incomplete.batches.length,0);
});

test('a formerly valid ticket outside the new settings is discarded before issuing a replacement',async t=>{
 const f=await fixture(t,{rows:[{id:2,power:120}]});
 await f.db.prepare('INSERT INTO pvp_ranked_match_tickets_v1671(token,attacker_id,defender_id,season_key,attacker_score,defender_score,attacker_power,defender_power,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').bind('old',1,2,'fixture-season',1000,1000,100,500,'2999-01-01 00:00:00').run();
 const result=await f.call();assert.notEqual(result.token,'old');assert.equal(result.opponent.id,2);assert.equal(f.batches.length,1);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: one early candidate does not stop the search before a diverse pool is available`,async t=>{
 const rows=Array.from({length:193},(_,i)=>({id:i+2}));rows[0].power=100;
 for(let i=96;i<103;i++)rows[i].power=110;
 const f=await fixture(t,{rows,recent:[2],postgres}),result=await f.call();
 assert.equal(result.opponent.id,98);assert.equal(f.batches.length,2);
 assert.deepEqual(f.queries.find(q=>q.sql.includes('SELECT defender_id FROM pvp_match_history')).values,[1,20]);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: refresh and concurrent match requests keep one opponent and one unused ticket`,async t=>{
 let draws=0;const rows=Array.from({length:20},(_,i)=>({id:i+2,power:100}));
 const f=await fixture(t,{rows,postgres,random:()=>++draws%2?0:0.999});
 const [a,b]=await Promise.all([f.call(),f.call()]);
 assert.equal(a.token,b.token);assert.equal(a.opponent.id,b.opponent.id);
 assert.equal((await f.raw('SELECT token FROM pvp_ranked_match_tickets_v1671 WHERE used_at IS NULL')).length,1);
 const before=draws;const refresh=await f.call();
 assert.equal(refresh.token,a.token);assert.equal(refresh.opponent.id,a.opponent.id);assert.equal(draws,before,'An existing ticket must not redraw');
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: mercenary advantage does not isolate matching and card-power tickets survive refresh`,async t=>{
 const f=await fixture(t,{postgres,myMercenaryPower:200,rows:[{id:2,power:110},{id:3,power:300,mercenaryPower:200}]});
 const result=await f.call();assert.equal(result.opponent.id,2);assert.equal(result.opponent.balance.powerDifferencePercent,10);
 const [ticket]=await f.raw('SELECT attacker_power,defender_power FROM pvp_ranked_match_tickets_v1671');
 assert.equal(Number(ticket.attacker_power),100);assert.equal(Number(ticket.defender_power),110);
 const again=await f.call();assert.equal(again.token,result.token);assert.equal(again.opponent.balance.powerDifferencePercent,10);assert.equal(f.batches.length,1);assert.deepEqual(f.mercenaryBatches,[]);
 const same=await fixture(t,{postgres,myMercenaryPower:200,rows:[{id:2,power:300,mercenaryPower:200}]});assert.equal((await same.call()).opponent.id,2,'same mercenaries remain eligible');
});

test('matching keeps card/equipment and season caps even when mercenaries hide the gap in full power',async t=>{
 const f=await fixture(t,{myMercenaryPower:200,rows:[{id:2,power:300},{id:3,power:300,mercenaryPower:200,score:1501}]});
 await assert.rejects(f.call(),e=>e.status===409);assert.ok(!f.writes.some(sql=>sql.startsWith('INSERT')));
 await f.db.prepare('INSERT INTO pvp_ranked_match_tickets_v1671(token,attacker_id,defender_id,season_key,attacker_score,defender_score,attacker_power,defender_power,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').bind('legacy-full-power',1,2,'fixture-season',1000,1000,300,300,'2999-01-01 00:00:00').run();
 await assert.rejects(f.call(),e=>e.status===409);assert.equal((await f.raw('SELECT token FROM pvp_ranked_match_tickets_v1671')).length,0);
});

test('an otherwise suitable defender without three saved owned types never enters the pool',async t=>{
 const f=await fixture(t,{rows:[{id:2,power:100,rosterReady:false},{id:3,power:105}]});
 assert.equal((await f.call()).opponent.id,3);assert.ok(!f.batches.flat().includes(2));
});
