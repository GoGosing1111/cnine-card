import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,bloodmoonPackDraft,legacyBloodmoonPackDraft} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,halloweenPackDraft} from '../shared/mercenary-halloween-pack-v1.mjs';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs';
import {HalloweenOpeningSession} from '../shared/mercenary-halloween-session-v2.mjs';
import {readBloodmoonPackState,saveBloodmoonPack,handleBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {readHalloweenPackState} from '../functions/_mercenary_halloween_pack.js';
import {createHalloweenPackService} from '../functions/_mercenary_halloween_opening.js';
import {readBloodmoonSsOnce,bloodmoonSsOnceKey} from '../functions/_mercenary_bloodmoon_once.js';
import {halloweenSsOnceKey} from '../functions/_mercenary_halloween_once.js';
import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';

test('the approved six Bloodmoon cards and three requested SSS cards are the only pack targets',()=>{
 assert.deepEqual(BLOODMOON_PACK_CARDS.map(c=>c.code),['V-960','V-961','V-962','V-963','V-964','V-965','V-978','V-974','V-975']);
 assert.deepEqual(BLOODMOON_PACK_CARDS.filter(c=>c.rank==='SSS').map(c=>c.name),['레오넬','제너럴 족','기운잃은 프라임 카드']);
 const draft=bloodmoonPackDraft();assert.equal(draft.mode,'OFF');
 for(const code of ['V-978','V-974','V-975']){assert.equal(draft.stockLimits[code],code==='V-978'?5:3);assert.equal(draft.cardRatesPpm[code],null);}
 for(const code of ['V-999','V-989','V-996','V-979'])assert(!Object.hasOwn(draft.cardRatesPpm,code));
});

test('independent CMS draft save is atomic, idempotent, version guarded and leaves Halloween untouched',async t=>{
 const f=await bloodmoonFixture(t),halloween={revision:77,settings:halloweenPackDraft()};
 await f.setting(HALLOWEEN_PACK_KEY,halloween);await f.setting(BLOODMOON_PACK_KEY,{revision:1,settings:legacyBloodmoonPackDraft()});
 const beforeStocks=(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows;
 const settings=bloodmoonPackDraft();settings.prices={single:123456789,ten:1200000000};settings.normalRankRatesPpm.SSS=1000;settings.cardRatesPpm['V-960']=10000;
 const body={expectedRevision:1,settings,requestId:crypto.randomUUID(),reason:'블러드팩 개봉 준비'};
 f.fail('INSERT INTO admin_logs');await assert.rejects(saveBloodmoonPack(f.env,f.user,body),/INJECTED/);f.fail('');assert.equal((await readBloodmoonPackState(f.env)).revision,1);
 const saved=await saveBloodmoonPack(f.env,f.user,body);assert.equal(saved.revision,2);assert.equal(saved.settings.prices.single,123456789);assert.equal(saved.userOpeningEnabled,false);
 assert.equal((await saveBloodmoonPack(f.env,f.user,body)).replayed,true);
 await assert.rejects(saveBloodmoonPack(f.env,f.user,{...body,reason:'다른 내용의 같은 요청'}),e=>e.code==='MERCENARY_BLOODMOON_CONFLICT');
 await assert.rejects(saveBloodmoonPack(f.env,f.user,{...body,requestId:crypto.randomUUID()}),e=>e.code==='MERCENARY_BLOODMOON_CONFLICT');
 await assert.rejects(saveBloodmoonPack(f.env,f.user,{...body,expectedRevision:2,requestId:crypto.randomUUID(),settings:{...settings,mode:'ON'}}),e=>e.code==='MERCENARY_BLOODMOON_CONFIG');
 assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value),halloween);
 assert.deepEqual((await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,beforeStocks);assert.equal(await f.coin(),1000000);
 assert.equal(Number((await f.pg.query('SELECT COUNT(*) AS n FROM admin_logs')).rows[0].n),1);
});

test('only OWNER may read/save Blood Pack CMS; public opening requires authentication before DB',async t=>{
 const f=await bloodmoonFixture(t),before=f.stats.queries,json=(body,status=200)=>({body,status});
 for(const role of ['USER','ADMIN']){const r=await handleBloodmoonPack({path:BLOODMOON_PACK.adminPath,request:{method:'PATCH'},env:f.env,deps:{json,requirePermission:async()=>({id:2,role})}});assert.equal(r.status,403);}
 const r=await handleBloodmoonPack({path:BLOODMOON_PACK.openPath,request:{method:'POST'},env:f.env,deps:{json,authenticate:async()=>null}});assert.equal(r.status,401);assert.equal(f.stats.queries,before);
});

test('browser requests, history, tab locks, receipts and one-time entitlements never cross packs',async t=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const args={accountId:1,getAccountId:()=>1,storage,api:()=>{throw Error('no request');},present:async()=>{}};
 const blood=new BloodmoonOpeningSession(args),halloween=new HalloweenOpeningSession(args);
 assert.notEqual(blood.pendingKey,halloween.pendingKey);assert.notEqual(blood.receiptKey,halloween.receiptKey);
 storage.setItem(halloween.pendingKey,'{"protected":true}');
 await assert.rejects(blood.accept({status:'COMPLETED',packId:HALLOWEEN_PACK.id,accountId:1,requestId:'same-request',count:1,draws:[{outcomeId:'NONE'}]}),/블러드/);
 assert.equal(storage.getItem(halloween.pendingKey),'{"protected":true}');
 const f=await bloodmoonFixture(t),once={status:'ARMED',remaining:1,packId:HALLOWEEN_PACK.id,userId:1};await f.setting(halloweenSsOnceKey(1),once);
 assert.notEqual(bloodmoonSsOnceKey(1),halloweenSsOnceKey(1));assert.equal(await readBloodmoonSsOnce(f.DB,1),null);
 const result=await f.service.open(f.env,f.user,f.body());
 const hservice=createHalloweenPackService({readState:readHalloweenPackState});await assert.rejects(hservice.receipt(f.env,f.user,result.requestId));
 assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',halloweenSsOnceKey(1)).first()).value),once);
});
