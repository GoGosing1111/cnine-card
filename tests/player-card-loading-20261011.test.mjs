import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {backfillLichTrophyBaseline,aggregateLichProofs} from '../scripts/ops/lich-trophy-baseline-20261011.mjs';
import {LICH_LEGACY_BASELINE_KEY,lichClearKey,readLichClearHonors} from '../functions/_milestone_trophies.js';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE raid_lich_rooms_v1(room_id TEXT PRIMARY KEY,status TEXT,state_json TEXT);');
 for(const r of [{id:'old-paid',mode:'ON',members:[],paid:['1','2']},{id:'old-limited',mode:'ON',members:[{id:'1'}],weekly:{1:{used:7},3:{used:7}}},{id:'disabled',mode:'ON',members:[{id:'1'}]},{id:'test',mode:'TEST',members:[{id:'1'}]},{id:'failed',mode:'ON',members:[{id:'1'}]}])await db.query('INSERT INTO raid_lich_rooms_v1 VALUES($1,$2,$3)',[r.id,r.id==='failed'?'FAILED':'CLEAR',JSON.stringify({releaseMode:r.mode,finishedAt:Date.parse('2026-10-11T01:00:00Z'),members:r.members,petEssenceSettlement:{participantIds:r.paid},clearRewardSettlement:{weeklyByUser:r.weekly}})]);
 return db;
}
test('one-time baseline preserves newer live counts, counts verified rooms once, and replaces replay scans with account-key reads',async t=>{
 const db=await fixture(t),existing=JSON.stringify({count:4,acquiredAt:null,lastRoomId:'live-clear'});
 await db.query('INSERT INTO app_meta VALUES($1,$2)',[lichClearKey(1),existing]);
 const dry=await backfillLichTrophyBaseline(db,{dryRun:true});assert.equal(dry.rooms,3);assert.equal(dry.accounts,3);assert.equal((await db.query('SELECT COUNT(*) AS n FROM app_meta')).rows[0].n,1);
 const done=await backfillLichTrophyBaseline(db);assert.equal(done.inserted,2);assert.equal(done.preserved,1);
 assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[lichClearKey(1)])).rows[0].value,existing);
 assert.equal((await backfillLichTrophyBaseline(db)).replayed,true);
 await db.exec('DROP TABLE raid_lich_rooms_v1');const queries=[];
 const env={DB:new __postgresCompatTest.PostgresD1Database({async query(input){const text=typeof input==='string'?input:input.text;queries.push(text);return db.query(text,typeof input==='string'?[]:input.values);}})};
 assert.equal((await readLichClearHonors(env,1)).progress,4);assert.equal((await readLichClearHonors(env,2)).progress,1);assert.equal((await readLichClearHonors(env,3)).progress,1);assert.equal((await readLichClearHonors(env,99)).progress,0);
 assert.ok(queries.every(q=>/^SELECT /i.test(q)&&!q.includes('raid_lich_rooms')),'No replay queries or writes, even for an account with no clears');
});
test('baseline failure rolls back every imported account; a lost commit is recovered without counting twice',async t=>{
 const db=await fixture(t);let fail=true,lost=false;
 const wrapped={async query(sql,args){if(fail&&sql.startsWith('INSERT')&&args?.[0]===LICH_LEGACY_BASELINE_KEY)throw Error('INJECTED');const r=await db.query(sql,args);if(lost&&sql==='COMMIT'){lost=false;throw Error('LOST_COMMIT');}return r;}};
 await assert.rejects(backfillLichTrophyBaseline(wrapped),/INJECTED/);assert.equal((await db.query('SELECT COUNT(*) AS n FROM app_meta')).rows[0].n,0);
 fail=false;lost=true;await assert.rejects(backfillLichTrophyBaseline(wrapped),/LOST_COMMIT/);assert.equal((await backfillLichTrophyBaseline(wrapped)).replayed,true);
 assert.equal(JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[lichClearKey(1)])).rows[0].value).count,3);
});
test('the 1000th verified room sets the original achievement date, with duplicate participation proofs counted once',()=>{
 const rows=Array.from({length:1002},(_,i)=>({room_id:'room-'+i,finished_at:Date.parse('2026-10-01T00:00:00Z')+i*1000,members:[{id:'1'}],paid:['1'],weekly:{1:{}}}));
 const [[id,value]]=aggregateLichProofs(rows);assert.equal(id,1);assert.equal(value.count,1002);assert.equal(value.acquiredAt,new Date(rows[999].finished_at).toISOString());
});
for(const postgres of [false,true])test('new clears after the baseline start at one and remain idempotent '+(postgres?'Postgres':'SQLite'),async t=>{
 const h=await lichLiveFixture({postgres});t.after(()=>h.close());await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)',LICH_LEGACY_BASELINE_KEY,JSON.stringify({version:1}));
 const ready=await readyLichClear(h);assert.equal((await h.call('action',{body:ready.body})).status,200);await h.call('action',{body:ready.body});
 for(const id of [1,2,3])assert.equal((await readLichClearHonors(h.env,id)).progress,1);
});
