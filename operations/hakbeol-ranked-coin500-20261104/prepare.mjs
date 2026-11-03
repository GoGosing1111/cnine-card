import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),base='../cnine-streamer-box-named-20261103/';
const read=file=>fs.readFile(new URL(base+file,import.meta.url),'utf8'),write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
const change=(s,from,to)=>{assert(s.includes(from),from);return s.replaceAll(from,to);};
let grant=await read('grant.mjs');
grant=change(grant,'ops:cnine-streamer-box-named:20261103:v1',plan.operationKey);
grant=change(grant,'OPS_CNINE_STREAMER_BOX_NAMED_20261103','OPS_HAKBEOL_RANKED_COIN500_20261104');
grant=change(grant,'b937a340fde8e72af2314969c56da30d36b9ebe375915cb43dd4ac5c08b3c4db',hash(plan));
grant=change(grant,'CNINE_STREAMER_BOX','RANKED_COIN');
grant=change(grant,'씨나인 스트리머 박스 명단 지급 · 309개 7박스 / 209개 5박스 / 109개 2박스 · 쟁이 7개만','학벌 랭크전 코인 500개 운영자 지정 지급');
const start=grant.indexOf('export function validate(){'),end=grant.indexOf('export async function snapshot',start);assert(start>=0&&end>start);
grant=grant.slice(0,start)+`export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(hash(source),PLAN.sourceHash);assert.equal(PLAN.operationKey,OP);assert.equal(source.operationKey,OP);assert.equal(PLAN.itemCode,ITEM_CODE);assert.equal(source.itemCode,ITEM_CODE);assert.equal(PLAN.itemName,'랭크전 코인');
 assert.equal(PLAN.delivery,'DIRECT_INVENTORY');assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.changeRankingOrSeason,false);assert.equal(PLAN.recipientCount,1);assert.equal(PLAN.totalAmount,500);assert.equal(source.amount,500);assert.equal(source.authorization,'학벌 계정에 랭크전 코인 500개 지급해');
 assert.equal(PLAN.recipients.length,1);assert.deepEqual(IDS,['4627']);const t=PLAN.recipients[0];assert.equal(t.nickname,'학벌');assert.equal(t.inputNickname,'학벌');assert.equal(t.amount,500);assert.equal(t.status,'ACTIVE');assert.match(t.identityHash,/^[a-f0-9]{64}$/);
}
`+grant.slice(end);
grant=grant.replace(/\b37\b/g,'1').replace(/\b222\b/g,'500').replaceAll('totalBoxes','totalAmount');
grant=change(grant,'groupCounts:PLAN.groupCounts,','');grant=change(grant,'assert.equal(g.marker,t.marker);','');grant=change(grant,'marker:t.marker,','');grant=change(grant,',automaticOpening:false','');
await write('grant.mjs',grant);
for(const file of ['locks.mjs','lock-worker.mjs','wrangler.jsonc','run.mjs','test-run.mjs','.gitignore']){
 let s=await read(file);s=s.replaceAll('cnine-streamer-box-named-20261103','hakbeol-ranked-coin500-20261104').replaceAll("'cnine-streamer-box-named-'","'hakbeol-ranked-coin500-'").replace('our 37 exact lock rows','our exact account lock row').replaceAll('box grant','ranked coin grant').replaceAll('totalBoxes','totalAmount');await write(file,s);
}
let test=await read('grant.test.mjs');
test=change(test,'37 recipients receive exactly 222 new CNINE boxes; duplicate 쟁이 receives 7 once; balances and other inventories remain intact','Hakbeol receives exactly 500 ranked coins once; ordinary currency and unrelated inventory remain intact');
test=test.replaceAll('CNINE_STREAMER_BOX','RANKED_COIN').replaceAll('totalBoxes','totalAmount').replace(/\b37\b/g,'1').replace(/\b222\b/g,'500');
test=test.replaceAll("g.userId==='4705'","g.userId==='4627'").replace('.amount,7)', '.amount,500)').replace('[[7,23],[5,11],[2,3]]','[[500,1]]');
test=test.replaceAll('4598','4627').replaceAll('4705','4627').replaceAll('4562','4627').replaceAll('˚쟁이。','학벌');
test=test.replace('ADD CONSTRAINT fail_write CHECK(false)','ADD CONSTRAINT fail_write CHECK(false) NOT VALID');
await write('grant.test.mjs',test);console.log(JSON.stringify({prepared:true,userId:'4627',itemCode:'RANKED_COIN',amount:500,planHash:hash(plan)}));
