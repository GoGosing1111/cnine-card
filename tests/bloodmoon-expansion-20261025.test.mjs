import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK_KEY,BLOODMOON_PACK,readBloodmoonPackSettings,bloodmoonPackState,bloodmoonEffectivePercent,pickBloodmoonBatch,bloodmoonReceiptResults} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLOODMOON_PACK_CARDS,BLOODMOON_LIMITED_CARDS,isBloodmoonLimited} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {pickBloodmoonBulk,validateBloodmoonBulkReceipt} from '../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {bloodmoonCollectionMarkup,bloodmoonResultsMarkup} from '../js/mercenary-bloodmoon-presentation-v2.mjs';
import {OP,TARGETS,documentHash,prepareExpansion,increaseStock,inspect} from '../scripts/ops/bloodmoon-expansion-20261025.mjs';

const old=()=>({mode:'ON',prices:{single:1500000000,ten:15000000000},missRatePpm:800000,format:'MERCENARY_BLOODMOON_SS_PACK_V3',normalRankRatesPpm:{C:104500,B:30000,A:30000,S:30000,SS:4700,SSS:800},normalSssRatePpm:969789,cardRatesPpm:{'V-960':5000,'V-961':5000,'V-962':5000,'V-963':5000,'V-964':5000,'V-965':5000,'V-978':200,'V-974':10,'V-975':1},stockLimits:{'V-960':30,'V-961':30,'V-962':30,'V-963':30,'V-964':30,'V-965':30,'V-978':7,'V-974':3,'V-975':3}});
const normalCards=['C','B','A','S','SS','SSS'].map((rank,i)=>({code:'V-00'+i,name:rank,rank,weight:1}));
const rows=s=>Object.entries(s.stockLimits).map(([code,stock_limit])=>({code,stock_limit,issued:0}));
const interval=(s,code)=>BLOODMOON_PACK_CARDS.slice(0,BLOODMOON_PACK_CARDS.findIndex(c=>c.code===code)).reduce((n,c)=>n+s.cardRatesPpm[c.code]*10000,0);
const random=samples=>max=>{const n=samples.shift();assert(Number.isSafeInteger(n)&&n>=0&&n<max);return n;};
const allTo=async(f,code)=>{f.settings.cardRatesPpm=Object.fromEntries(BLOODMOON_PACK_CARDS.map(c=>[c.code,c.code===code?1000000:0]));f.settings.normalSssRatePpm=0;await f.configure();};
test('read-only legacy adaptation preserves the sold-out policy; approved expansion adds 65 capacity and exact odds',()=>{
 const raw=old(),before=structuredClone(raw),read=readBloodmoonPackSettings(raw);assert.deepEqual(raw,before);assert.equal(read.stockLimits['V-960'],30);assert.equal(read.stockLimits['V-978'],7);assert.equal(read.cardRatesPpm['V-973'],0);assert.equal(read.cardRatesPpm['V-058'],0);assert.equal(read.normalSssRatePpm,raw.normalSssRatePpm);
 const existing=bloodmoonPackState(raw,rows(raw),normalCards);assert(existing.readiness.ready);assert.equal(existing.stock.find(s=>s.code==='V-973').prepared,false);
 const next=prepareExpansion(raw);assert.deepEqual(next.prices,raw.prices);assert.deepEqual(next.normalRankRatesPpm,raw.normalRankRatesPpm);assert.equal(next.mode,'ON');assert.equal(next.missRatePpm,raw.missRatePpm);
 for(const [code,rate] of Object.entries(raw.cardRatesPpm))assert.equal(next.cardRatesPpm[code],rate);
 assert.equal(next.cardRatesPpm['V-973'],next.cardRatesPpm['V-974']*2);assert.equal(next.cardRatesPpm['V-058'],next.cardRatesPpm['V-978']*2);assert.equal(next.normalSssRatePpm,969369);
 assert.equal(bloodmoonEffectivePercent(800,next.cardRatesPpm['V-973']),'0.0000016');assert.equal(bloodmoonEffectivePercent(800,next.cardRatesPpm['V-058']),'0.000032');
 assert.equal(TARGETS.reduce((n,t)=>n+t.after-t.before,0),65);assert.equal(next.stockLimits['V-058'],undefined);
 assert.equal(BLOODMOON_PACK_CARDS.length,11);assert.equal(BLOODMOON_LIMITED_CARDS.length,10);assert.equal(isBloodmoonLimited('V-058'),false);
 const legacy8=old();delete legacy8.cardRatesPpm['V-965'];delete legacy8.stockLimits['V-965'];assert.equal(readBloodmoonPackSettings(legacy8).cardRatesPpm['V-965'],null);
});
test('exact conditional boundaries select Eunseol, General Jok and unlimited Razak without a third lottery',()=>{
 const settings=prepareExpansion(old()),state=bloodmoonPackState(settings,rows(settings),normalCards);
 for(const code of ['V-974','V-973','V-058'])for(const offset of [0,settings.cardRatesPpm[code]*10000-1]){
  const samples=[1992000000,interval(settings,code)+offset],draw=pickBloodmoonBatch(state,1,random(samples))[0];assert.equal(draw.mercenaryCode,code);assert.equal(samples.length,0);assert.equal(draw.edition,code==='V-058'?'STANDARD':'SSS_LIMITED');assert.equal(draw.stockLimit,code==='V-058'?undefined:3);
 }
 for(const s of state.stock){s.issued=s.limit;s.remaining=0;}
 assert.equal(pickBloodmoonBatch(state,1,random([1992000000,interval(settings,'V-058')]))[0].mercenaryCode,'V-058');
 assert.equal(pickBloodmoonBatch(state,1,random([1992000000,interval(settings,'V-973'),0]))[0].edition,'STANDARD');
});
test('unlimited results aggregate beyond the 256 serial bound and display standard SSS without a serial',async t=>{
 const f=await bloodmoonFixture(t);await allTo(f,'V-058');const state=await f.state();assert(state.readiness.ready);assert(!state.stock.some(s=>s.code==='V-058'));
 const batch=pickBloodmoonBulk(state,1000,()=>0);assert.equal(batch.draws.length,0);assert.equal(batch.normalDraws.length,1);assert.equal(batch.normalDraws[0].quantity,1000);
 const receipt={...batch,status:'COMPLETED',packId:BLOODMOON_PACK.id,requestId:crypto.randomUUID(),count:1000};assert.equal(validateBloodmoonBulkReceipt(receipt)[0].mercenaryCode,'V-058');
 const results=bloodmoonReceiptResults(receipt);assert.equal(results[0].limited,false);assert.match(results[0].artUrl,/razak-20261024\/art-640/);assert.doesNotMatch(bloodmoonResultsMarkup(results,BLOODMOON_PACK.image),/발행 번호|SSS LIMITED/);
 const html=bloodmoonCollectionMarkup(state.cards,state.stock,state.effectiveCardPercents);assert.match(html,/일반 SSS · 별도 획득/);assert.match(html,/발행 한도 없음/);assert.match(html,/은설/);
 assert.throws(()=>pickBloodmoonBatch(state,1,()=>0,{firstLimitedCode:'V-058'}));assert.throws(()=>pickBloodmoonBulk(state,1,()=>0,{firstLimitedCode:'V-058'}));
});
test('single and ten-draw Razak awards debit once, create ordinary acquisitions and no limited counter',async t=>{
 const f=await bloodmoonFixture(t);await allTo(f,'V-058');const stockBefore=(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows;
 for(const count of [1,10]){const b=f.body(count),receipt=await f.service.open(f.env,f.user,b);assert(receipt.draws.every(d=>d.mercenaryCode==='V-058'&&d.edition==='STANDARD'&&d.serial===undefined));assert.deepEqual((await f.service.open(f.env,f.user,b)).draws,receipt.draws);}
 assert.equal(await f.coin(),999000);assert.equal((await f.pg.query("SELECT total_copies FROM user_mercenary_cards_v1 WHERE mercenary_code='V-058'")).rows[0].total_copies,11);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);assert.deepEqual((await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,stockBefore);
});
test('bulk Razak rollback and replay preserve the fixed result with one debit and one aggregate grant',async t=>{
 let calls=0;const f=await bloodmoonFixture(t,{randomInt:()=>{calls++;return 0;}});await allTo(f,'V-058');const b={...f.body(),count:1000,budget:'90000'};
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,b),/INJECTED/);f.fail('');assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
 const count=calls,r=await f.service.open(f.env,f.user,b);assert.equal(calls,count);assert.equal(r.normalDraws[0].quantity,1000);assert.equal(r.draws.length,0);assert.equal(await f.coin(),910000);
 assert.deepEqual((await f.service.open(f.env,f.user,b)).normalDraws,r.normalDraws);assert.equal(await f.coin(),910000);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);
});
test('new Eunseol pack serials exclude an existing direct gift, exhaust at three and replay safely',async t=>{
 const f=await bloodmoonFixture(t);await f.pg.query("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-973',1,0,'direct-gift','direct-gift')");await allTo(f,'V-973');const b=f.body(10),r=await f.service.open(f.env,f.user,b);
 assert.deepEqual(r.draws.slice(0,3).map(d=>d.serial),[1,2,3]);assert(r.draws.slice(3).every(d=>d.edition==='STANDARD'));assert.equal((await f.pg.query("SELECT total_copies FROM user_mercenary_cards_v1 WHERE mercenary_code='V-973'")).rows[0].total_copies,4);
 assert.deepEqual((await f.service.open(f.env,f.user,b)).draws,r.draws);assert.equal(await f.coin(),999100);
});
const accountTables=['users','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','inventory_logs','coin_logs','joint_operations_v1'];
const snapshot=async f=>{const out={};for(const table of ['app_meta','mercenary_limited_stock_v1','admin_logs',...accountTables])out[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return out;};
async function setup(t){
 const f=await bloodmoonFixture(t);await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE';UPDATE users SET role='OWNER' WHERE id=1;ALTER TABLE app_meta ADD COLUMN updated_at TEXT;DELETE FROM mercenary_limited_stock_v1 WHERE code='V-973'");
 for(const target of TARGETS.filter(t=>t.before)){
  await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=$1,issued=$1 WHERE code=$2',[target.before,target.code]);
  for(let i=1;i<=target.before;i++)await f.pg.query('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,1,$3,$4,$5)',[target.code+':'+i,'prior-'+target.code,target.code,i,'2026-10-25']);
 }
 await f.pg.query("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-973',1,0,'direct-gift','direct-gift')");
 await f.setting(BLOODMOON_PACK_KEY,{revision:7,settings:old()});await f.setting('mercenary_halloween_ss_pack_v1',{preserve:'halloween'});await f.setting('mercenary_prime_craft_v1',{enabled:false});
 const read=await inspect(f.pg);return {...f,options:{expectedDocumentHash:read.documentHash}};
}
test('audited expansion changes only eight counters and one policy, preserves accounts and replays read-only',async t=>{
 const f=await setup(t),before=await snapshot(f),dry=await increaseStock(f.pg,f.options);assert(dry.dryRun);assert.deepEqual(await snapshot(f),before);
 const result=await increaseStock(f.pg,{...f.options,dryRun:false}),after=await snapshot(f);assert.equal(result.currentRevision,8);assert.equal(result.receipt.stockAdded,65);assert.equal(result.receipt.grants,0);
 for(const table of accountTables)assert.deepEqual(after[table],before[table],table);
 assert.deepEqual(after.app_meta.filter(r=>![OP,BLOODMOON_PACK_KEY].includes(r.key)),before.app_meta.filter(r=>r.key!==BLOODMOON_PACK_KEY));assert.equal(after.admin_logs.length,before.admin_logs.length+1);
 assert.equal(result.stock.find(s=>s.code==='V-973').issued,0);assert.equal(result.stock.find(s=>s.code==='V-978').remaining,2);
 const noWrites={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}};assert.equal((await increaseStock(noWrites,{dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),after);
});
test('injected migration failure and changed or inconsistent policy roll back without partial counters',async t=>{
 const f=await setup(t),before=await snapshot(f);
 await assert.rejects(increaseStock(f.pg,{dryRun:false,expectedDocumentHash:documentHash('wrong')}),/Pack settings changed/);assert.deepEqual(await snapshot(f),before);
 const fail={query:(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('INJECTED');return f.pg.query(sql,args);}};
 await assert.rejects(increaseStock(fail,{...f.options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=29 WHERE code='V-960'");const bad=await snapshot(f);await assert.rejects(increaseStock(f.pg,{...f.options,dryRun:false}),/Counter must match/);assert.deepEqual(await snapshot(f),bad);
});
