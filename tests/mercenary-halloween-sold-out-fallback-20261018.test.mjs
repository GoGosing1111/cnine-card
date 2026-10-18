import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {halloweenPackDraft,halloweenPackState,pickHalloweenBatch} from '../shared/mercenary-halloween-pack-v1.mjs';
import {LIMITED_RATE_TOTAL,limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {halloweenSsOnceKey} from '../functions/_mercenary_halloween_once.js';

const one=async f=>(await f.pg.query('SELECT plan_json,status FROM joint_operations_v1 WHERE user_id=1')).rows[0];
const sample=values=>max=>{assert.ok(values.length,'Unexpected lottery');const value=values.shift();assert.ok(value>=0&&value<max);return value;};

test('every exhausted limited interval goes to weighted ordinary SSS, including exact boundaries',()=>{
 const settings=halloweenPackDraft();settings.mode='ON';settings.prices={single:100,ten:900};
 settings.normalRankRatesPpm={C:0,B:0,A:0,S:0,SS:0,SSS:1000000};settings.missRatePpm=0;
 settings.cardRatesPpm=Object.fromEntries(HALLOWEEN_PACK_CARDS.map(c=>[c.code,99999.9999]));settings.normalSssRatePpm=0.001;
 const stock=HALLOWEEN_PACK_CARDS.map(c=>({code:c.code,stock_limit:settings.stockLimits[c.code]??7,issued:settings.stockLimits[c.code]??7}));
 const normal=[{code:'V-001',name:'일반 SSS A',rank:'SSS',weight:2},{code:'V-002',name:'일반 SSS B',rank:'SSS',weight:3}];
 const before=structuredClone(settings),state=halloweenPackState(settings,stock,normal);
 assert.equal(state.userOpeningEnabled,true);assert.equal(state.currentRates.normalSssRatePpm,1000000);
 assert.equal(state.effectiveNormalSssPercent,'100');assert.ok(Object.values(state.effectiveCardPercents).every(p=>p==='0'));
 assert.deepEqual(settings,before);assert.deepEqual(state.settings,before);
 let start=0;
 for(const card of HALLOWEEN_PACK_CARDS){
  const units=limitedRateUnits(settings.cardRatesPpm[card.code]);
  for(const ticket of [start,start+units-1])for(const [normalTicket,code] of [[0,'V-001'],[1,'V-001'],[2,'V-002'],[4,'V-002']]){
   const values=[0,ticket,normalTicket],draw=pickHalloweenBatch(state,1,sample(values))[0];
   assert.equal(draw.mercenaryCode,code);assert.equal(draw.outcomeId,'CARD_SSS');assert.equal(draw.edition,'STANDARD');assert.equal(values.length,0);
  }
  start+=units;
 }
 assert.equal(start+limitedRateUnits(settings.normalSssRatePpm),LIMITED_RATE_TOTAL);
 const liveStock=structuredClone(stock);liveStock[3].issued--;
 const partial=halloweenPackState(settings,liveStock,normal);assert.equal(partial.currentRates.cardRatesPpm[liveStock[3].code],99999.9999);
 assert.equal(partial.currentRates.normalSssRatePpm,900000.0001);
 const values=[0,3*limitedRateUnits(99999.9999)];assert.equal(pickHalloweenBatch(partial,1,sample(values))[0].mercenaryCode,liveStock[3].code);assert.equal(values.length,0);
 assert.equal(halloweenPackState(settings,stock,[]).userOpeningEnabled,false);
 assert.equal(halloweenPackState(settings,stock.slice(1),normal).userOpeningEnabled,false);
});

test('a buyer taking the last copy after planning gives the other buyer SSS with one payment and a stable receipt',async t=>{
 let calls=0;const f=await halloweenFixture(t,{randomInt:()=>{calls++;return 0;}});
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=9 WHERE code='V-980'");
 const batch=f.DB.batch.bind(f.DB);let winner=null,raced=false;
 f.DB.batch=async statements=>{
  if(!raced){raced=true;winner=await f.service.open(f.env,{id:2},f.body());}
  return batch(statements);
 };
 const body=f.body(),loser=await f.service.open(f.env,f.user,body);
 assert.equal(winner.draws[0].serial,10);assert.equal(loser.draws[0].outcomeId,'CARD_SSS');assert.equal(loser.draws[0].serial,undefined);
 assert.equal(calls,5);const beforeReplay=calls;
 assert.deepEqual((await f.service.open(f.env,f.user,body)).draws,loser.draws);assert.equal(calls,beforeReplay);
 assert.equal(await f.coin(),999900);assert.equal(await f.coin(2),999900);
 assert.equal((await f.pg.query('SELECT * FROM coin_logs')).rows.length,2);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_card_acquisitions_v1')).rows.length,2);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,1);
 const saved=await one(f);assert.equal(saved.status,'COMPLETED');assert.equal(JSON.parse(saved.plan_json).stockFallbacks[0].limitedCode,'V-980');
});

test('an old pending limited plan saves its SSS replacement before debit and never resamples after rollback',async t=>{
 let calls=0;const f=await halloweenFixture(t,{randomInt:()=>{calls++;return 0;}}),body=f.body();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED/);
 assert.equal(calls,2);assert.equal((await one(f)).status,'PENDING');assert.equal(await f.coin(),1000000);
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=10 WHERE code='V-980'");
 await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED/);
 const saved=JSON.parse((await one(f)).plan_json);assert.equal(saved.draws[0].outcomeId,'CARD_SSS');assert.equal(calls,3);
 assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
 f.fail('');f.loseAck();const result=await f.service.open(f.env,f.user,body);assert.equal(result.draws[0].mercenaryCode,saved.draws[0].mercenaryCode);
 assert.equal(calls,3);assert.equal(await f.coin(),999900);assert.deepEqual((await f.service.receipt(f.env,f.user,body.requestId)).draws,result.draws);
 assert.equal((await f.pg.query('SELECT * FROM coin_logs')).rows.length,1);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);
});

test('all limited stock exhausted still allows ten openings; missing ordinary SSS cannot charge',async t=>{
 const f=await halloweenFixture(t);await f.pg.exec('UPDATE mercenary_limited_stock_v1 SET issued=stock_limit');
 const settings=JSON.stringify(f.settings),state=await f.state();assert.equal(state.userOpeningEnabled,true);
 const result=await f.service.open(f.env,f.user,f.body(10));assert.ok(result.draws.every(d=>d.outcomeId==='CARD_SSS'&&d.quantity===1));
 assert.equal(await f.coin(),999100);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);
 assert.equal(JSON.stringify((await f.state()).settings),settings);
 const row=(await f.pg.query('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1')).rows[0],policy=JSON.parse(row.payload_json);
 for(const card of state.normalCards.filter(c=>c.rank==='SSS'))policy.cardRules.cardWeights[card.code]=0;
 await f.pg.query('UPDATE mercenary_draw_config_v1 SET payload_json=$1,revision=revision+1 WHERE id=1',[JSON.stringify(policy)]);
 await assert.rejects(f.service.open(f.env,{id:2},f.body()),{code:'MERCENARY_HALLOWEEN_NOT_READY'});assert.equal(await f.coin(2),1000000);
});

test('a forced SS lost to a stock race falls back to SSS and retains the one-time entitlement',async t=>{
 const f=await halloweenFixture(t);await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 await f.setting(halloweenSsOnceKey(1),{version:1,status:'ARMED',remaining:1,userId:1,actorId:1,operationId:'fallback-once-fixture',packId:'mercenary-halloween-ss-limited',rank:'SS',edition:'HALLOWEEN_LIMITED'});
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=9 WHERE code='V-980'");
 const batch=f.DB.batch.bind(f.DB);let raced=false;
 f.DB.batch=async statements=>{if(!raced){raced=true;await f.service.open(f.env,{id:2},f.body());}return batch(statements);};
 const result=await f.service.open(f.env,f.user,f.body());assert.equal(result.draws[0].outcomeId,'CARD_SSS');
 const armed=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',halloweenSsOnceKey(1)).first()).value);assert.equal(armed.status,'ARMED');assert.equal(armed.remaining,1);
 assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,0);assert.equal(await f.coin(),999900);
});
