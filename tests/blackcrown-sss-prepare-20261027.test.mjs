import test from 'node:test';import assert from 'node:assert/strict';
import fixture from './fixtures/blackcrown-sss-reference-20261027.json' with {type:'json'};
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {prepareSettings,apply,inspect,OP,CODES} from '../scripts/ops/blackcrown-cardgu-revan-20261027.mjs';
import {BLACKCROWN_PACK_KEY,BLACKCROWN_PACK,readBlackcrownPackSettings,blackcrownPackState,pickBlackcrownBatch,blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLACKCROWN_SSS_CARDS} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLOODMOON_PACK_KEY} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {pickBlackcrownBulk} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {blackcrownOwnedCodes} from '../shared/mercenary-blackcrown-ownership-v1.mjs';
import {saveBlackcrownPack} from '../functions/_mercenary_blackcrown_pack.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';import {validateCatalog} from '../mercenary-codex/model.mjs';
const ordinary=[{code:'V-021',name:'검수 일반 SSS',rank:'SSS',weight:1}];
const prepared=()=>prepareSettings(fixture.blackcrown.settings,fixture.bloodmoon.settings);
function forcedSettings(code){const s=prepared().settings;s.mode='ON';s.prices={single:100,ten:900};s.normalRankRatesPpm=Object.fromEntries(Object.keys(s.normalRankRatesPpm).map(k=>[k,k==='SSS'?1000000:0]));s.missRatePpm=0;s.cardRatesPpm=Object.fromEntries(Object.keys(s.cardRatesPpm).map(k=>[k,k===code?1000000:0]));s.normalSssRatePpm=0;return s;}
test('preparation copies exact General Jok odds, preserves every old rate and subtracts only the ordinary remainder',()=>{
 const before=structuredClone(fixture),p=prepared(),s=p.settings;assert.deepEqual(fixture,before);assert.equal(s.mode,'OFF');assert.equal(p.conditionalRatePpm,10);assert.equal(p.effectiveSinglePercent,'0.0000008');assert.equal(s.normalSssRatePpm,969580);
 for(const code of CODES){assert.equal(s.cardRatesPpm[code],10);assert.equal(s.stockLimits[code],5);}for(const[k,v]of Object.entries(before.blackcrown.settings.cardRatesPpm))assert.equal(s.cardRatesPpm[k],v);assert.deepEqual(s.prices,before.blackcrown.settings.prices);assert.deepEqual(s.normalRankRatesPpm,before.blackcrown.settings.normalRankRatesPpm);
 assert.throws(()=>prepareSettings({...fixture.blackcrown.settings,mode:'ON'},fixture.bloodmoon.settings));assert.throws(()=>prepareSettings(s,fixture.bloodmoon.settings));
});
test('old r4 is readable without policy writes, invented rewards or restored removed rewards',()=>{
 const old=structuredClone(fixture.blackcrown.settings),s=readBlackcrownPackSettings(old);assert.deepEqual(old,fixture.blackcrown.settings);for(const code of CODES){assert.equal(s.cardRatesPpm[code],0);assert.equal(s.stockLimits[code],5);}for(const code of ['V-973','V-974','V-975','V-978'])assert(!Object.hasOwn(s.cardRatesPpm,code));assert.deepEqual(readBlackcrownPackSettings(s),s);assert.throws(()=>readBlackcrownPackSettings({...s,cardRatesPpm:{...s.cardRatesPpm,'V-001':0}}));
});
test('single, ten and bulk share the exact five-copy ceiling and never use the SS ownership penalty',()=>{
 for(const code of CODES){const settings=forcedSettings(code),stock=Object.entries(settings.stockLimits).map(([code,stock_limit])=>({code,stock_limit,issued:0})),s=blackcrownPackState(settings,stock,ordinary,{ownedCodes:['V-950','V-951','V-952','V-953','V-954','V-955',...CODES]});assert.equal(s.effectiveCardPercents[code],'100');assert.equal(s.ownedDistinctCount,6);assert.deepEqual(blackcrownOwnedCodes(CODES),[]);
  const draws=pickBlackcrownBatch(s,10,()=>0);assert.equal(draws.filter(r=>r.mercenaryCode===code).length,5);assert.equal(draws.filter(r=>r.mercenaryCode==='V-021').length,5);assert(draws.filter(r=>r.mercenaryCode===code).every(r=>r.rank==='SSS'&&r.edition==='SSS_LIMITED'));
  const bulk=pickBlackcrownBulk(s,100,()=>0);assert.equal(bulk.draws.length,5);assert.equal(bulk.normalDraws[0].quantity,95);
 }
});
test('actual isolated opening preserves an existing direct copy, issues serials 1-5 and cannot exceed five on retry',async t=>{
 for(const code of CODES){const f=await blackcrownFixture(t);Object.assign(f.settings,forcedSettings(code));await f.configure();await f.own(code,1);const body=f.body(10),before=await f.coin(),r=await f.service.open(f.env,f.user,body);assert.equal(r.draws.filter(d=>d.mercenaryCode===code).length,5);assert.equal(await f.coin(),before-900);assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=?',code).first()).total_copies),6);assert.equal((await f.state()).stock.find(s=>s.code===code).issued,5);assert.equal(blackcrownReceiptResults(r).filter(d=>d.mercenaryCode===code).length,5);assert((await f.service.open(f.env,f.user,body)).replayed);const next=await f.service.open(f.env,f.user,f.body());assert(next.draws.every(d=>d.mercenaryCode!==code));assert.equal((await f.state()).stock.find(s=>s.code===code).issued,5);}
});
test('CMS cannot silently change the new caps; both codex entries retain skills, power and pack-only acquisition',async t=>{
 const f=await blackcrownFixture(t);await assert.rejects(saveBlackcrownPack(f.env,f.user,{requestId:crypto.randomUUID(),expectedRevision:1,reason:'한도 위변조 검사',settings:{...f.settings,stockLimits:{...f.settings.stockLimits,'V-970':6}}}),e=>e.code==='MERCENARY_BLACKCROWN_CONFIG');
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61}));for(const code of CODES){const c=data.cards.find(c=>c.code===code);assert.equal(c.acquisition,'BLACKCROWN_PACK');assert.equal(c.serverLimit,5);assert.equal(c.packAcquisitionEnabled,true);assert.equal(c.acquisitionEnabled,false);assert.equal(c.basePower,2700000);assert.equal(c.skills.length,4);assert.equal(c.deploymentEnabled,true);}assert.deepEqual(BLACKCROWN_SSS_CARDS.map(c=>c.code),CODES);
});
test('the one-time configuration rolls back on failure and dry-run, then replays with SELECT only',async t=>{
 const f=await blackcrownFixture(t);for(const code of CODES)await f.p('DELETE FROM mercenary_limited_stock_v1 WHERE code=?',code).run();await f.setting(BLACKCROWN_PACK_KEY,fixture.blackcrown);await f.setting(BLOODMOON_PACK_KEY,fixture.bloodmoon);await f.own('V-971',1);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'OWNER'");const db={query:(s,a)=>f.pg.query(s,a)},before=await inspect(db),options={expectedPackHash:before.packHash,expectedReferenceHash:before.referenceHash};
 await assert.rejects(apply(db,{...options,failAfterWrite:true}),/BLACKCROWN_SSS_INJECTED_FAILURE/);assert.deepEqual(await inspect(db),before);
 assert.equal((await apply(db,{...options,dryRun:true})).status,'DRY_RUN_PASSED');assert.deepEqual(await inspect(db),before);
 const r=await apply(db,options);assert.equal(r.status,'APPLIED');assert.equal(r.after.pack.revision,5);assert.equal(r.receipt.accountWrites,0);assert.equal(r.after.ownedHash,before.ownedHash);assert(r.after.stock.every(s=>Number(s.stock_limit)===5&&Number(s.issued)===0));
 const replay=await apply({query:(s,a)=>{assert(/^SELECT\b/.test(s));return db.query(s,a);}});assert.equal(replay.replayed,true);assert.equal(replay.receipt.operationKey,OP);
});
