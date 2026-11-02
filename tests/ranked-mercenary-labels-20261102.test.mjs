import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedFixture} from './helpers/ranked-series-fixture.mjs';
import {readRankedRosters,saveRankedRoster,rankedTicketPreview} from '../functions/_ranked_series.js';
import {rankedPublicMercenary} from '../shared/ranked-series-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';

const codes=['V-951','V-996','V-960','V-970','V-980','V-003'];
const expected={'V-951':'블랙크라운 SS 리미티드','V-960':'블러드문 SS 리미티드','V-980':'할로윈 SS 리미티드'};
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} identical ranked names keep canonical collection labels through save and hidden-order preview`,async t=>{
 const f=await rankedFixture(t,postgres,{codes}),read=async id=>(await readRankedRosters(f.env,[id])).get(id);
 const initial=await read(1);
 for(const [code,label]of Object.entries(expected)){
  const card=initial.cards.find(c=>c.code===code);assert.equal(card.name,'나무늘봉순');assert.equal(card.rank,'SS');assert.equal(card.identityLabel,label);
  assert.deepEqual(Object.keys(card).sort(),['code','name','rank','sourceArt','battleSprite','identityLabel'].sort(),'private combat/stock metadata stays private');
 }
 for(const id of [1,2])await saveRankedRoster(f.env,{id},{codes:id===1?codes:[...codes].reverse(),revision:0});
 assert.deepEqual((await read(1)).codes,codes);
 const ticket=await f.createTicket(),preview=await rankedTicketPreview(f.env,ticket);
 assert.equal(preview.opponentOrderHidden,true);assert.deepEqual(preview.opponent.map(c=>c.code),[...codes].sort());
 for(const side of ['attacker','opponent'])for(const [code,label]of Object.entries(expected))assert.equal(preview[side].find(c=>c.code===code).identityLabel,label);
 for(const id of [1,2])assert.equal((await f.q('SELECT coin FROM users WHERE id=?',id).first()).coin,100);
});

test('canonical pack membership also labels SSS editions without name or numeric-range guesses',()=>{
 assert.equal(rankedPublicMercenary(limitedDeploymentSnapshot('V-970')).identityLabel,'블랙크라운 SSS 리미티드');
 assert.equal(rankedPublicMercenary(limitedDeploymentSnapshot('V-978')).identityLabel,'블러드문 SSS 리미티드');
 assert.equal(rankedPublicMercenary(limitedDeploymentSnapshot('V-996')).identityLabel,'SSS 리미티드');
 assert.equal(rankedPublicMercenary({code:'V-003',name:'일반 용병',rank:'S',title:'블러드문처럼 보이는 별명'}).identityLabel,'S');
});
