import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture} from './helpers/ranked-duo-weekly.mjs';
import {DUO_RANDOM_MODE} from '../shared/ranked-duo-random-v4.mjs';
import {SEASON_S1_SCHEMA,seasonAwardStatements,seasonAccount} from '../functions/_season_s1.js';
import {kstDay,S1} from '../shared/season-s1.mjs';

async function ready(t,postgres,matchmaking){
 const f=await weeklyFixture(t,{postgres,matchmaking});await f.active();
 if(postgres)await f.DB.execSchema(SEASON_S1_SCHEMA.map(s=>s.replaceAll('INTEGER','BIGINT')));
 else for(const sql of SEASON_S1_SCHEMA)await f.p(sql).run();
 const start=f.clock()-60000;
 Object.assign(f.env,{SEASON_S1_ENABLED:'1',SEASON_S1_SCHEDULE:{PVE:{start},PVP:{start}},SEASON_S1_NOW:f.clock});
 return f;
}
const ticket=async f=>{const r=await f.call('ranked-duo/match',{method:'POST',user:2});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
const fight=(f,t,id)=>f.call('ranked-duo/fight',{method:'POST',user:2,body:{requestId:id,matchToken:t.token}});
const state=async(f,uid=2)=>(await seasonAccount(f.env,uid)).state;
const receipts=async f=>Number((await f.p("SELECT count(*) n FROM season_s1_receipts WHERE receipt_key LIKE 'award:S1_IMMORTAL_KING:PVP:DUO:%'").first()).n);
const solo=async(f,id)=>{const plan=await seasonAwardStatements(f.env,{source:'PVP',userId:2,eventId:id,won:false});await f.DB.batch(plan);};

for(const [engine,postgres] of [['SQLite',false],['PostgreSQL','pipeline']]){
 for(const matchmaking of ['FIXED',DUO_RANDOM_MODE]){
  test(engine+' '+matchmaking+': charge only the initiator once, share the solo daily and rune caps, recover the same match',async t=>{
   const f=await ready(t,postgres,matchmaking);
   for(let i=0;i<9;i++)await solo(f,'solo-'+i);
   const first=await ticket(f);assert.equal((await state(f)).tracks.PVP.events,9);
   await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id IN(?,?)',...first.opponent.members.map(m=>m.userId)).run();
   const before=(await state(f)).tracks.PVP.days[kstDay(f.clock())];
   const id='duo-s1-retry-test-0001';
   f.fail('INSERT INTO season_s1_receipts');assert.equal((await fight(f,first,id)).status,500);f.fail('');
   assert.equal(await receipts(f),0);assert.equal((await state(f)).tracks.PVP.events,9);
   assert.equal((await f.p('SELECT status FROM ranked_duo_matches_v1 WHERE request_id=?',id).first()).status,'PENDING');
   f.advance(31000);
   const res=await fight(f,first,id);assert.equal(res.status,200,JSON.stringify(res.data));assert.equal(res.data.status,'COMPLETED');assert.equal(res.data.result,'LOSE');
   assert.deepEqual((await fight(f,first,id)).data,res.data);
   const replay=await f.call('ranked-duo/replay',{user:2,method:'POST',body:{matchId:res.data.matchId}});assert.deepEqual(replay.data,res.data);
   const a=await state(f),track=a.tracks.PVP,day=kstDay(f.clock());assert.equal(track.counts.ALL,10);assert.equal(track.counts.PVP,10);
   assert.equal(track.days[day].events,before.events+1);assert.equal(a.common.activities,S1.dailyRuneBattles);assert(track.achievements.includes('match10'));
   const second=await ticket(f);
   await f.p('UPDATE user_cards SET breakthrough_level=0').run();
   await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id NOT IN(?,?)',...second.opponent.members.map(m=>m.userId)).run();
   const r=await fight(f,second,'duo-s1-distinct-0002');assert.equal(r.data.status,'COMPLETED',JSON.stringify(r.data));assert.equal(r.data.result,'WIN');
   const b=await state(f);assert.equal(b.tracks.PVP.counts.ALL,11);assert.equal(b.tracks.PVP.wins,Number(res.data.result==='WIN')+Number(r.data.result==='WIN'));assert.equal(await receipts(f),2);
   for(const key of ['days','materials','earned','participation','achievementXp','achievements'])assert.deepEqual(track[key],b.tracks.PVP[key],key);
   assert.deepEqual(b.common,a.common);assert.deepEqual(b.tracks.PVE,a.tracks.PVE);
   assert.equal(Number((await f.p('SELECT COUNT(*) n FROM season_s1_accounts WHERE user_id<>2').first()).n),0);
  });
 }
 test(engine+': a concurrent solo result is preserved and an unplayable battle refunds energy without a season event',async t=>{
  const f=await ready(t,postgres,DUO_RANDOM_MODE),first=await ticket(f);
  const original=f.DB.batch.bind(f.DB);let injected=false;
  f.DB.batch=async statements=>{
   if(!injected&&statements.some(s=>s.source.includes("SET status='COMPLETED'"))){injected=true;await solo(f,'duo-racing-solo');}
   return original(statements);
  };
  const r=await fight(f,first,'duo-s1-concurrent-solo');assert.equal(r.data.status,'COMPLETED',JSON.stringify(r.data));assert(injected);assert.equal((await state(f)).tracks.PVP.events,2);
  const second=await ticket(f),id='duo-s1-invalid-simulation';f.fail('UPDATE ranked_duo_players_v4 SET score');assert.equal((await fight(f,second,id)).status,500);f.fail('');
  const pending=await f.p('SELECT id,input_json FROM ranked_duo_matches_v1 WHERE request_id=?',id).first(),input=JSON.parse(pending.input_json);
  input.version='unsupported';await f.p('UPDATE ranked_duo_matches_v1 SET input_json=? WHERE id=?',JSON.stringify(input),pending.id).run();f.advance(31000);
  assert.equal((await fight(f,second,id)).data.code,'DUO_CANCELLED');assert.equal((await state(f)).tracks.PVP.events,2);assert.equal(await receipts(f),1);
 });
}
