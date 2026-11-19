import test from 'node:test';import assert from 'node:assert/strict';
import {rankedFixture} from './helpers/ranked-series-fixture.mjs';
import {readRankedRosters,saveRankedRoster,rankedTicketPreview} from '../functions/_ranked_series.js';
import {rankedPublicMercenary} from '../shared/ranked-series-v1.mjs';
const owned=['V-059','V-701','V-976','V-702','V-967','V-703','V-704','V-705','V-044'];
const expected=Object.fromEntries(owned.slice(0,8).map(code=>[code,code==='V-059'?'블루기어 SSS':['V-976','V-967'].includes(code)?'블루기어 SSS 리미티드':'블루기어 SS 리미티드']));
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} Blue Gear names remain distinct from ordinary names through ranked selection, save and opponent preview`,async t=>{
 const f=await rankedFixture(t,postgres,{codes:owned,ranks:owned.map(code=>['V-059','V-976','V-967'].includes(code)?'SSS':'SS')}),initial=(await readRankedRosters(f.env,[1])).get(1);
 for(const [code,label]of Object.entries(expected)){const card=initial.cards.find(c=>c.code===code);assert(card,code);assert.equal(card.identityLabel,label);assert.deepEqual(Object.keys(card).sort(),['code','name','rank','sourceArt','battleSprite','identityLabel'].sort());}
 const ordinary=initial.cards.find(c=>c.code==='V-044'),blue=initial.cards.find(c=>c.code==='V-701');assert.equal(ordinary.name,blue.name);assert.equal(ordinary.identityLabel,'SS');assert.notEqual(ordinary.identityLabel,blue.identityLabel);
 for(const id of [1,2])await saveRankedRoster(f.env,{id},{codes:owned.slice(0,6),revision:0});
 const preview=await rankedTicketPreview(f.env,await f.createTicket());assert.equal(preview.opponentOrderHidden,true);assert.deepEqual(preview.opponent.map(c=>c.code),owned.slice(0,6).sort());
 for(const side of ['attacker','opponent'])for(const c of preview[side])assert.equal(c.identityLabel,expected[c.code]);
 const selected=(await readRankedRosters(f.env,[1])).get(1);assert.deepEqual(selected.codes,owned.slice(0,6));for(const id of [1,2])assert.equal((await f.q('SELECT coin FROM users WHERE id=?',id).first()).coin,100);
});
test('collection identity follows canonical membership and keeps unlimited Astra separate from limited editions',()=>{
 assert.equal(rankedPublicMercenary({code:'V-059',name:'아스트라',rank:'SSS',edition:'LIMITED'}).identityLabel,'블루기어 SSS');
 assert.equal(rankedPublicMercenary({code:'V-044',name:'하이희야',rank:'SS',season:'BLUE_GEAR',title:'블루기어'}).identityLabel,'SS');
 assert.equal(rankedPublicMercenary({code:'V-700',name:'블루기어 하이희야',rank:'SS'}).identityLabel,'SS');
});
