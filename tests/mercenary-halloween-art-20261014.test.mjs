import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {HALLOWEEN_MERCENARIES as cards} from '../shared/mercenary-halloween-catalog-v1.mjs';
import {HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,halloweenPackDraft,validateHalloweenPack,halloweenPackState} from '../shared/mercenary-halloween-pack-v1.mjs';
import {LIMITED_MERCENARIES,isLimitedMercenary} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedPolicyDraft,validateLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs';
import {limitedPackDraft,validateLimitedPack} from '../shared/mercenary-limited-pack-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {handleHalloweenPack,readHalloweenPackState,saveHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {prepareHalloweenRegistration,HALLOWEEN_REGISTRATION_KEY} from '../scripts/ops/halloween-art-registration-20261014.mjs';

test('seven approved sources publish independently with Namsudaeng identity, SS rank and intact PNGs',()=>{
 const expected=['나무늘봉순','조은','하이희야','오리꿍','디임','아윤','남수댕'];assert.deepEqual(cards.map(c=>c.name),expected);
 const catalog=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-14'}));
 assert.equal(catalog.cards.filter(c=>c.season==='HALLOWEEN').length,7);for(const c of [...LIMITED_MERCENARIES,...cards])assert.ok(catalog.cards.some(row=>row.code===c.code&&row.edition==='LIMITED'));
 for(const c of cards){
  assert.equal(c.rank,'SS');assert.equal(c.acquisitionPackId,HALLOWEEN_PACK.id);assert.equal(c.serverLimit,10);
  assert.equal(createHash('sha256').update(fs.readFileSync(c.sourceArt)).digest('hex').toUpperCase(),c.sourceArtSha256);
  for(const p of [c.displayArt,c.thumbnailArt,c.frame])assert.ok(fs.statSync(p).size>0,p);
  if(c.code==='V-980')assert.ok(c.battleSprite.includes('halloween-harlequin-20261017'));else assert.ok(c.battleSprite.includes('halloween-battle-20261017'));assert.equal(c.skills.length,1);assert.equal(c.deploymentEnabled,true);assert.equal(limitedDeploymentSnapshot(c.code).basePower,216000);
  assert.equal(seed.catalog.cards.some(r=>r.code===c.code),false);
 }
 assert.equal(LIMITED_MERCENARIES.length,9);assert.equal(LIMITED_MERCENARIES.find(c=>c.code==='V-990').sourceArtSha256,'EFC0B6D14A891917D517E8F9850D398165A0F94C11006DD6945BB2D05C627120');
});

test('Halloween identities cannot enter ordinary grants, ordinary limited packs or configured foreign pools',()=>{
 for(const c of cards){
  assert.equal(isLimitedMercenary(c.code),true);
  assert.throws(()=>assertMercenaryAcquisitionEnabled(c.code,{cardWeights:{[c.code]:100}}),e=>e.code==='MERCENARY_ACQUISITION_DISABLED');
  assert.throws(()=>mercenaryCardAcquisitionStatements({prepare(){throw Error('database touched');}},{userId:1,mercenaryCode:c.code,acquisitionId:'halloween-foreign-grant'}),/Invalid mercenary acquisition/);
  const policy=limitedPolicyDraft();policy.cardWeights[c.code]=1;assert.throws(()=>validateLimitedPolicy(policy));
  const settings=limitedPackDraft();settings.stockLimits[c.code]=5;assert.throws(()=>validateLimitedPack(settings));
 }
});

test('unconfigured price and probability stay null; opening and per-character cap cannot be overridden',()=>{
 const draft=halloweenPackDraft(),state=halloweenPackState();assert.equal(state.userOpeningEnabled,false);assert.equal(state.releaseEnabled,true);
 assert.deepEqual(draft.prices,{single:null,ten:null});assert.equal(draft.missRatePpm,null);assert.ok(Object.values(draft.cardRatesPpm).every(v=>v===null));assert.ok(state.stock.filter(s=>/^V-98[0-6]$/.test(s.code)).every(s=>s.limit===10&&s.remaining===null));assert.equal(state.stock.find(s=>s.code==='V-989').limit,3);assert.equal(state.stock.find(s=>s.code==='V-999').limit,null);
 for(const mutate of [s=>s.stockLimits['V-980']=6,s=>s.stockLimits['V-980']=4,s=>s.cardRatesPpm['V-990']=1,s=>s.prices.single=0,s=>s.cardRatesPpm['V-980']=NaN,s=>{s.cardRatesPpm['V-980']=1000000;s.normalSssRatePpm=1;}]){const s=halloweenPackDraft();mutate(s);assert.throws(()=>validateHalloweenPack(s));}
 const precise=halloweenPackDraft();precise.cardRatesPpm['V-980']=0.0001;assert.equal(validateHalloweenPack(precise).cardRatesPpm['V-980'],0.0001);
 assert.throws(()=>halloweenPackState(draft,[{code:'V-980',stock_limit:6,issued:0}]));assert.throws(()=>halloweenPackState(draft,[{code:'V-980',stock_limit:10,issued:11}]));
});

const body=()=>({expectedRevision:1,settings:halloweenPackDraft(),requestId:crypto.randomUUID(),reason:'할로윈 팩 초안 검수'});
const call=(f,path,method='GET',payload,role='OWNER',origin='https://qa.test')=>handleHalloweenPack({path,request:new Request('https://qa.test/api/'+path,{method,headers:{origin,'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),env:f.env,deps:{authenticate:async()=>null,requirePermission:async()=>({id:1,role}),json:(value,status=200)=>({body:value,status})}});

test('public state is read-only, opening has zero database effects, and only OWNER can save a draft',async t=>{
 const f=await limitedFixture(t);await f.configure();const beforeQueries=f.stats.queries;
 assert.equal((await call(f,HALLOWEEN_PACK.openPath,'POST',{mode:'ON',count:1})).status,401);assert.equal(f.stats.queries,beforeQueries);
 for(const role of ['USER','ADMIN'])assert.equal((await call(f,HALLOWEEN_PACK.adminPath,'PATCH',body(),role)).status,403);
 assert.equal(f.stats.queries,beforeQueries);
 const batches=f.stats.batches;const state=await call(f,HALLOWEEN_PACK.featurePath);assert.equal(state.status,200);assert.equal(state.body.cards.length,9);assert.equal(f.stats.batches,batches);
 assert.equal((await call(f,HALLOWEEN_PACK.adminPath,'PATCH',body(),'OWNER','https://evil.test')).status,403);
 const on=body();on.settings.mode='ON';assert.equal((await call(f,HALLOWEEN_PACK.adminPath,'PATCH',on)).status,400);
 assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
});

test('draft saves atomically, rolls back on audit failure and replays a lost response without touching existing packs',async t=>{
 const f=await limitedFixture(t);await f.configure();const before=(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows;
 const b=body();b.settings.prices.single=123456789;b.settings.cardRatesPpm['V-986']=1;
 f.fail('INSERT INTO admin_logs');await assert.rejects(saveHalloweenPack(f.env,f.user,b),/INJECTED/);f.fail('');
 assert.deepEqual((await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,before);
 f.loseAck();const first=await saveHalloweenPack(f.env,f.user,b);assert.equal(first.replayed,true);assert.equal(first.settings.mode,'OFF');assert.equal(first.settings.prices.single,123456789);
 assert.equal((await saveHalloweenPack(f.env,f.user,b)).replayed,true);
 assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
 await assert.rejects(saveHalloweenPack(f.env,f.user,{...b,reason:'변경된 다른 사유'}),e=>e.code==='MERCENARY_HALLOWEEN_CONFLICT');
 assert.deepEqual((await f.pg.query('SELECT * FROM app_meta WHERE key NOT LIKE $1 ORDER BY key',[HALLOWEEN_PACK_KEY+'%'])).rows,before);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);
});

test('two simultaneous settings edits have one winner, preserving one receipt and one audit',async t=>{
 const f=await limitedFixture(t),a=body(),b=body();a.settings.prices.single=100;b.settings.prices.single=200;
 const results=await Promise.allSettled([saveHalloweenPack(f.env,f.user,a),saveHalloweenPack(f.env,f.user,b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'MERCENARY_HALLOWEEN_CONFLICT');
 assert.equal((await readHalloweenPackState(f.env)).revision,2);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});

test('registration seeds seven stock caps exactly once, creates no holdings, and dry run rolls back',async t=>{
 const f=await limitedFixture(t);await f.configure();await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; UPDATE users SET role='OWNER' WHERE id=1");
 const before=(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,settings=(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows;
 const dry=await prepareHalloweenRegistration(f.pg,{dryRun:true});assert.equal(dry.status,'DRY_RUN_PASSED');assert.deepEqual((await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,before);assert.deepEqual((await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,settings);
 const saved=await prepareHalloweenRegistration(f.pg);assert.equal(saved.status,'VERIFIED');assert.equal(saved.stock.length,7);assert.ok(saved.stock.every(s=>s.limit===5&&s.issued===0));assert.equal((await prepareHalloweenRegistration(f.pg)).replayed,true);
 assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
 assert.deepEqual((await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 WHERE code NOT LIKE $1 ORDER BY code',['V-98%'])).rows,before);
 assert.equal((await f.pg.query('SELECT * FROM app_meta WHERE key=$1',[HALLOWEEN_REGISTRATION_KEY])).rows.length,1);
});
