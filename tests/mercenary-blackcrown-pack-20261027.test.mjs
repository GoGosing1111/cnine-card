import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {BLACKCROWN_CODES,BLACKCROWN_MERCENARIES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {BLACKCROWN_PACK,BLACKCROWN_PACK_KEY,blackcrownPackDraft,readBlackcrownPackSettings,blackcrownPackState,pickBlackcrownBatch,blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {pickBlackcrownBulk,validateBlackcrownBulkReceipt} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {blackcrownDivisor,blackcrownOwnedCodes,blackcrownAcceptSs} from '../shared/mercenary-blackcrown-ownership-v1.mjs';
import {handleBlackcrownPack,saveBlackcrownPack,readBlackcrownPackState} from '../functions/_mercenary_blackcrown_pack.js';
import {cloneBlackcrownSettings} from '../scripts/ops/blackcrown-registration-20261027.mjs';
import {bloodmoonPackDraft,BLOODMOON_PACK_KEY} from '../shared/mercenary-bloodmoon-pack-v1.mjs';

function scenario(ownedCodes=[]){
 const settings=blackcrownPackDraft();settings.mode='ON';settings.prices={single:100,ten:900};settings.missRatePpm=0;settings.normalRankRatesPpm=Object.fromEntries(['C','B','A','S','SS','SSS'].map(r=>[r,r==='SSS'?1000000:0]));settings.cardRatesPpm=Object.fromEntries(Object.keys(settings.cardRatesPpm).map(c=>[c,c==='V-950'?1000000:0]));settings.normalSssRatePpm=0;
 const stock=Object.entries(settings.stockLimits).map(([code,stock_limit])=>({code,stock_limit,issued:0}));
 return blackcrownPackState(settings,stock,[{code:'V-021',name:'오메가-X',rank:'SSS',weight:1}],{ownedCodes});
}
test('approved six identities, original hashes and pack display are preserved',()=>{
 assert.equal(new Set(BLACKCROWN_CODES).size,6);
 for(const c of BLACKCROWN_MERCENARIES){assert.equal(createHash('sha256').update(fs.readFileSync(c.sourceArt)).digest('hex'),c.sourceArtSha256.toLowerCase());assert(fs.existsSync(c.thumbnailArt));assert(fs.existsSync(c.displayArt));assert.equal(c.deploymentEnabled,false);}
 assert(fs.existsSync(BLACKCROWN_PACK.image));
});
test('only current distinct Black Crown SS types count, including zero-copy and duplicates',()=>{
 assert.deepEqual(blackcrownOwnedCodes([{mercenary_code:'V-950',total_copies:99},{mercenary_code:'V-951',total_copies:0},{mercenary_code:'V-960',total_copies:10},{mercenary_code:'V-974',total_copies:1},{mercenary_code:'V-950',total_copies:2}]),['V-950']);
 assert.deepEqual(Array.from({length:7},(_,n)=>blackcrownDivisor(BLACKCROWN_CODES.slice(0,n))),[1,1,2,4,8,16,32]);
});
test('all 32 binary samples give exact half/quarter/eighth through six types',()=>{
 for(let n=0;n<=6;n++){const owned=new Set(BLACKCROWN_CODES.slice(0,n)),results=Array.from({length:32},(_,ticket)=>blackcrownAcceptSs('V-950',owned,()=>ticket));assert.equal(results.filter(Boolean).length,32/2**Math.max(0,n-1));}
});
test('personal displayed probabilities preserve total and unchanged SSS slots exactly',()=>{
 for(let n=0;n<=6;n++){const state=scenario(BLACKCROWN_CODES.slice(0,n));assert.equal(state.effectiveCardPercents['V-950'],String(100/2**Math.max(0,n-1)));assert.equal(Number(state.effectiveNormalSssPercent)+Number(state.effectiveCardPercents['V-950']),100);}
 const state=scenario(BLACKCROWN_CODES.slice(0,4));state.settings.cardRatesPpm['V-950']=400000;state.settings.cardRatesPpm['V-058']=100000;state.settings.normalSssRatePpm=500000;
 const next=blackcrownPackState(state.settings,state.stock.map(s=>({code:s.code,stock_limit:s.limit,issued:s.issued})),state.normalCards,{ownedCodes:state.ownedCodes});
 assert.equal(next.effectiveCardPercents['V-950'],'5');assert.equal(next.effectiveCardPercents['V-058'],'10');assert.equal(next.effectiveNormalSssPercent,'85');
});
test('smallest supported chance remains nonzero and exact after six-type reduction',()=>{
 const s=scenario();s.settings.cardRatesPpm['V-950']=0.0001;s.settings.normalSssRatePpm=999999.9999;
 const next=blackcrownPackState(s.settings,s.stock.map(r=>({code:r.code,stock_limit:r.limit,issued:0})),s.normalCards,{ownedCodes:BLACKCROWN_CODES});
 assert.equal(next.effectiveCardPercents['V-950'],'0.0000000003125');
});
test('ten draws immediately reduce after gaining a second type; duplicate does not add a type',()=>{
 const s=scenario(['V-951']);let binary=0;const rng=max=>max===32?(binary++,31):0;
 const draws=pickBlackcrownBatch(s,10,rng);assert.equal(draws.filter(r=>r.mercenaryCode==='V-950').length,1);assert.equal(draws.filter(r=>r.mercenaryCode==='V-021').length,9);assert.equal(binary,9);
 const duplicates=pickBlackcrownBatch(scenario(['V-950']),10,()=>0);assert.equal(duplicates.filter(r=>r.mercenaryCode==='V-950').length,10);
});
test('bulk uses the same dynamic ownership rule and aggregate receipt totals',()=>{
 const s=scenario(['V-951']),bulk=pickBlackcrownBulk(s,100,max=>max===32?31:0);
 assert.equal(bulk.draws.length,1);assert.equal(bulk.normalDraws[0].quantity,99);assert.equal(bulk.draws[0].drawIndex,0);assert.equal(validateBlackcrownBulkReceipt({...bulk,count:100}).reduce((sum,r)=>sum+r.quantity,0),100);
});
test('sold-out SS never increases ownership or diminishes other probabilities',()=>{
 const s=scenario(['V-951']);s.stock.find(r=>r.code==='V-950').remaining=0;s.stock.find(r=>r.code==='V-950').issued=s.stock.find(r=>r.code==='V-950').limit;
 const draws=pickBlackcrownBatch(s,10,()=>0);assert(draws.every(r=>r.mercenaryCode==='V-021'));
});
test('real service grants, debits once and replays unchanged after ownership increases',async t=>{
 const f=await blackcrownFixture(t,{randomInt:max=>max===32?31:0});await f.own('V-951',50);
 const body=f.body(10),before=await f.coin(),receipt=await f.service.open(f.env,f.user,body);
 assert.equal(receipt.draws.filter(r=>r.mercenaryCode==='V-950').length,1);assert.equal(await f.coin(),before-900);assert.equal(blackcrownReceiptResults(receipt).length,10);
 const replay=await f.service.open(f.env,f.user,body);assert.equal(replay.replayed,true);assert.deepEqual(replay.draws,receipt.draws);assert.equal(await f.coin(),before-900);
 const state=await f.state();assert.equal(state.ownedDistinctCount,2);assert.equal(state.ssProbabilityDivisor,2);
});
test('failed atomic payment leaves stock and cards unchanged, then durable request recovers',async t=>{
 const f=await blackcrownFixture(t),body=f.body(),before=await f.coin();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED_FAILURE/);f.fail('');
 assert.equal(await f.coin(),before);assert.equal((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?','V-950').first()).issued,0);
 const receipt=await f.service.open(f.env,f.user,body);assert.equal(receipt.status,'COMPLETED');assert.equal(await f.coin(),before-100);
});
test('pending plan cancels without charging when the distinct ownership set changes',async t=>{
 const f=await blackcrownFixture(t),body=f.body();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body));f.fail('');await f.own('V-951');
 const coin=await f.coin();await assert.rejects(f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert.equal(await f.coin(),coin);
});
test('bulk server receipt remains compact and exact for 100 draws',async t=>{
 const f=await blackcrownFixture(t,{randomInt:max=>max===32?31:0});await f.own('V-951');
 const receipt=await f.service.open(f.env,f.user,{...f.body(100),budget:'9000'});assert.equal(receipt.draws.length,1);assert.equal(receipt.normalDraws.reduce((sum,r)=>sum+r.quantity,0),99);assert.equal(blackcrownReceiptResults(receipt).reduce((sum,r)=>sum+r.quantity,0),100);
});
test('CMS exact-version save is isolated and retried saves cannot duplicate writes',async t=>{
 const f=await blackcrownFixture(t),source=bloodmoonPackDraft();await f.setting(BLOODMOON_PACK_KEY,{revision:13,settings:source});
 const before=(await f.p('SELECT value FROM app_meta WHERE key=?',BLOODMOON_PACK_KEY).first()).value,body={expectedRevision:1,requestId:crypto.randomUUID(),reason:'블랙크라운 설정 확인',settings:{...f.settings,mode:'OFF'}};
 assert.equal((await saveBlackcrownPack(f.env,f.user,body)).revision,2);assert.equal((await saveBlackcrownPack(f.env,f.user,body)).replayed,true);assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',BLOODMOON_PACK_KEY).first()).value,before);
 await assert.rejects(saveBlackcrownPack(f.env,f.user,{...body,requestId:crypto.randomUUID()}),e=>e.status===409);
});
test('HTTP admin enforces OWNER and opening requires authentication',async t=>{
 const f=await blackcrownFixture(t),json=(body,status=200)=>({body,status});
 const base={env:f.env,deps:{json,requirePermission:async()=>({id:2,role:'ADMIN'}),authenticate:async()=>null,withUserMutationLock:async()=>{throw Error('Must not reach mutation');}}};
 assert.equal((await handleBlackcrownPack({...base,path:BLACKCROWN_PACK.adminPath,request:new Request('https://fixture/'+BLACKCROWN_PACK.adminPath)})).status,403);
 assert.equal((await handleBlackcrownPack({...base,path:BLACKCROWN_PACK.openPath,request:new Request('https://fixture/'+BLACKCROWN_PACK.openPath,{method:'POST'})})).status,401);
});
test('clone defaults OFF with six new SS limits at ten and removes SSS limited rewards',()=>{
 const source=bloodmoonPackDraft();source.mode='ON';source.prices={single:1500000000,ten:15000000000};source.cardRatesPpm['V-960']=12.3456;source.stockLimits['V-960']=65;
 const cloned=cloneBlackcrownSettings(source);assert.deepEqual(cloned.prices,source.prices);assert.equal(cloned.mode,'OFF');assert.equal(cloned.cardRatesPpm['V-951'],12.3456);assert.equal(cloned.stockLimits['V-951'],10);assert(!Object.hasOwn(cloned.cardRatesPpm,'V-960'));
 for(const code of ['V-973','V-974','V-975','V-978'])assert(!Object.hasOwn(cloned.cardRatesPpm,code));assert.equal(cloned.cardRatesPpm['V-058'],source.cardRatesPpm['V-058']);
});

test('SS stock race cancels the complete pending plan without consuming coins or new types',async t=>{
 const f=await blackcrownFixture(t),body=f.body(10),before=await f.coin();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body));f.fail('');
 await f.p('UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code=?','V-950').run();
 await assert.rejects(f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert.equal(await f.coin(),before);assert.equal((await f.state()).ownedDistinctCount,0);
});

test('worker applies independent Black Crown schedules once and keeps original policy and shared SSS stock',async t=>{
 const {changeMercenaryStockSchedule}=await import('../functions/_mercenary_blackcrown_stock_schedule.js');
 const {processMercenaryPackStockSchedules}=await import('../workers/clan-draft/src/mercenary-stock-schedule.js');
 const f=await blackcrownFixture(t);await f.setting(BLOODMOON_PACK_KEY,{revision:19,settings:bloodmoonPackDraft()});const original=(await f.p('SELECT value FROM app_meta WHERE key=?',BLOODMOON_PACK_KEY).first()).value;
 const executeAt=new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),body={action:'SCHEDULE_STOCK',requestId:crypto.randomUUID(),executeAt,changes:[{code:'V-950',quantity:5}],reason:'블랙크라운 한도 예약 검수'};
 const before=await f.state();await changeMercenaryStockSchedule(f.env,f.user,body);assert.equal((await processMercenaryPackStockSchedules(f.env)).nextAt,executeAt);
 await assert.rejects(changeMercenaryStockSchedule(f.env,f.user,{...body,requestId:crypto.randomUUID(),changes:[{code:'V-974',quantity:5}]}));
 assert.equal((await processMercenaryPackStockSchedules(f.env,{clock:()=>Date.parse(executeAt)})).applied,1);assert.equal((await processMercenaryPackStockSchedules(f.env,{clock:()=>Date.parse(executeAt)})).applied,0);
 const after=await f.state();assert.equal(after.stock.find(r=>r.code==='V-950').limit,before.stock.find(r=>r.code==='V-950').limit+5);assert.deepEqual(after.stock.filter(r=>!BLACKCROWN_CODES.includes(r.code)),before.stock.filter(r=>!BLACKCROWN_CODES.includes(r.code)));assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',BLOODMOON_PACK_KEY).first()).value,original);
});

test('production includes the built UI, CMS, catalog and approved sources while preserving authoring files in Git',async()=>{
 const {isProductionFile}=await import('../scripts/prepare-production-assets.mjs');
 for(const file of ['js/mercenary-blackcrown-pack-live.bundle.mjs','admin/mercenary-blackcrown-admin-v1.bundle.mjs','css/mercenary-blackcrown-pack.bundle.css','shared/mercenary-blackcrown-catalog-v1.mjs','assets/ui/packs/black-crown-20261027-v1/blackcrown-vault-v2.webp',BLACKCROWN_PACK.image,...BLACKCROWN_MERCENARIES.flatMap(c=>[c.sourceArt,c.thumbnailArt,c.displayArt])])assert.equal(isProductionFile(file),true,file);
 for(const file of JSON.parse(fs.readFileSync('scripts/blackcrown-authoring-only-20261027.json','utf8')))assert.equal(isProductionFile(file),false,file);
 for(const entry of ['admin/mercenary-blackcrown-admin-v1.bundle.mjs','js/mercenary-blackcrown-pack-live.bundle.mjs']){const source=fs.readFileSync(entry,'utf8');assert(source.includes('/css/mercenary-blackcrown-pack.bundle.css'));assert(!source.includes('/css/mercenary-blackcrown-pack-v2.css'));}
});

test('OFF stops single and bulk openings before payment even for an already-opened client',async t=>{
 const f=await blackcrownFixture(t),wallet=await f.coin();f.settings.mode='OFF';await f.configure(2);
 for(const body of [f.body(1),{...f.body(100),budget:'9000'}])await assert.rejects(f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLACKCROWN_CLOSED');
 assert.equal(await f.coin(),wallet);assert((await f.state()).stock.every(s=>s.issued===0));
});
test('superseded saved policy loses all four limited/material rewards without rounding or re-enabling',()=>{
 const legacy=JSON.parse(fs.readFileSync('docs/qa/blackcrown-pack-20261027/read.json','utf8')).source.settings;
 const map=Object.fromEntries(BLACKCROWN_MERCENARIES.map(c=>[c.templateCode,c.code]));const remap=v=>Object.fromEntries(Object.entries(v).map(([c,n])=>[map[c]||c,n]));
 const raw={...legacy,mode:'OFF',format:'MERCENARY_BLACKCROWN_SS_PACK_V3',cardRatesPpm:remap(legacy.cardRatesPpm),stockLimits:remap(legacy.stockLimits)};
 const next=readBlackcrownPackSettings(raw);assert.equal(next.mode,'OFF');assert.equal(next.normalSssRatePpm,969600);
 for(const c of ['V-973','V-974','V-975','V-978']){assert(!Object.hasOwn(next.cardRatesPpm,c));assert(!Object.hasOwn(next.stockLimits,c));}assert.deepEqual(readBlackcrownPackSettings(next),next);
});
