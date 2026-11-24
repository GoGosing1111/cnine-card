import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';import vm from 'node:vm';
import {bloodmoonCollectionMarkup,bloodmoonRoomMarkup,bloodmoonResultsMarkup} from '../js/mercenary-bloodmoon-presentation-v2.mjs';
import {bloodmoonBatchCinematics} from '../js/mercenary-bloodmoon-pack-live.mjs';
import {BLOODMOON_PACK} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';

test('both shipped shop shells render Astra from the Blue Gear roster and retain Razak in Bloodmoon',()=>{
 for(const file of ['js/app.js','onestore/js/app.js']){
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),start=source.indexOf('function bloodmoonPackHero(pack) {'),end=source.indexOf('\n}',start)+2,context={escapeHtml:String,loadBlueGearShopStyle(){},bloodmoonShopStockText:c=>c.stockPolicy==='UNLIMITED'?'발행 한도 없음':'한정',packResponsiveImage:()=>''};
  vm.runInNewContext(source.slice(start,end)+';this.render=bloodmoonPackHero;',context);
  const markup=context.render({...BLUE_GEAR_PACK,previewCards:BLUE_GEAR_DRAW_POLICY.pool});assert.match(markup,/아스트라/);assert.match(markup,/data-code="V-059"/);assert.doesNotMatch(markup,/라자크|V-058/);
  const legacy=context.render({...BLOODMOON_PACK,previewCards:[{code:'V-058',name:'라자크',rank:'SSS',stockPolicy:'UNLIMITED',thumbnailArt:'razak.webp'}]});assert.match(legacy,/라자크/);assert.doesNotMatch(legacy,/아스트라/);
 }
});

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

test('Blue Gear shows both results and selects the SSS film',()=>{
 const [ss,sss]=[BLUE_GEAR_DRAW_POLICY.pool[0],BLUE_GEAR_DRAW_POLICY.pool.find(c=>c.rank==='SSS')];
 const row=(c,index)=>({outcomeId:'BLUE_GEAR_'+c.rank,mercenaryCode:c.code,name:c.name,rank:c.rank,quantity:1,drawIndex:index,serial:1});
 const receipt={status:'COMPLETED',packId:BLUE_GEAR_PACK.id,format:BLUE_GEAR_DRAW_POLICY.bulkFormat,requestId:'saved-bulk',count:100,draws:[row(ss,5),row(sss,40)],missCount:90,normalDraws:[{mercenaryCode:'V-001',name:'일반 용병',rank:'C',quantity:8}]};
 const results=blackcrownReceiptResults(receipt,BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY);
 const markup=bloodmoonResultsMarkup(results,BLUE_GEAR_PACK.image);
 assert.deepEqual(bloodmoonBatchCinematics(results).map(r=>r.mercenaryCode),[sss.code]);
 assert.match(markup,/획득 없음 <b>90<\/b>/);
 assert.match(markup,/<td>일반 용병<\/td><td>8장<\/td>/);
 assert.equal((markup.match(/class="bwp-result is-limited"/g)||[]).length,2);
 const gallery=bloodmoonCollectionMarkup(BLUE_GEAR_DRAW_POLICY.pool,[],{},{edition:'블루기어',legendTitle:'SSS 리미티드',legendLabel:'각 3장'});
 assert.equal((gallery.match(/data-rank="SS"/g)||[]).length,5);
 assert.equal((gallery.match(/data-rank="SSS"/g)||[]).length,3);
});
