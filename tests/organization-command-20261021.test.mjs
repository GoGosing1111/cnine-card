import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFactionLiveOperation} from '../functions/_organization_faction.js';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {factionStartNoticeCandidate} from '../js/organization-start-notice-20261021.mjs';
import {ORGANIZATION_SESSION_RULES} from '../shared/organization-faction-v1.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('public faction status exposes only an actual LIVE ON session and preserves paused state and deferred identity',async t=>{
 const f=await organizationFactionFixture(t,{live:true});await f.overview();
 const item=await organizationFactionLiveOperation(f.env,f.clock());
 assert.equal(item.kind,'ORGANIZATION_FACTION');assert.equal(item.phase,'ACTIVE');assert.equal(item.requiredTerritories,8);assert.equal(item.roundId,f.roundId);
 assert.equal(item.deadlineAt,new Date(f.clock()-1000+3*3600000).toISOString());
 assert.deepEqual(Object.keys(item).sort(),['kind','phase','entityId','roundId','title','detail','startedAt','deadlineAt','requiredTerritories','sortOrder'].sort());
 await f.mutateState(s=>{s.session.status='PAUSED';s.session.pausedAt=f.clock();s.session.remainingMs=1000;});
 const paused=await organizationFactionLiveOperation(f.env,f.clock()+4*3600000);assert.equal(paused.phase,'PAUSED');assert.equal(paused.deadlineAt,null);assert.equal(paused.entityId,item.entityId);
 await f.mutateState(s=>{s.session.status='ACTIVE';s.session.deferred=true;s.session.startsAt=f.clock();s.session.endsAt=f.clock()+1000;});
 assert.equal((await organizationFactionLiveOperation(f.env,f.clock())).entityId,item.entityId);
 assert.equal(await organizationFactionLiveOperation(f.env,f.clock()+1000),null);
 await f.mutateState(s=>s.session.status='SETTLED');assert.equal(await organizationFactionLiveOperation(f.env,f.clock()),null);
 await f.mutateState(s=>s.session.status='SCHEDULED');assert.equal(await organizationFactionLiveOperation(f.env,f.clock()),null);
 await f.mutateState(s=>s.session.status='ACTIVE');await f.pg.query("UPDATE organization_faction_policy_v1 SET policy_json=jsonb_set(policy_json::jsonb,'{mode}','\"OFF\"')::text");assert.equal(await organizationFactionLiveOperation(f.env,f.clock()),null);
 await f.pg.query("UPDATE organization_faction_policy_v1 SET policy_json=jsonb_set(policy_json::jsonb,'{mode}','\"ON\"')::text");await f.pg.query("UPDATE organization_rounds_v1 SET scope='TEST'");assert.equal(await organizationFactionLiveOperation(f.env,f.clock()),null);
});
test('start notice rejects unauthenticated, nonlobby, paused, scheduled, expired and future sessions',()=>{
 const now=Date.now(),item={kind:'ORGANIZATION_FACTION',phase:'ACTIVE',entityId:'session-1',roundId:'round',startedAt:new Date(now-1000).toISOString(),deadlineAt:new Date(now+1000).toISOString()},base={items:[item],userId:2,inLobby:true,now};
 assert.equal(factionStartNoticeCandidate(base),item);
 for(const extra of [{userId:null},{inLobby:false},{now:now+1000},{now:now-2000},{items:[{...item,phase:'PAUSED'}]},{items:[{...item,phase:'SCHEDULED'}]}])assert.equal(factionStartNoticeCandidate({...base,...extra}),null);
 assert.equal(ORGANIZATION_SESSION_RULES.requiredTerritories,8);assert.equal(ORGANIZATION_SESSION_RULES.coinPerRecipient,300000000000);
});
test('unfinished legacy session adopts eight while past reward records stay unchanged',async t=>{
 const f=await organizationFactionFixture(t,{live:true});await f.overview();
 const history=(await f.admin()).data.state.sessionHistory;
 await f.mutateState(s=>{s.session.rewardRules={...ORGANIZATION_SESSION_RULES,version:'20261019-six-organizations',requiredTerritories:9};});
 const view=(await f.overview()).data;assert.equal(view.sessions.rules.requiredTerritories,8);assert.equal(view.sessions.rules.coinPerRecipient,300000000000);
 assert.deepEqual((await f.admin()).data.state.sessionHistory,history);
});
test('actual lobby renderer keeps faction countdown, pause state and dedicated entry visible',()=>{
 const src=readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),start=src.indexOf('const LIVE_OPERATION_META='),end=src.indexOf('function packImagePath(',start);
 const context=vm.createContext({Date,console,escapeHtml:value=>String(value),setInterval,clearInterval,setTimeout,clearTimeout});
 vm.runInContext(src.slice(start,end),context);
 const item={kind:'ORGANIZATION_FACTION',phase:'ACTIVE',title:'서울 세력전',detail:'서울 25개 구 · 8곳 이상',deadlineAt:new Date(Date.now()+3600000).toISOString()};context.item=item;
 const active=vm.runInContext('liveOperationCardHtml(item)',context);assert.match(active,/data-live-operation-kind="ORGANIZATION_FACTION"/);assert.match(active,/data-live-operation-deadline=/);assert.match(active,/종료까지/);
 context.item={...item,phase:'PAUSED',deadlineAt:null};const paused=vm.runInContext('liveOperationCardHtml(item)',context);assert.match(paused,/일시중단/);assert.match(paused,/영토전 종료 후 재개/);assert.doesNotMatch(paused,/data-live-operation-deadline=/);
 assert(!src.includes("['RANKED_DUO','ORGANIZATION','ORGANIZATION_FACTION']"));
});
