import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sealStarFixture} from '../../../tests/helpers/seal-star-fixture.mjs';
import {ensureRankRewardFixture} from '../../../tests/helpers/rank-reward-schema.mjs';
const f=await sealStarFixture('postgres');
try{
 await ensureRankRewardFixture(f.env);
 const settings=f.api.cleanSettings({...f.settings,format:'SEALS_BOSS',dailyAttempts:30,targets:{attack:1,guard:1,purify:1},bossStage:{name:'isolated measurement',hp:1e9,battlePower:10000}});
 await f.api.saveSettings(f.env,settings);const round=await f.api.adminStart(f.env,settings,f.owner);
 const hit=role=>f.request('seal-battle/participate',{requestId:crypto.randomUUID(),eventId:round.id,phase:role==='BOSS'?'BOSS':'SEALS',role},'USER');
 for(const role of ['ATTACK','GUARD','PURIFY'])assert.equal((await hit(role)).status,200);
 await hit('BOSS');
 let calls=[],transactions=[];
 const query=f.client.query.bind(f.client);f.client.query=async(...args)=>{const start=performance.now();try{return await query(...args);}finally{calls.push({sql:typeof args[0]==='string'?args[0]:args[0].text,ms:performance.now()-start});}};
 const batch=f.DB.batch.bind(f.DB);f.DB.batch=async(...args)=>{const start=performance.now();try{return await batch(...args);}finally{transactions.push(performance.now()-start);}};
 const samples=[];
 for(let i=0;i<10;i++){
  calls=[];transactions=[];const start=performance.now(),cpu=process.cpuUsage();const response=await hit('BOSS');assert.equal(response.status,200);
  const used=process.cpuUsage(cpu);samples.push({elapsedMs:performance.now()-start,cpuMs:(used.user+used.system)/1000,sqlCalls:calls.length,transactionMs:transactions,forUpdate:calls.filter(x=>/FOR UPDATE/.test(x.sql)).map(x=>x.sql.replace(/\s+/g,' ').trim())});
 }
 const summarize=key=>{const x=samples.map(s=>s[key]).sort((a,b)=>a-b);return {min:x[0],p50:x[4],max:x.at(-1)};};
 const report={at:new Date().toISOString(),environment:'Isolated PGlite via actual PostgreSQL compatibility adapter; simulated deck calculation; no network or production-load claims',samples:10,elapsedMs:summarize('elapsedMs'),cpuMs:summarize('cpuMs'),sqlCalls:summarize('sqlCalls'),transactionMs:samples.flatMap(s=>s.transactionMs),lockedSql:[...new Set(samples.flatMap(s=>s.forUpdate))],productionTraffic:false};
 fs.writeFileSync(new URL('request-measurement.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await f.close();}
