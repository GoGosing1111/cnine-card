import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {createLimitedPackService,readLimitedPackDaily,handleLimitedPack,readLimitedPackState} from '../functions/_mercenary_limited_pack.js';
import {LIMITED_PACK} from '../shared/mercenary-limited-pack-v1.mjs';
import {LIMITED_DAILY_CAP,limitedDailyStatus} from '../shared/mercenary-limited-daily-v1.mjs';
import {LimitedOpeningSession,limitedAutoPlan} from '../shared/mercenary-limited-session-v1.mjs';
const at=Date.parse('2026-10-08T14:59:59.000Z');
const body=(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:1,expectedPolicyRevision:1});
const seed=(f,used,time=at,id=1)=>f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','mercenary_limited_daily_v1:'+id+':'+limitedDailyStatus(0,time).day,String(used)).run();
const create=(now=()=>at,randomInt=()=>0)=>createLimitedPackService({releaseEnabled:true,now,randomInt});

test('daily cap is 3000 and resets exactly at KST midnight',()=>{
 assert.equal(LIMITED_DAILY_CAP,3000);
 assert.deepEqual(limitedDailyStatus(2999,Date.parse('2026-10-08T14:59:59.999Z')),{day:'2026-10-08',timeZone:'Asia/Seoul',limit:3000,used:2999,remaining:1,resetsAt:'2026-10-08T15:00:00.000Z'});
 assert.equal(limitedDailyStatus(0,Date.parse('2026-10-08T15:00:00Z')).day,'2026-10-09');
 assert.equal(limitedDailyStatus(0,Date.parse('2026-12-31T15:00:00Z')).day,'2027-01-01');
});

test('2990 + ten succeeds; next opening rejects with no charge, replay counts once, users are independent',async t=>{
 const f=await limitedFixture(t);await f.configure();await seed(f,2990);
 const s=create(),request=body(10),r=await s.open(f.env,f.user,request);
 assert.equal(r.daily.used,3000);assert.equal(r.daily.remaining,0);assert.equal(await f.coin(),999100);
 await assert.rejects(s.open(f.env,f.user,body()),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
 assert.equal(await f.coin(),999100);assert.equal((await s.open(f.env,f.user,request)).daily.used,3000);
 assert.equal((await s.receipt(f.env,f.user,request.requestId)).daily.used,3000);
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs WHERE user_id=1').first()).n,1);
 assert.equal((await s.open(f.env,{id:2,role:'USER'},body())).daily.used,1);
});

test('partial ten batch never pays or rolls; last singles remain available for OWNER and USER',async t=>{
 const f=await limitedFixture(t);await f.configure();await seed(f,2995);let rolls=0;
 const s=create(()=>at,()=>{rolls++;return 0;});
 await assert.rejects(s.open(f.env,f.user,body(10)),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
 assert.equal(rolls,0);assert.equal(await f.coin(),1000000);
 for(let i=0;i<5;i++)await s.open(f.env,{id:1,role:'USER'},body());
 assert.equal((await readLimitedPackDaily(f.env,1,at)).used,3000);
 await assert.rejects(s.open(f.env,f.user,body()),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
 assert.equal(await f.coin(),999500);
});

test('concurrent requests at the boundary commit at most the remaining quantity',async t=>{
 const f=await limitedFixture(t);await f.configure();await seed(f,2997);const s=create();
 const results=await Promise.allSettled(Array.from({length:12},()=>s.open(f.env,f.user,body())));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
 for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.code,'MERCENARY_LIMITED_DAILY_LIMIT');
 assert.equal((await readLimitedPackDaily(f.env,1,at)).used,3000);assert.equal(await f.coin(),999700);
 assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-990'").first()).issued,3);
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,3);
});

test('failed grants roll back daily count, payment and rewards; lost commit ACK and retries count once',async t=>{
 const f=await limitedFixture(t);await f.configure();await seed(f,2990);const s=create(),request=body(10);
 f.fail('INSERT INTO coin_logs');await assert.rejects(s.open(f.env,f.user,request),/INJECTED/);f.fail('');
 assert.equal((await readLimitedPackDaily(f.env,1,at)).used,2990);assert.equal(await f.coin(),1000000);
 f.loseAck();assert.equal((await s.open(f.env,f.user,request)).daily.used,3000);
 assert.equal((await s.open(f.env,f.user,request)).daily.used,3000);assert.equal(await f.coin(),999100);
});

test('new day gets fresh cap; an unpaid pending request counts on its payment day, not its preparation day',async t=>{
 const f=await limitedFixture(t);await f.configure();let time=at;const s=create(()=>time),request=body(10);
 await seed(f,2990);f.fail('INSERT INTO coin_logs');await assert.rejects(s.open(f.env,f.user,request),/INJECTED/);f.fail('');
 time=Date.parse('2026-10-08T15:00:00Z');
 const r=await s.open(f.env,f.user,request);assert.equal(r.daily.day,'2026-10-09');assert.equal(r.daily.used,10);
 assert.equal((await readLimitedPackDaily(f.env,1,at)).used,2990);
 await seed(f,3000,time);time+=86400000;
 assert.equal((await s.open(f.env,f.user,body())).daily.used,1);
 assert.equal((await s.receipt(f.env,f.user,request.requestId)).daily.used,1);
});

test('ordinary cards, materials and misses consume the same cap',async t=>{
 const f=await limitedFixture(t);const s=create(()=>at,max=>max-1);
 for(const outcome of ['CARD_C','MASTER_STAR','MYSTIC_ENERGY','NONE']){
  f.policy.rankRatesPpm={SS:1,SSS:0};
  f.packSettings.normalRankRatesPpm.C=outcome==='CARD_C'?999999:0;
  f.packSettings.extraRewards=f.packSettings.extraRewards.map(r=>({...r,chancePpm:r.id===outcome?999999:0}));
  await f.configure();await seed(f,2999);
  const r=await s.open(f.env,f.user,body());assert.equal(r.draws[0].outcomeId,outcome);assert.equal(r.daily.used,3000);
  await assert.rejects(s.open(f.env,f.user,body()),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
 }
});

test('config shows only the authenticated account usage and still serves public policy while OFF',async t=>{
 const f=await limitedFixture(t);await f.configure({enabled:false});await seed(f,12,Date.now());
 const read=id=>handleLimitedPack({path:LIMITED_PACK.featurePath,request:new Request('https://qa.test/api/'+LIMITED_PACK.featurePath+'?userId=1'),env:f.env,deps:{authenticate:async()=>id?{id}:null,json:value=>value}});
 assert.equal((await read(1)).daily.used,12);assert.equal((await read(2)).daily.used,0);assert.equal((await read(null)).daily.used,null);
 assert.equal((await read(1)).userOpeningEnabled,false);
});

test('automatic opening stops at the cap without leaving a pending recovery or extra POST',async()=>{
 const rows=new Map(),storage={getItem:key=>rows.get(key)??null,setItem:(key,v)=>rows.set(key,v),removeItem:key=>rows.delete(key)};
 const config={userOpeningEnabled:true,revision:1,packRevision:1,packSettings:{prices:{single:100,ten:900}},daily:limitedDailyStatus(2980)};
 assert.throws(()=>limitedAutoPlan(config.packSettings,21,10,config.daily),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
 let posts=0,presented=0;
 const session=new LimitedOpeningSession({storage,accountId:1,getAccountId:()=>1,present:async()=>{presented++;return true;},api:async(path,{body}={})=>{
  assert.equal(path,LIMITED_PACK.openPath);posts++;
  if(posts===2)throw Object.assign(Error('일일 한도'),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
  return {status:'COMPLETED',accountId:1,requestId:body.requestId,count:10,draws:Array.from({length:10},()=>({outcomeId:'NONE'})),daily:limitedDailyStatus(2990)};
 }});
 await assert.rejects(session.start(config,{total:20,batch:10}),{code:'MERCENARY_LIMITED_DAILY_LIMIT'});
 assert.equal(posts,2);assert.equal(presented,1);assert.equal(session.pending(),null);
 // An old cached daily display must not block an opening after midnight.
 assert.equal(limitedAutoPlan(config.packSettings,1,1,{...limitedDailyStatus(3000),resetsAt:'2020-01-01T15:00:00.000Z'}).total,1);
});
