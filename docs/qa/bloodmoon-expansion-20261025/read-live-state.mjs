import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {readBloodmoonPackState} from '../../../functions/_mercenary_bloodmoon_pack.js';
const out=path.resolve(process.argv[2]);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'bloodmoon-expansion-20261025',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const DB={dialect:'postgres',prepare(sql){assert.match(sql,/^SELECT\b/);let i=0;const query=sql.replace(/\?/g,()=>'$'+(++i)),build=(args=[])=>({bind:(...v)=>build(v),first:async()=>((await db.query(query,args)).rows[0]??null),all:async()=>({results:(await db.query(query,args)).rows})});return build();}};
 const state=await readBloodmoonPackState({DB});assert(state.userOpeningEnabled,state.readiness.blockers.join(' '));assert.equal(state.revision,8);assert.equal(state.settings.cardRatesPpm['V-973'],20);assert.equal(state.settings.cardRatesPpm['V-058'],400);assert(!state.stock.some(s=>s.code==='V-058'));assert.equal(state.cards.find(c=>c.code==='V-058').basePower,1000000);
 const {rawPack,normalCards,...safe}=state;const result={...safe,checkedAt:new Date().toISOString(),verificationSource:'production database, deployed source reader, READ ONLY',normalPoolCounts:Object.fromEntries(['C','B','A','S','SS','SSS'].map(rank=>[rank,normalCards.filter(c=>c.rank===rank).length]))};
 await db.query('ROLLBACK');fs.writeFileSync(path.join(out,'live-state.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({revision:state.revision,ready:state.readiness.ready,effectiveCardPercents:state.effectiveCardPercents,normalPoolCounts:result.normalPoolCounts,writes:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
