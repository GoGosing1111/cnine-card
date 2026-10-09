import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {createLimitedPackService,readLimitedPackState,saveLimitedPack,pickLimitedBatch} from '../functions/_mercenary_limited_pack.js';
import {limitedPackDraft,readLimitedPack,validateLimitedPack,limitedPackReadiness,limitedReceiptResults,LIMITED_PACK_KEY} from '../shared/mercenary-limited-pack-v1.mjs';
import {isLimitedMercenary} from '../shared/mercenary-limited-catalog-v1.mjs';
import {suggestedMercenaryDraw,parseDrawPercent} from '../shared/mercenary-draw-policy-v1.mjs';
const normalRates={C:500000,B:300000,A:140000,S:50000,SS:9000,SSS:989};
const request=(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:1,expectedPolicyRevision:1});
async function mixed(t){const f=await limitedFixture(t);f.packSettings.normalRankRatesPpm={...normalRates};f.policy.rankRatesPpm={SS:10,SSS:1};f.policy.cardWeights['V-996']=1;await f.configure();return f;}
function rolls(tickets){let call=0;return ()=>{const n=call++;return n%2?0:tickets[Math.floor(n/2)];};}

test('legacy drafts preserve limited economics, add unset ordinary odds without writes, and keep opening closed',async t=>{
 const f=await limitedFixture(t),draft=limitedPackDraft();draft.prices={single:111,ten:999};delete draft.normalRankRatesPpm;
 await f.setting(LIMITED_PACK_KEY,{revision:4,settings:draft});
 const before=await f.p('SELECT value FROM app_meta WHERE key=?',LIMITED_PACK_KEY).first(),state=await readLimitedPackState(f.env);
 assert.deepEqual(state.packSettings.prices,draft.prices);assert.deepEqual(state.packSettings.stockLimits,draft.stockLimits);
 assert.ok(Object.values(state.packSettings.normalRankRatesPpm).every(n=>n===null));assert.equal(state.userOpeningEnabled,false);assert.equal(state.readiness.ready,false);
 assert.deepEqual(await f.p('SELECT value FROM app_meta WHERE key=?',LIMITED_PACK_KEY).first(),before);
 assert.deepEqual(readLimitedPack(draft).normalRankRatesPpm,{C:null,B:null,A:null,S:null,SS:null,SSS:null});
 for(const value of [-1,1.00001,1000001,NaN]){const next=limitedPackDraft();next.normalRankRatesPpm.SS=value;assert.throws(()=>validateLimitedPack(next));}
 assert.equal(parseDrawPercent('0.0001'),1);assert.equal(parseDrawPercent('0.001'),10);
});

test('ordinary C through SSS and two limited ranks occupy exact independent absolute probability intervals',async t=>{
 const f=await mixed(t),state=await readLimitedPackState(f.env,{releaseEnabled:true});assert.equal(state.readiness.totalPpm,1000000);assert.equal(state.readiness.ready,true);
 const cases=[[0,'LIMITED_SS'],[9,'LIMITED_SS'],[10,'LIMITED_SSS'],[11,'CARD_C'],[500010,'CARD_C'],[500011,'CARD_B'],[800010,'CARD_B'],[800011,'CARD_A'],[940010,'CARD_A'],[940011,'CARD_S'],[990010,'CARD_S'],[990011,'CARD_SS'],[999010,'CARD_SS'],[999011,'CARD_SSS'],[999999,'CARD_SSS']];
 for(const [ticket,expected] of cases){const [draw]=pickLimitedBatch(state,1,rolls([ticket]));assert.equal(draw.outcomeId,expected);assert.equal(isLimitedMercenary(draw.mercenaryCode),expected.startsWith('LIMITED_'));assert.ok(draw.sourceArt&&draw.name);}
 assert.deepEqual(new Set(state.normalCards.map(c=>c.rank)),new Set(['C','B','A','S','SS','SSS']));assert.ok(state.normalCards.every(c=>!isLimitedMercenary(c.code)));
 const unbalanced=structuredClone(state.packSettings);unbalanced.normalRankRatesPpm.SS++;
 assert.equal(limitedPackReadiness(unbalanced,state.policy,state.stock,state.normalCards).ready,false);
});

test('mixed ten-pack rolls back and retries atomically; only limited cards consume stock or get serials',async t=>{
 const f=await mixed(t),tickets=[0,10,11,500011,800011,940011,990011,999011,990011,999011];let samples=0;
 const random=rolls(tickets),service=createLimitedPackService({releaseEnabled:true,randomInt:max=>{samples++;return random(max);}}),body=request(10);
 f.fail('INSERT INTO coin_logs');await assert.rejects(service.open(f.env,f.user,body),/INJECTED/);f.fail('');
 assert.equal(await f.coin(),1000000);assert.equal(Number((await f.p('SELECT SUM(issued) n FROM mercenary_limited_stock_v1').first()).n),0);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_mercenary_cards_v1').first()).n),0);
 const beforeSamples=samples;f.loseAck();const receipt=await service.open(f.env,f.user,body);assert.equal(samples,beforeSamples);assert.equal(await f.coin(),999100);
 assert.equal(receipt.draws.length,10);assert.equal(receipt.draws.filter(r=>r.edition==='LIMITED').length,2);
 assert.ok(receipt.draws.filter(r=>r.edition==='STANDARD').every(r=>!Object.hasOwn(r,'serial')));assert.ok(receipt.draws.slice(8).every(r=>r.duplicate&&r.duplicateCount===1));
 assert.equal(Number((await f.p('SELECT SUM(issued) n FROM mercenary_limited_stock_v1').first()).n),2);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_limited_issues_v1').first()).n),2);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),10);
 assert.equal((await service.open(f.env,f.user,body)).replayed,true);assert.equal(samples,beforeSamples);assert.equal(await f.coin(),999100);
 const results=limitedReceiptResults(receipt);assert.equal(results[0].limited,true);assert.match(results[0].artUrl,/packs\/limited-v1/);assert.equal(results[2].limited,false);assert.match(results[2].artUrl,/mercenaries\/codex-v1/);
 assert.equal((await service.receipt(f.env,f.user,body.requestId)).draws[9].duplicateCount,1);
});

test('general acquisition OFF is honored without changing limited odds or exposing limited cards to ordinary pools',async t=>{
 const f=await mixed(t),before=await readLimitedPackState(f.env,{releaseEnabled:true}),blocked=before.normalCards.find(c=>c.rank==='SSS');
 const draw=suggestedMercenaryDraw();draw.cardRules.cardWeights[blocked.code]=0;
 await f.p('UPDATE mercenary_draw_config_v1 SET payload_json=?,revision=2 WHERE id=1',JSON.stringify(draw)).run();
 const state=await readLimitedPackState(f.env,{releaseEnabled:true});assert.equal(state.normalCards.some(c=>c.code===blocked.code),false);assert.deepEqual(state.policy.rankRatesPpm,{SS:10,SSS:1});
 assert.equal(state.normalCards.some(c=>isLimitedMercenary(c.code)),false);
 if(!state.normalCards.some(c=>c.rank==='SSS'))assert.equal(state.readiness.ready,false);
});

test('CMS saves ordinary SS/SSS separately from both limited rates and leaves the general pack policy untouched',async t=>{
 const f=await mixed(t);await f.configure({enabled:false});const normalBefore=await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first();
 const pack=structuredClone(f.packSettings);pack.mode='OFF';pack.normalRankRatesPpm.SS=8999;pack.normalRankRatesPpm.SSS=989;
 const policy=structuredClone(f.policy);policy.rankRatesPpm={SS:10,SSS:2};
 const body={expectedRevision:1,expectedPackRevision:1,packSettings:pack,policy,requestId:crypto.randomUUID(),reason:'일반 등급과 리미티드 확률 분리'};
 const saved=await saveLimitedPack(f.env,f.user,body);assert.deepEqual(saved.policy.rankRatesPpm,{SS:10,SSS:2});assert.equal(saved.packSettings.normalRankRatesPpm.SS,8999);assert.equal(saved.packSettings.normalRankRatesPpm.SSS,989);assert.equal(saved.userOpeningEnabled,false);assert.equal(saved.readiness.totalPpm,1000000);
 assert.equal((await saveLimitedPack(f.env,f.user,body)).replayed,true);assert.deepEqual(await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first(),normalBefore);
});
