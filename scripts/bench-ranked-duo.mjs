// Isolated PostgreSQL-compatible fixture: never contacts production.
import {performance} from 'node:perf_hooks';
import {duoFixture} from '../tests/helpers/ranked-duo-db.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {operatingMercenaries} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {pairDuoParticipants} from '../shared/ranked-duo-v1.mjs';
const cleanups=[],f=await duoFixture({after:fn=>cleanups.push(fn)},{postgres:'pipeline'});
const summary=values=>{const v=[...values].sort((a,b)=>a-b),at=p=>Math.round(v[Math.min(v.length-1,Math.ceil(v.length*p)-1)]*100)/100;return {n:v.length,p50:at(.5),p95:at(.95),p99:at(.99),max:v.at(-1)};};
try{
 await f.ready();
 await f.pg.exec("INSERT INTO cards SELECT 'BENCH-'||i,'검수 카드','UR','ATTACK',1000,'',50,50,1 FROM generate_series(1,2000) i; INSERT INTO user_cards SELECT u,'BENCH-'||i,1,0 FROM generate_series(2,5) u CROSS JOIN generate_series(1,2000) i;");
 const samples={},measure=async(name,fn,n)=>{const ms=[],wire=[],cpu=[];for(let i=0;i<n;i++){f.resetQueries();const started=performance.now(),startCpu=process.cpuUsage();await fn(i);const used=process.cpuUsage(startCpu);ms.push(performance.now()-started);wire.push(f.queries().length);cpu.push((used.user+used.system)/1000);}samples[name]={ms:summary(ms),dbCalls:summary(wire),processCpuMs:summary(cpu)};};
 await measure('coldFourProfiles8000OwnedCards',async()=>{await f.p('DELETE FROM ranked_duo_profiles_v1').run();await loadDuoProfiles(f.env,[2,3,4,5],f.config,f.deps,{now:f.clock()});},12);
 await measure('warmFourProfiles',()=>loadDuoProfiles(f.env,[2,3,4,5],f.config,f.deps,{now:f.clock()}),50);
 await measure('status',()=>f.call('ranked-duo/status',{user:2}),30);
 await measure('matchNewTicket',async()=>{await f.p('DELETE FROM ranked_duo_tickets_v1').run();const r=await f.call('ranked-duo/match',{user:2,method:'POST'});if(r.status!==200)throw Error(JSON.stringify(r));},20);
 const requestTimes=[],requestCalls=[];for(let i=0;i<10;i++){const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'});f.resetQueries();const start=performance.now();const r=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{matchToken:ticket.data.token,requestId:'duo-bench-request-'+i}});if(r.status!==200)throw Error(JSON.stringify(r));requestTimes.push(performance.now()-start);requestCalls.push(f.queries().length);}
 samples.warmFight={ms:summary(requestTimes),dbCalls:summary(requestCalls)};
 const combat=[],bytes=[],timeline=[],roster=operatingMercenaries.filter(m=>['SS','SSS'].includes(m.rank));
 for(let seed=1;seed<=64;seed++){const squad=id=>({ownerId:id,ownerName:'검수'+id,cards:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'].map((rarity,i)=>({id:'C'+i,power:20000000*(id%2?1:1.6),rarity,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]})),equipmentBonus:15000000,mercenary:roster[(seed+id)%roster.length]});const start=performance.now(),b=createDuoBattleV2({attackerSquads:[squad(1),squad(2)],defenderSquads:[squad(3),squad(4)],seed});combat.push(performance.now()-start);bytes.push(Buffer.byteLength(JSON.stringify(b)));timeline.push(b.result.timeline.length);}
 samples.combat24Actors64Seeds={ms:summary(combat),jsonBytes:summary(bytes),timelineEvents:summary(timeline),mercenaryVariants:roster.length};
 const people=Array.from({length:10000},(_,i)=>({userId:i+1,power:1+(i*7919)%100000,joinedAt:'2026-09-25'})),start=performance.now(),paired=pairDuoParticipants(people);samples.pair10000={ms:performance.now()-start,teams:paired.teams.length,spreadPercent:paired.spreadPercent};
 const plans={};await f.pg.exec('SET enable_seqscan=off');
 for(const [name,sql]of Object.entries({rank:"SELECT * FROM ranked_duo_teams_v1 WHERE season_id='s' AND score>=1000 ORDER BY score,id LIMIT 12",history:"SELECT id FROM ranked_duo_matches_v1 WHERE season_id='s' AND attacker_id='t' ORDER BY created_at DESC,id DESC LIMIT 30",owned:"SELECT card_id FROM user_cards WHERE user_id IN(2,3,4,5) AND quantity>0"}))plans[name]=(await f.pg.query('EXPLAIN '+sql)).rows.map(r=>r['QUERY PLAN']);
 console.log(JSON.stringify({environment:'Node '+process.version+' / Windows / PGlite / no network latency',notes:['dbCalls counts actual adapter query() calls, including fixture authentication','cold and new-ticket samples include one setup DELETE','profile power/unique/synergy fixtures are simplified; magic and unique batch counts separately covered by tests','not a production throughput, latency or lock-wait guarantee'],samples,plans,heapMiB:process.memoryUsage().heapUsed/1048576},null,2));
}finally{for(const cleanup of cleanups)await cleanup();}
