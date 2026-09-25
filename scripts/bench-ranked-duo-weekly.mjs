// Synthetic local PostgreSQL only; no production account or balance is touched.
import {performance} from 'node:perf_hooks';
import {weeklyFixture,day} from '../tests/helpers/ranked-duo-weekly.mjs';
const cleanup=[],f=await weeklyFixture({after:fn=>cleanup.push(fn)},{postgres:'pipeline'});
const summary=a=>{a.sort((a,b)=>a-b);return {p50:+a[Math.floor(a.length*.5)].toFixed(2),p95:+a[Math.min(a.length-1,Math.floor(a.length*.95))].toFixed(2),max:+a.at(-1).toFixed(2)};},samples={};
async function measure(name,fn,n=20){
 const ms=[],calls=[],cpu=[];for(let i=0;i<n;i++){f.resetQueries();const start=performance.now(),before=process.cpuUsage();await fn();const used=process.cpuUsage(before);ms.push(performance.now()-start);calls.push(f.queries().length);cpu.push((used.user+used.system)/1000);}
 samples[name]={n,ms:summary(ms),dbRoundtrips:summary(calls),processCpuMs:summary(cpu)};
}
try{
 await f.tick();const s=await f.season();
 await f.pg.exec(`INSERT INTO users(id,nickname,role) SELECT 100+i,'대규모참가'||i,'USER' FROM generate_series(0,9999) i;
 INSERT INTO ranked_duo_teams_v1 SELECT 'large-'||lpad(i::text,5,'0'),'${s.id}',100+i*2,101+i*2,1000,1000+i,0,0,'2026-09-26' FROM generate_series(0,4999) i;
 INSERT INTO ranked_duo_entries_v1(season_id,user_id,team_id,seed_power,joined_at) SELECT '${s.id}',100+i,'large-'||lpad((i/2)::text,5,'0'),1000,'2026-09-25' FROM generate_series(0,9999) i;
 ANALYZE users; ANALYZE ranked_duo_teams_v1; ANALYZE ranked_duo_entries_v1;`);
 s.config.competitionStartedAt=s.config.startsAt;await f.p("UPDATE ranked_duo_seasons_v1 SET status='ACTIVE',participant_count=10000,config_json=? WHERE id=?",JSON.stringify(s.config),s.id).run();f.advance(day);
 await measure('idle10000Participants',f.tick);
 await measure('lobby5000Teams',async()=>{const r=await f.call('ranked-duo/status',{user:100});if(r.status!==200)throw Error(JSON.stringify(r));});
 f.advance(7*day);await measure('freeze5000Teams',f.tick,1);
 await measure('pay40RecipientsPerTick',f.tick,250);await f.tick();
 const rows=await f.p('SELECT COUNT(*) AS n,SUM(reward_coin) AS coins,SUM(reward_shards) AS shards FROM ranked_duo_rewards_v3').first();
 if(Number(rows.n)!==10000||(await f.season()).status!=='CLOSED')throw Error('SETTLEMENT_INCOMPLETE');
 const plan=(await f.pg.query('EXPLAIN (ANALYZE,BUFFERS) SELECT * FROM ranked_duo_final_v2 WHERE season_id=$1 AND final_rank>4000 AND final_rank<=4020 ORDER BY final_rank LIMIT 20',[s.id])).rows;
 console.log(JSON.stringify({environment:'Node '+process.version+' / Windows / PGlite pipeline / zero network latency',participants:10000,teams:5000,samples,paid:rows,chunkPlan:plan,notes:['Worker connection open/close, ranked settings read and heartbeat are excluded.','Embedded PostgreSQL serializes connections; production network latency and lock waits are not represented.','Each settlement transaction locks at most 40 recipient rows. CPU is the entire Node process.']},null,2));
}finally{for(const fn of cleanup)await fn();}
