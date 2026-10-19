import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {rankedOwnedMercenaries,rankedSelectedMercenaries} from '../functions/_mercenary_account.js';
import {readRankedRosters,saveRankedRoster,saveRankedSeriesTicket,readRankedSeriesTicket,rankedTicketPreview,rankedOwnershipGuard} from '../functions/_ranked_series.js';
import {RANKED_REFORM_SCHEMA,commitRankedFight,rankedFightReceipt,readRankedEnergy} from '../functions/_ranked_reform.js';
import {rankedSeriesCodes,simulateRankedSeries,rankedSeriesReceipt} from '../shared/ranked-series-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {operatingMercenaries,tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const codes=['V-001','V-002','V-003'];
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
async function fixture(t,postgres){
 let DB,db;
 if(postgres){db=new PGlite();await db.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') $$;"+schema.join(';'));DB=new __postgresCompatTest.PostgresD1Database({escapeLiteral:pg.Client.prototype.escapeLiteral,async query(input){if(typeof input==='string'){const r=(await db.exec(input)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return r.length===1?r[0]:r;}const r=await db.query(input.text,input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});}
 else{db=new DatabaseSync(':memory:');db.exec(schema.join(';'));const run=s=>{const q=db.prepare(s.sql);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...s.values).changes)}};};DB={prepare(sql){return {sql,values:[],bind(...values){return {...this,values};},async all(){return run(this)},async first(){return run(this).results[0]||null},async run(){return run(this)}}},async batch(list){db.exec('BEGIN');try{const r=list.map(run);db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};}
 t.after(()=>db.close());const env={DB},q=(sql,...values)=>DB.prepare(sql).bind(...values);
 const document=structuredClone(seed.document);for(const m of document.mercenaries)if(codes.includes(m.code))m.rank='A';
 await q('INSERT INTO mercenary_cms_documents_v1 VALUES(?,?,?)','config',JSON.stringify(document),1).run();
 for(const id of [1,2]){for(const code of codes)await q('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,?)',id,code,1).run();await q('INSERT INTO users VALUES(?,?,?)',id,100,0).run();await q('INSERT INTO pvp_profiles VALUES(?,?,?,?,?,?)',id,1000,1000,0,0,'original').run();}
 const settings={enabled:true,seasonName:'ranked-test',startsAt:'2020-01-01 00:00:00',endsAt:'2039-01-01 00:00:00',energy:{maxEnergy:10,costPerBattle:1,rechargeMinutes:5}};
 await q('INSERT INTO app_meta VALUES(?,?,CURRENT_TIMESTAMP)','pvp_settings_v1',JSON.stringify(settings)).run();
 const createTicket=async(token='t')=>{const rosters=await readRankedRosters(env,[1,2]);return saveRankedSeriesTicket(env,{insert:q('INSERT OR IGNORE INTO pvp_ranked_match_tickets_v1671 VALUES(?,?,?,NULL,?)',token,1,2,'2039-01-01 00:00:00'),ticket:{token},attacker:1,defender:2,rosters});};
 return {env,q,settings,createTicket};
}
test('requires three distinct types; copies and malformed inputs cannot qualify',()=>{
 for(const value of [[],codes.slice(0,2),[...codes,'V-004'],['V-001','V-001','V-002'],[null,...codes.slice(1)],'V-001'])assert.throws(()=>rankedSeriesCodes(value));
 assert.deepEqual(rankedSeriesCodes(codes),codes);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: ownership, frozen order, privacy, one set settlement and replay`,async t=>{
 const f=await fixture(t,postgres),{env,q}=f;
 assert.equal((await readRankedRosters(env,[1])).get(1).ready,false,'no automatic ranked enrollment');
 await assert.rejects(saveRankedRoster(env,{id:1},{codes:['V-001','V-001','V-001'],revision:0}));
 await assert.rejects(saveRankedRoster(env,{id:1},{codes:['V-001','V-002','V-004'],revision:0}),/보유/);
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=1 AND mercenary_code=?','V-003').run();
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=99 WHERE user_id=1 AND mercenary_code=?','V-001').run();
 assert.equal((await rankedOwnedMercenaries(env,[1])).get(1).length,2);
 await assert.rejects(saveRankedRoster(env,{id:1},{codes,revision:0}));
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=1 WHERE user_id=1 AND mercenary_code=?','V-003').run();
 await saveRankedRoster(env,{id:1},{codes,revision:0});await saveRankedRoster(env,{id:2},{codes:[...codes].reverse(),revision:0});
 await assert.rejects(saveRankedRoster(env,{id:1},{codes,revision:0}),/다른 창/);
 const ticket=await f.createTicket();assert.deepEqual(ticket.A,codes);assert.deepEqual(ticket.B,[...codes].reverse());
 assert.equal(await f.createTicket('racing-ticket'),null,'failed competing insert cannot overwrite winner payload');
 const preview=await rankedTicketPreview(env,ticket);assert.deepEqual(preview.opponent.map(m=>m.code),codes);assert.equal(preview.opponentOrderHidden,true);assert.ok(!('B' in preview));
 await assert.rejects(saveRankedRoster(env,{id:1},{codes:[...codes].reverse(),revision:1}),/매칭 중/);
 await saveRankedRoster(env,{id:2},{codes,revision:1});assert.deepEqual((await readRankedSeriesTicket(env,'t',1,2)).B,[...codes].reverse());
 assert.equal(await readRankedSeriesTicket(env,'t',2,1),null);
 const selected=await rankedSelectedMercenaries(env,new Map([[1,ticket.A],[2,ticket.B]]));assert.deepEqual(selected.get(2).map(m=>m.code),ticket.B);
 const series=simulateRankedSeries({createBattle:()=>({result:{winner:'A',reason:'ELIMINATION',actions:5}}),options:{},seed:3,attackerMercenaries:selected.get(1),defenderMercenaries:selected.get(2)});
 const user={id:1},energy=await readRankedEnergy(env,user,f.settings.energy),writes=()=>[...rankedOwnershipGuard(env,new Map([[1,ticket.A],[2,ticket.B]])),q('UPDATE pvp_profiles SET season_score=1024,wins=wins+1 WHERE user_id=1'),q('UPDATE users SET coin=coin+50 WHERE id=1'),q('INSERT INTO pvp_match_history VALUES(1,?)','A')];
 const commit=()=>commitRankedFight(env,{user,settings:f.settings,ticket:{token:'t'},requestId:'set-1',energy,beforeScore:1000,writes:writes(),response:{result:'WIN',scoreAfter:1024,rankedSeries:rankedSeriesReceipt(series)}});
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=2 AND mercenary_code=?',codes[2]).run();
 await assert.rejects(commit());assert.equal((await q('SELECT used_at FROM pvp_ranked_match_tickets_v1671 WHERE token=?','t').first()).used_at,null);assert.equal((await q('SELECT coin FROM users WHERE id=1').first()).coin,100);
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=1 WHERE user_id=2 AND mercenary_code=?',codes[2]).run();
 await commit();await assert.rejects(commit());const receipt=await rankedFightReceipt(env,1,'set-1','t');assert.equal(receipt.replayed,true);assert.deepEqual(receipt.rankedSeries.score,{A:2,B:0});assert.equal(receipt.energy.energy,9);assert.equal(receipt.coinAfter,150);
 assert.equal((await q('SELECT COUNT(*) n FROM pvp_match_history').first()).n,1);assert.equal((await q('SELECT season_score FROM pvp_profiles WHERE user_id=2').first()).season_score,1000);
});
test('2:0, 0:2 and 2:1 stop at two wins; every round gets new cards and mercenaries',()=>{
 const mercenaries=codes.map(code=>({code,name:code})),options={attackerCards:[{hp:100}],defenderCards:[{hp:100}]};
 for(const outcomes of [['A','A'],['B','B'],['A','B','A'],['B','A','B']]){
  let calls=0;const seeds=[];const result=simulateRankedSeries({createBattle:input=>{assert.equal(input.attackerCards[0].hp,100);input.attackerCards[0].hp=0;assert.equal(input.attackerMercenary.code,codes[calls]);seeds.push(input.seed);return {result:{winner:outcomes[calls++],reason:'ELIMINATION',actions:9}};},options,attackerMercenaries:mercenaries,defenderMercenaries:mercenaries,seed:1});
  assert.equal(calls,outcomes.length);assert.equal(new Set(seeds).size,calls);assert.equal(result.score[result.winner],2);assert.equal(options.attackerCards[0].hp,100);
 }
});
test('real PVP engine runs distinct mercenaries with deterministic fresh battles each round',()=>{
 const mercenaries=operatingMercenaries.slice(0,3),options={attackerCards:tierCards(90000),defenderCards:tierCards(90000)};
 const input={createBattle:createPvpBattleV2,options,attackerMercenaries:mercenaries,defenderMercenaries:[...mercenaries].reverse(),seed:19019};
 const result=simulateRankedSeries(input);assert.deepEqual(result,simulateRankedSeries(input));assert.ok([2,3].includes(result.rounds.length));
 for(const round of result.rounds){const direct=createPvpBattleV2({...structuredClone(options),attackerMercenary:mercenaries[round.number-1],defenderMercenary:[...mercenaries].reverse()[round.number-1],seed:(19019+Math.imul(round.number,0x9e3779b9))>>>0});assert.deepEqual(round.battleV2,direct);}
});
