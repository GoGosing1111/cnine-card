import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCardChances,mercenaryGradePools,suggestedMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
import {withKangyunRerollDefault,sssRerollOdds,sssRerollReadiness,pickSssReroll} from '../shared/mercenary-sss-reroll-v1.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {SSS_REROLL_KEY,ensureSssRerollCatalog,sssRerollState,executeSssReroll} from '../functions/_mercenary_sss_reroll.js';
const K='V-057',weights={'V-021':100,'V-046':30,'V-049':20,'V-055':10,'V-056':10},rules={cardWeights:weights};
const rows=seed.document.mercenaries.map(c=>({...c,rank:c.rank||'C'})),codes=seed.catalog.cards.map(c=>c.code),pool=mercenaryGradePools(rows,codes,rules).SSS;
const catalog=pool.map(code=>({code,name:code,rank:'SSS',limited:false,available:true,sourceArt:'/art.png'}));
const old={format:'MERCENARY_SSS_REROLL_V1',mode:'ON',notes:'preserved',cards:{'V-021':60e6,'V-046':20e6,'V-049':10e6,'V-055':5e6,'V-056':5e6}};
test('hyper and limited ordinary SSS share exactly 1%; old ratios and grade probabilities survive',()=>{
 const before=structuredClone(rules),odds=mercenaryCardChances(25,pool,rules),k=odds.find(c=>c.code===K);
 assert.equal(k.withinRankPercent,1);assert.equal(k.percent,.000025);assert.equal(k.totalWeight,1700);
 for(const c of odds.filter(c=>c.code!==K))assert.ok(Math.abs(c.withinRankPercent-99*weights[c.code]/170)<1e-12);
 const limited=limitedNormalCards(rows,seed.catalog.cards,rules).filter(c=>c.rank==='SSS');
 assert.equal(limited.find(c=>c.code===K).weight/limited.reduce((n,c)=>n+c.weight,0),.01);assert.deepEqual(rules,before);
 const policy=suggestedMercenaryDraw();policy.cardRules.cardWeights=weights;for(const r of policy.outcomes)r.chancePpm=r.id==='CARD_SSS'?25:r.id==='NONE'?999975:0;
 const draws=[1682,1683,1699].map(ticket=>pickMercenaryDraw({policy,mercenaries:rows,randomInt:max=>max===1e6?0:ticket}));
 assert.notEqual(draws[0].mercenaryCode,K);assert.equal(draws[1].mercenaryCode,K);assert.equal(draws[2].mercenaryCode,K);
 assert.equal(pickMercenaryDraw({policy,mercenaries:rows,randomInt:()=>25}).outcomeId,'NONE');
});
test('explicit CMS OFF and later weight overrides remain authoritative',()=>{
 assert.equal(mercenaryCardChances(1e6,pool,{cardWeights:{...weights,[K]:0}}).find(c=>c.code===K).weight,0);
 assert.ok(!mercenaryGradePools(rows,codes,{cardWeights:{...weights,[K]:0}}).SSS.includes(K));
 assert.equal(mercenaryCardChances(1e6,pool,{cardWeights:{...weights,[K]:10}}).find(c=>c.code===K).weight,10);
 for(const code of pool.filter(c=>c!==K)){const odds=mercenaryCardChances(1e6,pool,{cardWeights:{...weights,[code]:0}});assert.equal(odds.find(c=>c.code===K).withinRankPercent,1);assert.equal(odds.find(c=>c.code===code).weight,0);}
});
test('reroll registration preserves mode/notes/old ratios and source exclusion never inflates Kangyun',()=>{
 const saved=structuredClone(old),policy=withKangyunRerollDefault(old,catalog);assert.deepEqual(old,saved);assert.equal(policy.cards[K],1e6);assert.equal(policy.mode,old.mode);assert.equal(policy.notes,old.notes);
 assert.equal(sssRerollReadiness(policy,catalog).ready,true);
 for(const code of pool.filter(c=>c!==K)){
  const odds=sssRerollOdds(policy,catalog,code);assert.equal(odds.find(c=>c.code===K).percent,1);assert.ok(!odds.some(c=>c.code===code));assert.equal(odds.reduce((n,c)=>n+c.units,0),1e8);
  assert.notEqual(pickSssReroll(policy,catalog,code,()=>98_999_999).mercenaryCode,K);assert.equal(pickSssReroll(policy,catalog,code,()=>99_000_000).mercenaryCode,K);assert.equal(pickSssReroll(policy,catalog,code,()=>99_999_999).mercenaryCode,K);
 }
 assert.ok(!sssRerollOdds(policy,catalog,K).some(c=>c.code===K));
 assert.equal(withKangyunRerollDefault({...old,cards:{...old.cards,[K]:0}},catalog).cards[K],0);
 assert.equal(withKangyunRerollDefault({...old,mode:'OFF'},catalog).mode,'OFF');
 assert.equal(withKangyunRerollDefault({...old,cards:{}},catalog).cards[K],undefined);
 assert.equal(sssRerollReadiness({...policy,cards:{'V-021':99e6,[K]:1e6}},catalog).ready,false);
});
for(const postgres of [false,true])test(`reroll live default grants Kangyun once and preserves stored policy (${postgres?'PostgreSQL':'SQLite'})`,async t=>{
 const f=await mercenaryFixture(t,{postgres});await ensureSssRerollCatalog(f.env);await f.setting(SSS_REROLL_KEY,{revision:7,policy:old});
 await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,2,2)','MERCENARY_SSS_REROLL_TICKET').run();
 await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)','V-021').run();
 const state=await sssRerollState(f.env,f.user);assert.equal(state.policy.cards[K],1e6);assert.equal(state.revision,7);assert.equal(state.openingEnabled,true);
 const input={requestId:crypto.randomUUID(),sourceCode:'V-021'};let calls=0;
 const result=await executeSssReroll(f.env,f.user,input,{randomInt:n=>{calls++;assert.equal(n,1e8);return n-1;}});
 assert.equal(result.result.mercenaryCode,K);assert.equal(result.result.percent,1);assert.equal(result.balance,1);
 assert.equal((await executeSssReroll(f.env,f.user,input,{randomInt:()=>{throw Error('double draw');}})).replayed,true);assert.equal(calls,1);
 assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',SSS_REROLL_KEY).first()).value).policy,old);
});
