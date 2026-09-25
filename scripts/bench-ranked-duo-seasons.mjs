// Local PostgreSQL fixture only. No production connection or account mutation.
import {performance} from 'node:perf_hooks';
import {duoFixture} from '../tests/helpers/ranked-duo-db.mjs';
import {prepareDuoAutomation,reconcileDuoSeason} from '../functions/_ranked_duo_seasons.js';
import {duoLifecycle} from '../functions/_ranked_duo.js';
const cleanup=[],f=await duoFixture({after:fn=>cleanup.push(fn)},{postgres:'pipeline'});
const samples={},summary=a=>{a.sort((a,b)=>a-b);return {p50:+a[Math.floor(a.length*.5)].toFixed(2),p95:+a[Math.min(a.length-1,Math.floor(a.length*.95))].toFixed(2),max:+a.at(-1).toFixed(2)};};
const measure=async(name,fn,n=30)=>{const ms=[],calls=[],cpu=[];for(let i=0;i<n;i++){f.resetQueries();const begin=performance.now(),before=process.cpuUsage();await fn();const used=process.cpuUsage(before);ms.push(performance.now()-begin);calls.push(f.queries().length);cpu.push((used.user+used.system)/1000);}samples[name]={n,ms:summary(ms),dbRoundtrips:summary(calls),processCpuMs:summary(cpu)};};
try{
 const start=f.clock(),settings={enabled:true,seasonName:'시즌 99',startsAt:new Date(start).toISOString(),endsAt:new Date(start+5*86400000).toISOString(),energy:{maxEnergy:5,rechargeMinutes:30,costPerBattle:1}};
 await prepareDuoAutomation(f.env);const tick=()=>reconcileDuoSeason(f.env,{settings,deps:f.deps,now:f.clock()});
 await tick();let s=await duoLifecycle.currentSeason(f.env);
 await f.pg.exec(`INSERT INTO users(id,nickname,role,status) SELECT 100+i,'대규모참가'||i,'USER','ACTIVE' FROM generate_series(0,9999) i;
  INSERT INTO ranked_duo_teams_v1 SELECT 'team-'||lpad(i::text,5,'0'),'${s.id}',100+i*2,101+i*2,1000,1000+i,0,0,'2026-09-26' FROM generate_series(0,4999) i;
  INSERT INTO ranked_duo_entries_v1(season_id,user_id,team_id,seed_power,joined_at) SELECT '${s.id}',100+i,'team-'||lpad((i/2)::text,5,'0'),1000,'2026-09-25' FROM generate_series(0,9999) i;`);
 await f.pg.exec('ANALYZE users; ANALYZE ranked_duo_teams_v1; ANALYZE ranked_duo_entries_v1');
 s.config.competitionStartedAt=new Date(start+86400000).toISOString();
 await f.p("UPDATE ranked_duo_seasons_v1 SET status='ACTIVE',participant_count=10000,config_json=? WHERE id=?",JSON.stringify(s.config),s.id).run();f.advance(86400000);
 await measure('idleScheduler10000Participants',tick);
 await measure('lobbyWith5000Teams',async()=>{const r=await f.call('ranked-duo/status',{user:100});if(r.status!==200)throw Error(JSON.stringify(r));});
 await measure('top100Of5000Teams',async()=>{const r=await f.call('ranked-duo/ranking',{user:100});if(r.data.ranking.length!==100)throw Error(JSON.stringify(r));});
 f.advance(4*86400000);await measure('finalize5000Teams20Trophies',tick,1);
 const final=await f.p('SELECT COUNT(*) AS n FROM ranked_duo_final_v2').first(),trophies=await f.p('SELECT COUNT(*) AS n FROM ranked_duo_trophies_v2').first();
 if(Number(final.n)!==5000||Number(trophies.n)!==20)throw Error('wrong final awards');
 const plan=(await f.pg.query(`EXPLAIN (ANALYZE,BUFFERS) SELECT id FROM ranked_duo_teams_v1 WHERE season_id=$1 ORDER BY score DESC,id DESC LIMIT 10`,[s.id])).rows;
 console.log(JSON.stringify({environment:'Node '+process.version+' / Windows / PGlite pipeline / zero network latency',participants:10000,teams:5000,samples,finalRows:Number(final.n),trophyRows:Number(trophies.n),rankPlan:plan,notes:['scheduler numbers exclude connection open/close, source settings read and heartbeat (2 indexed queries)','lobby includes fixture authentication','serialized embedded DB: production lock wait and network latency are not represented','CPU is the whole Node process including embedded PostgreSQL']},null,2));
}finally{for(const fn of cleanup)await fn();}
