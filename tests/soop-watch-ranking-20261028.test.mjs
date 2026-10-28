import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHmac} from 'node:crypto';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {createPlaydkIdentityClient,PlaydkApiError} from '../functions/_playdk_client.js';
import {normalizeWatchRequest,validateWatchResponse,watchMonthPeriod} from '../functions/_soop_watch_contract.js';
import {SOOP_WATCH_PREFIX,CNINE_WATCH_STREAMERS,saveSoopWatchIdentity,readSoopWatchCandidates,collectSoopWatchRanking,handleSoopWatch} from '../functions/_soop_watch.js';

const at='2026-10-28T12:00:00.000Z';
const query={userSoopIds:['viewer_b','viewer_a','viewer_zero'],streamerIds:['y1026','qpqpro'],dateGte:'2026-10-01',dateLt:'2026-11-01',pagination:{page:1,size:100}};
const validResponse={dateGte:query.dateGte,dateLt:query.dateLt,generatedAt:at,ranking:{data:[{soopUserId:'viewer_a',watchSeconds:7200,position:1,rank:1},{soopUserId:'viewer_b',watchSeconds:7200,position:2,rank:1},{soopUserId:'viewer_zero',watchSeconds:0,position:3,rank:3}],total:3,page:1,size:100,more:false}};

test('ranking uses existing HMAC, complete IDs, KST month bounds, top 100 and seconds',async()=>{
  let calls=0;
  const client=createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'qa-access',secretKey:'qa-secret',fetch:async(url,options)=>{
    calls++;assert.equal(url.pathname,'/api/v2/ext/soop/watch/ranking');assert.equal(options.method,'POST');assert.equal(options.cache,'no-store');
    const request=JSON.parse(options.body);assert.deepEqual(request,normalizeWatchRequest(query));
    const [,signature,timestamp]=options.headers.Authorization.match(/signature=(.*), timestamp=(\d+)/);
    assert.equal(signature,createHmac('sha256','qa-secret').update(timestamp).digest('base64'));
    return Response.json(validResponse);
  }});
  assert.deepEqual(await client.getWatchRanking(query),validResponse);assert.equal(calls,1);
});
test('invalid IDs, calendar dates and over-limit inputs fail before sending',()=>{
  for(const patch of [{userSoopIds:[]},{userSoopIds:['a',null]},{userSoopIds:Array(1001).fill('a')},{streamerIds:Array(51).fill('a')},{dateGte:'2026-02-30'},{dateLt:'2026-10-01'},{dateLt:'2027-01-02'},{pagination:{page:1,size:201}}])assert.throws(()=>normalizeWatchRequest({...query,...patch}));
  assert.equal(normalizeWatchRequest({...query,userSoopIds:['a','a']}).userSoopIds.length,1);
  assert.equal(normalizeWatchRequest({...query,dateGte:'2026-01-31',dateLt:'2026-04-30'}).dateLt,'2026-04-30');
  assert.throws(()=>normalizeWatchRequest({...query,dateGte:'2026-01-31',dateLt:'2026-05-01'}));
});
test('month boundaries use Korean local date and handle December correctly',()=>{
  assert.equal(watchMonthPeriod(null,Date.parse('2026-10-31T15:00:00Z')).month,'2026-11');
  assert.equal(watchMonthPeriod(null,Date.parse('2026-10-31T15:00:00Z')).dateLt,'2026-11-02');
  assert.equal(watchMonthPeriod('2026-10',Date.parse('2026-10-31T14:59:59Z')).dateLt,'2026-11-01');
  const december=watchMonthPeriod('2026-12',Date.parse('2026-12-10Z'));
  assert.equal(december.dateLt,'2026-12-11');assert.equal(december.calendarDateLt,'2027-01-01');
  assert.equal(watchMonthPeriod('2026-12',Date.parse('2027-01-01Z')).dateLt,'2027-01-01');
  assert.throws(()=>watchMonthPeriod('2026-13',Date.parse(at)));
  assert.throws(()=>watchMonthPeriod('2026-11',Date.parse(at)));
});
test('truncated, foreign, duplicate, malformed and nonnumeric results are not accepted as a ranking',()=>{
  const request=normalizeWatchRequest(query);
  for(const change of [x=>x.ranking.data.pop(),x=>x.ranking.total++,x=>x.ranking.data[0].soopUserId='foreign',x=>x.ranking.data[1].soopUserId='viewer_a',x=>x.ranking.data[0].watchSeconds=-1,x=>x.ranking.data[0].watchSeconds='7200',x=>x.ranking.data[1].rank=2,x=>x.ranking.more=true,x=>x.generatedAt='2026-10-28',x=>x.dateLt='2026-10-29']){
    const body=structuredClone(validResponse);change(body);assert.throws(()=>validateWatchResponse(body,request));
  }
});
for(const status of [401,403,502])test(`provider ${status} is returned without retries or fabricated zero seconds`,async()=>{
  let calls=0;const client=createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'qa',secretKey:'qa',fetch:async()=>{calls++;return Response.json({error:'failed'},{status});}});
  await assert.rejects(client.getWatchRanking(query),error=>error instanceof PlaydkApiError&&error.status===status);assert.equal(calls,1);
});

async function fixture(t){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
  await pg.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,coin BIGINT DEFAULT 98765);
    CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT,provider_name TEXT,verified_at TEXT);
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    INSERT INTO users(id,nickname,status) VALUES(1,'하나','ACTIVE'),(2,'둘','ACTIVE'),(3,'셋','ACTIVE');
    INSERT INTO user_second_verifications VALUES(1,'PLAYDK','dk-1','one','2026-10-01'),(2,'PLAYDK','dk-2','two','2026-10-01'),(3,'PLAYDK','dk-3','three','2026-10-01');`);
  const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const result=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
  return {pg,env:{DB},save:(id,soopUserId,observedAt=at,uuid='dk-'+id)=>saveSoopWatchIdentity({DB},id,{uuid,soopUserId},observedAt),read:async id=>JSON.parse((await pg.query('SELECT value FROM app_meta WHERE key=$1',[SOOP_WATCH_PREFIX+id])).rows[0]?.value||'null')};
}
test('PostgreSQL persistence preserves auth and money, refuses wrong accounts and older responses, and clears missing identity',async t=>{
  const f=await fixture(t);assert.equal((await f.save(1,'viewer_a')).identityStored,true);
  assert.equal((await f.save(2,'forged',at,'different-uuid')).identityStored,false);assert.equal(await f.read(2),null);
  await f.save(1,undefined,'2026-10-28T12:01:00.000Z');assert.equal((await f.read(1)).soopUserId,null);
  assert.equal((await f.save(1,'old','2026-10-28T12:00:30.000Z')).identityStored,false);assert.equal((await f.read(1)).soopUserId,null);
  await f.save(1,'new','2026-10-28T12:02:00.000Z');assert.equal((await f.read(1)).soopUserId,'new');
  assert((await f.pg.query('SELECT coin FROM users')).rows.every(x=>Number(x.coin)===98765));
  assert.deepEqual((await f.pg.query('SELECT provider_user_id FROM user_second_verifications ORDER BY user_id')).rows.map(x=>x.provider_user_id),['dk-1','dk-2','dk-3']);
});
test('deduplicates SOOP accounts, excludes unlinked/disabled accounts, and reports missing coverage',async t=>{
  const f=await fixture(t);await f.save(1,'viewer_a');await f.save(2,'viewer_a');
  let captured;const client={getWatchRanking:async input=>{captured=input;return {...validResponse,dateLt:input.dateLt,ranking:{data:[validResponse.ranking.data[0]],total:1,page:1,size:100,more:false}};}};
  const report=await collectSoopWatchRanking(f.env,{month:'2026-10',now:Date.parse(at),client});
  assert.deepEqual(captured.userSoopIds,['viewer_a']);assert.equal(captured.streamerIds.length,12);assert(captured.streamerIds.includes('y1026'));assert(captured.streamerIds.includes('rlaxordyd'));
  assert.equal(captured.dateLt,'2026-10-29');assert.equal(report.dateLt,'2026-10-29');assert.equal(report.calendarDateLt,'2026-11-01');
  assert.equal(report.coverage.uncollectedAccounts,1);assert.equal(report.allVerifiedAccountsCovered,false);assert.equal(report.ranking.data[0].linkedAccounts.length,2);
  await f.pg.exec("DELETE FROM user_second_verifications WHERE user_id=1; UPDATE users SET status='INACTIVE' WHERE id=2");
  assert.equal((await readSoopWatchCandidates(f.env)).userSoopIds.length,0);
});
test('empty coverage never calls DK and never claims a complete top 100',async t=>{
  const f=await fixture(t);const report=await collectSoopWatchRanking(f.env,{month:'2026-10',now:Date.parse(at),client:{getWatchRanking(){throw Error('Unexpected call')}}});
  assert.equal(report.status,'WAITING_FOR_IDENTITIES');assert.equal(report.generatedAt,null);assert.equal(report.coverage.uncollectedAccounts,3);assert.equal(report.allVerifiedAccountsCovered,false);
});
test('changing identity during a query invalidates the entire response',async t=>{
  const f=await fixture(t);await f.save(1,'viewer_a');
  await assert.rejects(collectSoopWatchRanking(f.env,{month:'2026-10',now:Date.parse(at),client:{getWatchRanking:async()=>{await f.save(1,undefined,'2026-10-28T12:02:00.000Z');return validResponse;}}}),e=>e.code==='SOOP_WATCH_CANDIDATES_CHANGED');
});
test('only authenticated OWNER can query the admin ranking and writes are rejected',async()=>{
  const request=new Request('https://example.test/api/admin/soop-watch/ranking?month=2026-10');
  for(const admin of [null,{role:'USER'},{role:'ADMIN'}]){
    const r=await handleSoopWatch({path:'admin/soop-watch/ranking',request,env:{},deps:{requirePermission:async()=>admin,json:(body,status)=>({body,status})}});assert.equal(r.status,403);
  }
  const r=await handleSoopWatch({path:'admin/soop-watch/ranking',request:new Request(request,{method:'POST'}),env:{},deps:{requirePermission:async()=>({role:'OWNER'}),json:(body,status)=>({body,status})}});assert.equal(r.status,405);
});
