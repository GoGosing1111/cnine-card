import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {rankedDuoLiveOperation} from '../functions/_ranked_duo_live_operation.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} duo board reads only the visible current season and respects deadlines`,async t=>{
 const f=await duoFixture(t,{postgres});
 await f.call('admin/ranked-duo/create',{method:'POST',body:{config:f.config}});
 assert.equal(await rankedDuoLiveOperation(f.env,f.clock()),null);
 await f.call('admin/ranked-duo/recruit',{method:'POST'});f.resetQueries();
 const item=await rankedDuoLiveOperation(f.env,f.clock());assert.equal(f.queries().length,1);
 assert.equal(item.kind,'RANKED_DUO');assert.equal(item.phase,'RECRUITING');assert.equal(typeof item.entityId,'string');
 assert.equal(item.deadlineAt,new Date(f.clock()+86400000).toISOString());
 assert.equal(await rankedDuoLiveOperation(f.env,f.clock()+86400000),null);
 await f.p("UPDATE ranked_duo_seasons_v1 SET status='ACTIVE'").run();
 assert.equal(await rankedDuoLiveOperation(f.env,f.clock()),null);
 assert.equal((await rankedDuoLiveOperation(f.env,f.clock()+86400000)).phase,'ACTIVE');
 assert.equal(await rankedDuoLiveOperation(f.env,Date.parse(f.config.endsAt)),null);
 await f.p('UPDATE ranked_duo_seasons_v1 SET config_json=?',JSON.stringify({...f.config,visible:false})).run();
 assert.equal(await rankedDuoLiveOperation(f.env,f.clock()+86400000),null);
});

test('duo failures do not suppress other content, and the existing cache avoids repeated lookups',async()=>{
 const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const source=api.slice(api.indexOf('async function liveOperationAlerts(env){'),api.indexOf('let cardAcquisitionGradeFxCache'));
 let calls=0;const ctx=vm.createContext({Date,console:{error(){}},liveOperationsCache:null,LIVE_OPERATIONS_CACHE_MS:15000,coupLiveOperation:async()=>null,rankedDuoLiveOperation:async()=>{calls++;throw Error('Missing duo table');}});
 vm.runInContext(source,ctx);
 const env={DB:{prepare:()=>({all:async()=>({results:[{kind:'SEAL',phase:'ACTIVE',entity_id:49,title:'봉인전'}]})})}};
 assert.equal((await ctx.liveOperationAlerts(env))[0].kind,'SEAL');await ctx.liveOperationAlerts(env);assert.equal(calls,1);
 ctx.liveOperationsCache=null;ctx.rankedDuoLiveOperation=async()=>({kind:'RANKED_DUO',phase:'RECRUITING',entityId:'weekly-1'});
 const items=await ctx.liveOperationAlerts(env);assert.equal(items[0].kind,'RANKED_DUO');assert.equal(items[1].kind,'SEAL');
});

test('duo recruitment has a real countdown and opens the existing duo screen',()=>{
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),routes=[];
 const ctx=vm.createContext({Date,escapeHtml:s=>String(s),renderShell:s=>routes.push(s)});
 vm.runInContext(app.slice(app.indexOf('const LIVE_OPERATION_META='),app.indexOf('function liveBurningOperationHtml()')),ctx);
 const html=ctx.liveOperationCardHtml({kind:'RANKED_DUO',phase:'RECRUITING',title:'랭크 듀오 시즌 1',deadlineAt:new Date(Date.now()+60000).toISOString()});
 assert.match(html,/랭크 듀오 모집중/);assert.match(html,/모집 마감/);assert.match(html,/data-live-operation-deadline/);
 ctx.openLiveOperation('RANKED_DUO');assert.deepEqual(routes,['duo']);
});
