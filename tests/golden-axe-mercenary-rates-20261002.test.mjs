import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {goldenAxeAdmin} from '../functions/_golden_axe.js';
import {AXE_KEY,AXE_REWARDS,pickAxeReward,cleanAxeSettings} from '../js/golden-axe-model-v1.js';
test('0.1% prize rate survives CMS save, DB read and exact 999/1000 draw boundary',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.configure('H_BODY',{rates:Object.fromEntries(AXE_REWARDS.map(r=>[r.key,r.key==='H_BODY'?.1:r.key==='MISS'?99.9:0]))});
 const admin=await goldenAxeAdmin(f.env,{id:99});assert.equal(admin.settings.rates.H_BODY,.1);assert.equal(JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=$1',[AXE_KEY])).value).rates.H_BODY,.1);
 assert.equal(pickAxeReward(admin.settings,999).key,'H_BODY');assert.equal(pickAxeReward(admin.settings,1000).key,'MISS');
 assert.equal((await f.draw(await f.body(),1,999)).reward.key,'H_BODY');assert.equal((await f.draw(await f.body(),1,1000)).kind,'MISS');assert.equal((await f.state()).axes,8);
});
test('SS and SSS use event-local per-mercenary rates, honor eligibility, and grant exactly once',async t=>{
 const f=await fixture();t.after(()=>f.close());const [a,b]=f.doc.mercenaries;
 for(const rank of ['SS','SSS']){
  a.rank=rank;b.rank=rank;await f.pg.query("UPDATE mercenary_cms_documents_v1 SET payload_json=$1 WHERE doc_key='config'",[JSON.stringify(f.doc)]);
  await f.configure('MERCENARY_'+rank,{mercenaryRates:{[rank]:{[a.code]:.1,[b.code]:99.9}}});
  const saved=await goldenAxeAdmin(f.env,{id:99});assert.equal(saved.settings.mercenaryRates[rank][a.code],.1);
  const firstBody=await f.body(),first=await f.draw(firstBody,1,999),second=await f.draw(await f.body(),1,1000);assert.equal(first.reward.code,a.code);assert.equal(first.reward.rank,rank);assert.equal(second.reward.code,b.code);assert.equal((await f.draw(firstBody)).replayed,true);
 }
 assert.equal((await f.state()).axes,6);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1')).n),4);
 const body=await f.body();await f.pg.query('INSERT INTO mercenary_draw_config_v1(id,payload_json) VALUES(1,$1)',[JSON.stringify({cardRules:{cardWeights:{[a.code]:0}}})]);
 await assert.rejects(f.draw(body),e=>e.code==='REWARD_UNAVAILABLE');assert.equal((await f.state()).axes,6);
 const admin=await goldenAxeAdmin(f.env,{id:99});await assert.rejects(goldenAxeAdmin(f.env,{id:99},{...admin.settings,revision:admin.revision}),e=>e.code==='MERCENARY_POOL_INVALID');
});
test('no invented SS/SSS rates; invalid percentages and retired candidates are rejected',()=>{
 const empty=cleanAxeSettings();assert.equal(empty.rates.MERCENARY_SS,0);assert.equal(empty.rates.MERCENARY_SSS,0);
 for(const rates of [{SS:{'V-001':99.9}},{SS:{'V-001':100.1}},{SS:{'V-001':.00001,'V-002':99.99999}},{SS:{'unknown':100}}])assert.throws(()=>cleanAxeSettings({mercenaryRates:rates}));
});
test('public event shows prizes only and does not publish CMS percentages',async t=>{
 const f=await fixture();t.after(()=>f.close());const state=await f.state();assert(!Object.hasOwn(state,'rates'));assert(!Object.hasOwn(state,'mercenaryRates'));assert(state.rewards.every(r=>!Object.hasOwn(r,'rate')));
 const page=readFileSync(new URL('../js/golden-axe-page-v1.js',import.meta.url),'utf8');for(const text of ['axeRates','axeSelectedRate','openRates','상품별 확률 보기','등장확률'])assert(!page.includes(text));assert(page.includes("state?.rewards||(preview?AXE_REWARDS:[])"));
 const admin=readFileSync(new URL('../admin/golden-axe-v1.js',import.meta.url),'utf8');assert(admin.includes('step="0.0001"'));assert(admin.includes('최종 획득확률 = 등급 상품 확률 × 등급 내 용병 확률 ÷ 100'));
});
