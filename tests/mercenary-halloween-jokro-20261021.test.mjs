import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,readHalloweenPackSettings,validateHalloweenPack,halloweenReceiptResults} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenBatchCinematic} from '../js/mercenary-halloween-pack-live.mjs';
import {readHalloweenPackState} from '../functions/_mercenary_halloween_pack.js';
import {createHalloweenPackService} from '../functions/_mercenary_halloween_opening.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';
import {handleMercenaryLevel,previewMercenaryTraining} from '../functions/_mercenary_level.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryLevelDraft,mercenaryGrowthDraft,MERCENARY_LEVEL_KEY} from '../shared/mercenary-level-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {halloweenEffectivePercent,pickHalloweenBatch} from '../shared/mercenary-halloween-pack-v1.mjs';
import {limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';
import {documentHash,prepareHalloweenJokroLaunch,launchHalloweenJokro,verifyHalloweenJokroLaunch} from '../scripts/ops/halloween-jokro-launch-20261021.mjs';
const only=(settings,code)=>{settings.cardRatesPpm=Object.fromEntries(Object.keys(settings.cardRatesPpm).map(c=>[c,c===code?1000000:0]));};

const snapshot=async f=>{const result={};for(const table of ['app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory','admin_logs'])result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;};
async function existingPack(t){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT; DELETE FROM mercenary_limited_stock_v1 WHERE code='V-979'; UPDATE mercenary_limited_stock_v1 SET stock_limit=8,issued=8,revision=13 WHERE code='V-999'; INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-979',1,0,'original','original')");
 f.settings.prices={single:1000000000,ten:10000000000};
 f.settings.normalRankRatesPpm={C:104500,B:30000,A:30000,S:30000,SS:5000,SSS:500};f.settings.missRatePpm=800000;
 f.settings.cardRatesPpm=Object.fromEntries(HALLOWEEN_PACK_CARDS.map(c=>[c.code,c.code==='V-979'?0:c.code==='V-989'?100:c.code==='V-977'?5000:c.rank==='SSS'?200:10000]));
 f.settings.normalSssRatePpm=924500;delete f.settings.cardRatesPpm['V-979'];delete f.settings.stockLimits['V-979'];await f.configure(16);
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 return {...f,document:JSON.parse(raw),options:{expectedDocumentHash:documentHash(raw),approvalReference:'ISOLATED_TEST'}};
}
test('old production settings stay open with zero Jokro odds until explicit activation',async t=>{
 const f=await existingPack(t),state=await f.state(),next=prepareHalloweenJokroLaunch(f.document.settings,(await snapshot(f)).mercenary_limited_stock_v1);
 assert.equal(state.settings.cardRatesPpm['V-979'],0);assert(state.userOpeningEnabled);assert.equal(state.stock.find(s=>s.code==='V-979').prepared,false);
 assert.equal(next.cardRatesPpm['V-979'],next.cardRatesPpm['V-989']);assert.equal(next.normalSssRatePpm,924400);
 assert.equal(halloweenEffectivePercent(next.normalRankRatesPpm.SSS,next.cardRatesPpm['V-979']),'0.000005');
 const unchanged=structuredClone(next);delete unchanged.cardRatesPpm['V-979'];delete unchanged.stockLimits['V-979'];unchanged.normalSssRatePpm+=100;assert.deepEqual(unchanged,f.document.settings);
 assert.throws(()=>validateHalloweenPack({...next,stockLimits:{...next.stockLimits,'V-979':4}}));
 const unavailable=structuredClone(f.document.settings);unavailable.mode='OFF';assert.throws(()=>prepareHalloweenJokroLaunch(unavailable,[]));
});
test('Jokro launch changes only its public stock and odds, rolls back atomically and replays without writes',async t=>{
 const f=await existingPack(t),before=await snapshot(f);
 await assert.rejects(launchHalloweenJokro(f.pg,{...f.options,expectedDocumentHash:'stale'}),/changed/);assert.deepEqual(await snapshot(f),before);
 await launchHalloweenJokro(f.pg,f.options);assert.deepEqual(await snapshot(f),before);
 for(const prefix of ['INSERT INTO mercenary_limited_stock','UPDATE app_meta','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const failing={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
  await assert.rejects(launchHalloweenJokro(failing,{...f.options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 }
 const result=await launchHalloweenJokro(f.pg,{...f.options,dryRun:false});assert.equal(result.currentRevision,17);assert.equal(result.receipt.grants,0);assert.equal(result.receipt.stockAdded,3);
 const after=await snapshot(f);
 for(const table of ['user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.filter(s=>s.code!=='V-979'),before.mercenary_limited_stock_v1);
 const state=await f.state();assert(state.userOpeningEnabled);assert.equal(state.stock.find(s=>s.code==='V-979').remaining,3);assert.equal(state.currentRates.cardRatesPpm['V-999'],0);
 assert.equal(state.effectiveCardPercents['V-979'],state.effectiveCardPercents['V-989']);
 const index=HALLOWEEN_PACK_CARDS.findIndex(c=>c.code==='V-979'),start=HALLOWEEN_PACK_CARDS.slice(0,index).reduce((n,c)=>n+limitedRateUnits(state.settings.cardRatesPpm[c.code]),0);
 for(const ticket of [start,start+limitedRateUnits(100)-1]){const samples=[limitedRateUnits(199500),ticket];assert.equal(pickHalloweenBatch(state,1,()=>samples.shift())[0].mercenaryCode,'V-979');}
 await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=1,revision=1 WHERE code='V-979'");
 const used=await snapshot(f),readOnly={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}};
 assert.equal((await launchHalloweenJokro(readOnly,{...f.options,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),used);await verifyHalloweenJokroLaunch(f.pg);
});
test('expired loan is not extended by the new pack path; a completed pack issue is independent',()=>{
 const expired=Date.parse('2026-10-21T00:00:00Z');
 assert.equal(jokroAccountAllowed(5950,'V-979',expired),false);
 assert.equal(jokroAccountAllowed(5950,'V-979',expired,true),true);
 assert.equal(jokroAccountAllowed(1,'V-979',expired),true);
 assert.equal(jokroAccountAllowed(9,'V-979',expired),false);
});
test('concurrent requests for the last Jokro slot issue serial three only once',async t=>{
 const f=await halloweenFixture(t);only(f.settings,'V-979');await f.configure();
 await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code='V-979'");
 const receipts=await Promise.all([2,3].map(id=>f.service.open(f.env,{id},f.body())));
 const won=receipts.filter(r=>r.draws[0].mercenaryCode==='V-979');
 assert.equal(won.length,1);assert.equal(won[0].draws[0].serial,3);
 assert.equal(receipts.filter(r=>r.draws[0].outcomeId==='CARD_SSS').length,1);
 assert.equal((await f.state()).stock.find(s=>s.code==='V-979').issued,3);
 assert.equal(await f.coin(2)+await f.coin(3),1999800);
});

test('three Jokro pack serials exclude the owner copy; rollback and lost acknowledgement never consume an extra slot',async t=>{
 const f=await halloweenFixture(t);only(f.settings,'V-979');await f.configure();await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-979',1,0,?,?)",'original','original').run();
 const b=f.body(),buyer={id:2};f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,buyer,b),/INJECTED/);f.fail('');assert.equal((await f.state()).stock.find(s=>s.code==='V-979').issued,0);assert.equal(await f.coin(2),1000000);
 const first=await f.service.open(f.env,buyer,b);assert.equal(first.draws[0].serial,1);const calls=f.stats.statements;assert.equal((await f.service.open(f.env,buyer,b)).replayed,true);assert.equal(f.stats.statements,calls);
 for(const id of [3,4])await f.service.open(f.env,{id},f.body());assert.equal((await f.state()).stock.find(s=>s.code==='V-979').issued,3);assert.equal((await f.service.open(f.env,{id:5},f.body())).draws[0].outcomeId,'CARD_SSS');
 assert.equal(Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code='V-979'").first()).total_copies),1);
 assert.deepEqual([...await readJokroPackOwners(f.env,[1,2,3,4,5])].sort(),[2,3,4]);assert.equal(halloweenBatchCinematic(halloweenReceiptResults(first)).rank,'SSS');assert.match(halloweenReceiptResults(first)[0].artUrl,/jokro-20261018/);
});

test('a completed Jokro pack recipient can view, equip, battle and train; stray/recalled ownership stays blocked',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 await f.p("INSERT INTO users(id,nickname) VALUES(1,'owner'),(4977,'recalled')").run();
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES('V-979',3)").run();
 const s=halloweenPackDraft();s.mode='ON';s.prices={single:100,ten:900};s.normalRankRatesPpm=Object.fromEntries(Object.keys(s.normalRankRatesPpm).map(r=>[r,r==='SSS'?1000000:0]));s.normalSssRatePpm=0;s.missRatePpm=0;only(s,'V-979');await f.setting(HALLOWEEN_PACK_KEY,{revision:1,settings:s});
 const svc=createHalloweenPackService({readState:readHalloweenPackState,releaseEnabled:true,randomInt:()=>0});await svc.open(f.env,f.user,{requestId:crypto.randomUUID(),count:1,expectedRevision:1});
 for(const id of [1,4977])await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(?,'V-979',1,0,'original','original')",id).run();
 assert.equal((await mercenaryAccountState(f.env,{id:4977})).cards.length,0);assert.equal((await mercenaryAccountState(f.env,{id:1})).cards[0].exclusiveGrant,true);
 const card=(await mercenaryAccountState(f.env,f.user)).cards[0];assert.equal(card.code,'V-979');assert.equal(card.canDeploy,true);assert.equal(card.exclusiveGrant,false);assert.equal(card.excludedFromLimitedCount,false);assert.equal((await rankedOwnedMercenaries(f.env,[7])).get(7)[0].code,'V-979');
 for(const mode of ['PVE','PVP']){
  await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:'V-979',revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).code,'V-979');assert.equal((await releasedMercenarySnapshots(f.env,[7,4977],mode)).get(7).code,'V-979');
  await assert.rejects(saveMercenaryLoadout(f.env,{id:4977},{requestId:crypto.randomUUID(),mode,mercenaryCode:'V-979',revision:0}),e=>e.code==='MERCENARY_NOT_OWNED');
 }
 const level=mercenaryLevelDraft();level.mode='ON';level.xpPerCard=Object.fromEntries(Object.keys(level.xpPerCard).map(r=>[r,100]));level.levels.forEach(r=>r.requiredXp=300);level.milestones.forEach(r=>r.successChancePpm=100000);level.growth=mercenaryGrowthDraft();for(const k in level.growth.perLevel)level.growth.perLevel[k]=0;for(const m of level.growth.milestones)for(const k in m)if(k!=='level')m[k]=0;await f.setting(MERCENARY_LEVEL_KEY,level);
 const response=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('https://qa.test/api/mercenaries/v3/leveling/state'),env:f.env,deps:{authenticate:async()=>f.user,json:body=>body}});assert.ok(response.cards.some(c=>c.code==='V-979'));
 // A second copy can be training material without consuming the recipient's final copy.
 await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=2,duplicate_count=1 WHERE user_id=7 AND mercenary_code='V-979'").run();
 const preview=await previewMercenaryTraining(f.env,f.user,{mercenaryCode:'V-979',revision:0,materials:[{code:'V-979',quantity:1}]});assert.ok(preview.after.level>=1);
 await f.p("UPDATE joint_operations_v1 SET status='CANCELLED' WHERE kind='MERCENARY_HALLOWEEN_OPEN'").run();assert.equal((await mercenaryAccountState(f.env,f.user)).cards.length,0);await assert.rejects(loadMercenaryBattleSnapshot(f.env,f.user),e=>e.code==='MERCENARY_NOT_OWNED');
});

