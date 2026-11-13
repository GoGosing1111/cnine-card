import assert from 'node:assert/strict';
import test from 'node:test';
import {bloodmoonCollectionMarkup,bloodmoonRoomMarkup,bloodmoonResultsMarkup} from '../js/mercenary-bloodmoon-presentation-v2.mjs';
import {bloodmoonBatchCinematics} from '../js/mercenary-bloodmoon-pack-live.mjs';
import {BLOODMOON_PACK} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';

test('the two pack skins expose the same ordered opening, confirmation, recovery and film controls',()=>{
 const actions=html=>[...html.matchAll(/<(?:button|input|select)\b[^>]*?\b(data-bwp-[\w-]+)(?:="([^"]*)")?/g)].map(match=>[match[1],match[2]]);
 const blood=bloodmoonRoomMarkup(BLOODMOON_PACK);
 const blue=bloodmoonRoomMarkup(BLUE_GEAR_PACK,{brand:'BLUE GEAR',roster:[],ownershipName:'블루기어',showRankRates:true});
 assert.deepEqual(actions(blue),actions(blood));
 assert.deepEqual(actions(blue).filter(([key])=>key==='data-bwp-buy').map(([,count])=>count),['1','10']);
 assert.deepEqual(actions(blue).filter(([key])=>key==='data-bwp-budget-preset').map(([,cap])=>cap),['10000000000','100000000000','1000000000000','10000000000000','50000000000000','100000000000000']);
 for(const panel of ['auto-panel','confirm','film','reveal','collection'])assert.match(blue,new RegExp('data-bwp-'+panel+'[ >]'));
 assert.match(blue,/data-bwp-auto-count><option value="1">1회씩<\/option><option value="10" selected>/);
});

test('the same results view aggregates Blue Gear receipts and selects an SS film before an SSS film',()=>{
 const [ss,sss]=[BLUE_GEAR_DRAW_POLICY.pool[0],BLUE_GEAR_DRAW_POLICY.pool.find(c=>c.rank==='SSS')];
 const row=(c,index)=>({outcomeId:'BLUE_GEAR_'+c.rank,mercenaryCode:c.code,name:c.name,rank:c.rank,quantity:1,drawIndex:index,serial:1});
 const receipt={status:'COMPLETED',packId:BLUE_GEAR_PACK.id,format:BLUE_GEAR_DRAW_POLICY.bulkFormat,requestId:'saved-bulk',count:100,draws:[row(ss,5),row(sss,40)],missCount:90,normalDraws:[{mercenaryCode:'V-001',name:'일반 용병',rank:'C',quantity:8}]};
 const results=blackcrownReceiptResults(receipt,BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY);
 const markup=bloodmoonResultsMarkup(results,BLUE_GEAR_PACK.image);
 assert.deepEqual(bloodmoonBatchCinematics(results).map(r=>r.mercenaryCode),[ss.code,sss.code]);
 assert.match(markup,/획득 없음 <b>90<\/b>/);
 assert.match(markup,/<td>일반 용병<\/td><td>8장<\/td>/);
 assert.equal((markup.match(/class="bwp-result is-limited"/g)||[]).length,2);
 const gallery=bloodmoonCollectionMarkup(BLUE_GEAR_DRAW_POLICY.pool,[],{},{edition:'블루기어',legendTitle:'SSS 리미티드',legendLabel:'각 3장'});
 assert.equal((gallery.match(/data-rank="SS"/g)||[]).length,5);
 assert.equal((gallery.match(/data-rank="SSS"/g)||[]).length,3);
});
