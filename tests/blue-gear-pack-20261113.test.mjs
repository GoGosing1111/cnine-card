import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {blueGearRegistration,blueGearCatalog,blueGearState,BLUE_GEAR_PACK_KEY,BLUE_GEAR_PACK,BLUE_GEAR_STOCK_PREFIX,BLUE_GEAR_DRAW_POLICY as policy} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {pickBlackcrownBatch,blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {readBlueGearPackState,createBlueGearPackService} from '../functions/_mercenary_blue_gear_pack.js';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
const baseline={revision:14,settings:{prices:{single:1500000000,ten:15000000000},missRatePpm:800000,normalRankRatesPpm:{C:104500,B:30000,A:30000,S:30000,SS:4700,SSS:800},cardRatesPpm:{'V-975':1,'V-058':400}}};
const black={revision:11,settings:{cardRatesPpm:Object.fromEntries(Array.from({length:6},(_,i)=>['V-'+(950+i),5000]))}};
const config=()=>blueGearRegistration(baseline,black);
const before='2026-11-19T14:59:59.999Z',after='2026-11-19T15:00:00.000Z';
const stock=doc=>Object.entries(doc.settings.stockLimits).map(([code,stock_limit])=>({code:BLUE_GEAR_STOCK_PREFIX+code,stock_limit,issued:0}));
test('KST midnight, original odds, price and distinct ownership',()=>{
 const doc=config(),rows=stock(doc);
 assert.equal(blueGearCatalog(doc,rows,before).drawEnabled,false);assert.equal(blueGearCatalog(doc,rows,after).drawEnabled,true);
 assert.deepEqual(doc.settings.prices,{single:2250000000,ten:22500000000});
 const s=blueGearState(doc,rows,[],after);for(const code of policy.ssCodes){assert.equal(s.effectiveCardPercents[code],'0.00004');assert.equal(ALL_LIMITED_MERCENARIES.filter(c=>c.code===code).length,1);assert.equal(limitedDeploymentSnapshot(code).basePower,1000000);assert.equal(limitedDeploymentSnapshot(code).skills.length,2);}
 for(const code of ['V-976','V-967'])assert.equal(s.effectiveCardPercents[code],'0.00000008');
 assert.equal(s.effectiveCardPercents['V-058'],'0.000032');
 assert.equal(s.settings.normalSssRatePpm,997098);
 rows[4].issued=10;const other=blueGearState(doc,rows,[],after,['V-701','V-703']);assert.equal(other.effectiveCardPercents['V-701'],'0');assert.equal(other.effectiveCardPercents['V-702'],'0.00002');assert.equal(other.effectiveCardPercents['V-705'],'0');
 assert.equal(blueGearCatalog(doc,rows.slice(1),after).drawEnabled,false);
});
test('ordinary SSS replaces owned and exhausted slots without reroll',()=>{
 const doc=config(),rows=stock(doc),normals=[{code:'V-001',name:'일반',rank:'SSS',weight:1}];
 rows[0].issued=10;
 const s=blueGearState(doc,rows,normals,after,['V-702']);
 for(const ticket of [0,5000000]){let r=[1992000000,ticket,0];const [d]=pickBlackcrownBatch(s,1,()=>r.shift(),policy);assert.equal(d.mercenaryCode,'V-001');assert.equal(r.length,0);}
});
test('production transaction paths, time lock, stock, 1/10/bulk, recovery and foreign receipt isolation',async t=>{
 const f=await limitedFixture(t);await f.configure({enabled:false});const doc=config();
 let stage=0;const random=n=>n===10000000000?(stage++%2===0?1992000000:0):0;
 const svc=createBlueGearPackService({randomInt:random});
 const body=count=>({requestId:crypto.randomUUID(),expectedRevision:1,count});
 await f.pg.exec('UPDATE users SET coin=3000000000000 WHERE id IN (1,2)');
 await f.setting(BLUE_GEAR_PACK_KEY,{...doc,openingAt:'2199-11-19T15:00:00Z'});
 for(const row of stock(doc))await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',row.code,row.stock_limit).run();
 const initial=await f.coin();
 await assert.rejects(svc.open(f.env,f.user,body(1)),e=>e.code==='MERCENARY_BLACKCROWN_CLOSED');assert.equal(await f.coin(),initial);
 await f.setting(BLUE_GEAR_PACK_KEY,{...doc,openingAt:'2000-11-19T15:00:00Z'});
 const s=await readBlueGearPackState(f.env,{userId:1});assert.ok(s.userOpeningEnabled);
 const b=body(1),receipt=await svc.open(f.env,f.user,b);
 assert.equal(receipt.packId,BLUE_GEAR_PACK.id);assert.equal(receipt.draws[0].mercenaryCode,'V-701');assert.equal(receipt.draws[0].serial,1);
 assert.ok(blackcrownReceiptResults(receipt,BLUE_GEAR_PACK,policy)[0].limited);assert.equal(await f.coin(),initial-2250000000);
 const replay=await svc.open(f.env,f.user,b);assert.ok(replay.replayed);assert.equal(await f.coin(),initial-2250000000);
 await assert.rejects(svc.receipt(f.env,{id:2},b.requestId));
 const ten=await svc.open(f.env,f.user,body(10));assert.equal(ten.draws.length,10);assert.ok(ten.draws.every(d=>d.rank==='SSS'&&d.edition==='STANDARD'));
 const bulk=await svc.open(f.env,f.user,{...body(10),budget:'22500000000'});assert.equal(bulk.format,policy.bulkFormat);assert.equal(blackcrownReceiptResults(bulk,BLUE_GEAR_PACK,policy).reduce((n,r)=>n+r.quantity,0),10);
 for(const [offset,code] of [[25000000,'V-976'],[25010000,'V-967']]){
  stage=0;const service=createBlueGearPackService({randomInt:n=>n===10000000000?(stage++%2===0?1992000000:offset):0});
  const received=await service.open(f.env,f.user,body(1));assert.equal(received.draws[0].mercenaryCode,code);assert.equal(received.draws[0].serial,1);
 }
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1 WHERE code LIKE ?',BLUE_GEAR_STOCK_PREFIX+'%').first()).n,3);
});

import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
test('codex validates the full live roster and approves all seven pack identities',()=>{
 const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
 const result=validateCatalog(catalog,{forDisplay:true});
 assert.equal(result.cards.filter(c=>c.acquisition==='BLUE_GEAR_PACK').length,7);
});
