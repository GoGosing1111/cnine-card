import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jointFixture} from './helpers/joint-db.mjs';
import {ensureCoupSchema} from '../functions/_coup_schema.js';
import {coupLiveOperation} from '../functions/_coup_live_operation.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: coup lobby follows recruitment, active deadline, OFF and completed states without mutations`,async t=>{
 const f=await jointFixture(t,{postgres});await ensureCoupSchema(f.env);const now=Date.now(),id=crypto.randomUUID();
 await f.setting('coup_settings_v2115',{enabled:true});assert.equal(await coupLiveOperation(f.env,now),null);
 await f.p("INSERT INTO coup_rounds_v2115(id,status,chief_user_id,appointment_id,chief_name,settings_json,created_at,chief_hp,rebel_hp,max_hp) VALUES(?,'RECRUITING',7,'appointment','chief','{}',?,100,100,100)",id,now).run();
 const before=await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first();
 const recruiting=await coupLiveOperation(f.env,now);assert.equal(recruiting.kind,'COUP');assert.equal(recruiting.entityId,id);assert.equal(recruiting.phase,'RECRUITING');assert.equal(recruiting.deadlineAt,null);
 assert.deepEqual(await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first(),before);
 await f.p("UPDATE coup_rounds_v2115 SET status='ACTIVE',ends_at=? WHERE id=?",now+60000,id).run();
 const active=await coupLiveOperation(f.env,now);assert.equal(active.phase,'ACTIVE');assert.equal(active.deadlineAt,new Date(now+60000).toISOString());
 assert.equal(await coupLiveOperation(f.env,now+60000),null);
 await f.setting('coup_settings_v2115',{enabled:false});assert.equal(await coupLiveOperation(f.env,now),null);
 await f.setting('coup_settings_v2115',{enabled:true});
 for(const status of ['SETTLING','FINISHED','CANCELLED']){await f.p('UPDATE coup_rounds_v2115 SET status=? WHERE id=?',status,id).run();assert.equal(await coupLiveOperation(f.env,now),null);}
});

test('coup summary failure cannot suppress existing live operations',async()=>{
 const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const source=api.slice(api.indexOf('async function liveOperationAlerts(env){'),api.indexOf('let cardAcquisitionGradeFxCache'));
 const ctx=vm.createContext({Date,console:{error(){}},liveOperationsCache:null,LIVE_OPERATIONS_CACHE_MS:15000,rankedDuoLiveOperation:async()=>null,coupLiveOperation:async()=>{throw Error('Missing coup table');}});
 vm.runInContext(source,ctx);
 const items=await ctx.liveOperationAlerts({DB:{prepare:()=>({all:async()=>({results:[{kind:'AUCTION',phase:'ACTIVE',entity_id:1,title:'경매'}]})})}});
 assert.equal(items.length,1);assert.equal(items[0].kind,'AUCTION');
});

test('recruitment has no fake timer, active has countdown and entry uses the coup route',()=>{
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),routes=[];
 const ctx=vm.createContext({Date,escapeHtml:s=>String(s),renderShell:s=>routes.push(s)});
 vm.runInContext(app.slice(app.indexOf('const LIVE_OPERATION_META='),app.indexOf('function liveBurningOperationHtml()')),ctx);
 const recruiting=ctx.liveOperationCardHtml({kind:'COUP',phase:'RECRUITING',title:'황궁 쿠데타'});
 assert.match(recruiting,/참가 모집/);assert.match(recruiting,/개전 대기/);assert.doesNotMatch(recruiting,/data-live-operation-deadline/);
 const active=ctx.liveOperationCardHtml({kind:'COUP',phase:'ACTIVE',deadlineAt:new Date(Date.now()+60000).toISOString()});
 assert.match(active,/전투 진행/);assert.match(active,/종료까지/);assert.match(active,/data-live-operation-deadline/);
 ctx.openLiveOperation('COUP');assert.deepEqual(routes,['coup']);
});
