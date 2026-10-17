import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,readHalloweenPackSettings,validateHalloweenPack,halloweenReceiptResults} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenBatchCinematic} from '../js/mercenary-halloween-pack-live.mjs';
import {readHalloweenPackState} from '../functions/_mercenary_halloween_pack.js';
import {createHalloweenPackService} from '../functions/_mercenary_halloween_opening.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {handleMercenaryLevel,previewMercenaryTraining} from '../functions/_mercenary_level.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryLevelDraft,mercenaryGrowthDraft,MERCENARY_LEVEL_KEY} from '../shared/mercenary-level-v1.mjs';
import {registerHalloweenSssStock,HALLOWEEN_SSS_STOCK_KEY} from '../scripts/ops/halloween-sss-stock-20261017.mjs';
const only=(settings,code)=>{settings.cardRatesPpm=Object.fromEntries(Object.keys(settings.cardRatesPpm).map(c=>[c,c===code?1000000:0]));};

test('V2 draft keeps existing conditional odds and adds three unset SSS targets with fixed stock policies',()=>{
 const old=halloweenPackDraft();old.format='MERCENARY_HALLOWEEN_SS_PACK_V2';for(const c of ['V-999','V-989','V-996']){delete old.cardRatesPpm[c];delete old.stockLimits[c];}old.stockLimits=Object.fromEntries(Object.keys(old.stockLimits).map(code=>[code,5]));old.cardRatesPpm['V-980']=200;old.normalRankRatesPpm.SSS=10000;
 const upgraded=readHalloweenPackSettings(old);assert.equal(upgraded.cardRatesPpm['V-980'],200);assert.equal(upgraded.normalRankRatesPpm.SSS,10000);assert.equal(upgraded.cardRatesPpm['V-989'],null);assert.equal(upgraded.cardRatesPpm['V-999'],null);assert.equal(upgraded.stockLimits['V-999'],null);assert.equal(upgraded.stockLimits['V-989'],3);assert.equal(Object.keys(old.cardRatesPpm).length,7);
 for(const [c,n] of [['V-989',4],['V-999',7]]){const changed=structuredClone(upgraded);changed.stockLimits[c]=n;assert.throws(()=>validateHalloweenPack(changed));}
});

test('Helios shares its existing last copy, serial seven, and concurrent requests cannot overissue',async t=>{
 const f=await halloweenFixture(t);only(f.settings,'V-999');await f.configure();
 const state=await f.state();assert.deepEqual(state.stock.find(s=>s.code==='V-999'),{code:'V-999',limit:7,issued:6,remaining:1,prepared:true,scope:'EXISTING_SHARED'});
 const before=await f.coin();await assert.rejects(f.service.open(f.env,f.user,f.body(10)),e=>e.code==='MERCENARY_HALLOWEEN_SOLD_OUT');assert.equal(await f.coin(),before);
 const results=await Promise.allSettled([f.service.open(f.env,f.user,f.body()),f.service.open(f.env,{id:2},f.body())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const receipt=results.find(r=>r.status==='fulfilled').value;assert.equal(receipt.draws[0].serial,7);assert.equal(receipt.draws[0].rank,'SSS');assert.equal(halloweenBatchCinematic(halloweenReceiptResults(receipt)).rank,'SSS');assert.match(halloweenReceiptResults(receipt)[0].artUrl,/v-999-640/);
 assert.equal((await f.state()).stock.find(s=>s.code==='V-999').remaining,0);assert.equal(await f.coin()+await f.coin(2),1999900);
});

test('three Jinmu pack serials exclude the owner copy; rollback and lost acknowledgement never consume an extra slot',async t=>{
 const f=await halloweenFixture(t);only(f.settings,'V-989');await f.configure();await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-989',1,0,?,?)",'original','original').run();
 const b=f.body(),buyer={id:2};f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,buyer,b),/INJECTED/);f.fail('');assert.equal((await f.state()).stock.find(s=>s.code==='V-989').issued,0);assert.equal(await f.coin(2),1000000);
 const first=await f.service.open(f.env,buyer,b);assert.equal(first.draws[0].serial,1);const calls=f.stats.statements;assert.equal((await f.service.open(f.env,buyer,b)).replayed,true);assert.equal(f.stats.statements,calls);
 for(const id of [3,4])await f.service.open(f.env,{id},f.body());assert.equal((await f.state()).stock.find(s=>s.code==='V-989').issued,3);await assert.rejects(f.service.open(f.env,{id:5},f.body()),e=>e.code==='MERCENARY_HALLOWEEN_NOT_READY');
 assert.equal(Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code='V-989'").first()).total_copies),1);
 assert.deepEqual([...await readJinmuPackOwners(f.env,[1,2,3,4,5])].sort(),[2,3,4]);assert.equal(halloweenBatchCinematic(halloweenReceiptResults(first)).rank,'SSS');assert.match(halloweenReceiptResults(first)[0].artUrl,/jinmu-20261012/);
});

test('a completed Jinmu pack recipient can view, equip, battle and train; stray/recalled ownership stays blocked',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 await f.p("INSERT INTO users(id,nickname) VALUES(1,'owner'),(4977,'recalled')").run();
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES('V-989',3)").run();
 const s=halloweenPackDraft();s.mode='ON';s.prices={single:100,ten:900};s.normalRankRatesPpm=Object.fromEntries(Object.keys(s.normalRankRatesPpm).map(r=>[r,r==='SSS'?1000000:0]));s.normalSssRatePpm=0;s.missRatePpm=0;only(s,'V-989');await f.setting(HALLOWEEN_PACK_KEY,{revision:1,settings:s});
 const svc=createHalloweenPackService({readState:readHalloweenPackState,releaseEnabled:true,randomInt:()=>0});await svc.open(f.env,f.user,{requestId:crypto.randomUUID(),count:1,expectedRevision:1});
 for(const id of [1,4977])await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(?,'V-989',1,0,'original','original')",id).run();
 assert.equal((await mercenaryAccountState(f.env,{id:4977})).cards.length,0);assert.equal((await mercenaryAccountState(f.env,{id:1})).cards[0].exclusiveGrant,true);
 const card=(await mercenaryAccountState(f.env,f.user)).cards[0];assert.equal(card.code,'V-989');assert.equal(card.canDeploy,true);assert.equal(card.exclusiveGrant,false);assert.equal(card.excludedFromLimitedCount,false);
 for(const mode of ['PVE','PVP']){
  await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:'V-989',revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).code,'V-989');assert.equal((await releasedMercenarySnapshots(f.env,[7,4977],mode)).get(7).code,'V-989');
  await assert.rejects(saveMercenaryLoadout(f.env,{id:4977},{requestId:crypto.randomUUID(),mode,mercenaryCode:'V-989',revision:0}),e=>e.code==='MERCENARY_NOT_OWNED');
 }
 const level=mercenaryLevelDraft();level.mode='ON';level.xpPerCard=Object.fromEntries(Object.keys(level.xpPerCard).map(r=>[r,100]));level.levels.forEach(r=>r.requiredXp=300);level.milestones.forEach(r=>r.successChancePpm=100000);level.growth=mercenaryGrowthDraft();for(const k in level.growth.perLevel)level.growth.perLevel[k]=0;for(const m of level.growth.milestones)for(const k in m)if(k!=='level')m[k]=0;await f.setting(MERCENARY_LEVEL_KEY,level);
 const response=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('https://qa.test/api/mercenaries/v3/leveling/state'),env:f.env,deps:{authenticate:async()=>f.user,json:body=>body}});assert.ok(response.cards.some(c=>c.code==='V-989'));
 // A second copy can be training material without consuming the recipient's final copy.
 await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=2,duplicate_count=1 WHERE user_id=7 AND mercenary_code='V-989'").run();
 const preview=await previewMercenaryTraining(f.env,f.user,{mercenaryCode:'V-989',revision:0,materials:[{code:'V-989',quantity:1}]});assert.ok(preview.after.level>=1);
 await f.p("UPDATE joint_operations_v1 SET status='CANCELLED' WHERE kind='MERCENARY_HALLOWEEN_OPEN'").run();assert.equal((await mercenaryAccountState(f.env,f.user)).cards.length,0);await assert.rejects(loadMercenaryBattleSnapshot(f.env,f.user),e=>e.code==='MERCENARY_NOT_OWNED');
});

test('stock registration adds only Jinmu 0/3, preserves Helios/settings/owner, rolls back and replays',async t=>{
 const f=await halloweenFixture(t);f.settings.mode='OFF';await f.configure();await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; UPDATE users SET role='OWNER' WHERE id=1; DELETE FROM mercenary_limited_stock_v1 WHERE code='V-989'; INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-989',1,0,'original','original')");
 const snapshot=async()=>({stock:(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,meta:(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,holders:(await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows});const before=await snapshot();
 assert.equal((await registerHalloweenSssStock(f.pg,{dryRun:true})).status,'DRY_RUN_PASSED');assert.deepEqual(await snapshot(),before);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};await assert.rejects(registerHalloweenSssStock(failing),/INJECTED/);assert.deepEqual(await snapshot(),before);
 const first=await registerHalloweenSssStock(f.pg);assert.deepEqual(first.stock,[{code:'V-989',limit:3,issued:0,remaining:3},{code:'V-999',limit:7,issued:6,remaining:1}]);assert.equal((await registerHalloweenSssStock(f.pg)).replayed,true);
 const after=await snapshot();assert.deepEqual(after.stock.filter(r=>r.code!=='V-989'),before.stock);assert.deepEqual(after.meta.filter(r=>r.key!==HALLOWEEN_SSS_STOCK_KEY),before.meta);assert.deepEqual(after.holders,before.holders);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});
