import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import source from './source.json' with {type:'json'};
import preflight from './preflight.json' with {type:'json'};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const folder='reversecall-streamer-box-100to5-20261105';
const expectedIds=['4391','3011','290','4651','88','4570','4627','289','2420','4981','4866','164','76','4644','360','4610','5008','1255','5362','295','4415','525','4597','1768','62','4595','4582','1195','4643','22','4572','81'];
assert(!preflight.prior.some(p=>p.key===source.operationKey));assert(!preflight.audits.some(p=>p.target_id===source.operationKey));
const recipients=preflight.matches.map((m,index)=>{
 assert.equal(m.candidates.length,1);const u=m.candidates[0];assert.equal(u.id,expectedIds[index]);assert.equal(u.nickname,m.inputNickname);assert.equal(u.status,'ACTIVE');assert(u.identityHash);
 return {order:index+1,inputNickname:m.inputNickname,marker:m.marker,amount:Math.floor(m.marker/100)*5,userId:u.id,nickname:u.nickname,status:u.status,role:u.role,identityHash:u.identityHash};
});
assert.equal(recipients.length,32);assert.equal(new Set(recipients.map(t=>t.userId)).size,32);assert.equal(new Set(recipients.map(t=>t.identityHash)).size,32);assert.equal(recipients.reduce((n,t)=>n+t.amount,0),565);
assert.equal(preflight.item.length,1);const item=preflight.item[0];assert.equal(item.code,source.itemCode);assert.equal(item.name,'리버스콜 스트리머 선물');assert.equal(Number(item.is_active),1);
const plan={operationKey:source.operationKey,dateKst:source.dateKst,authorization:source.authorization,calculation:source.calculation,rounding:source.rounding,sourceHash:hash(source),itemCode:item.code,itemName:item.name,itemDescription:item.description,delivery:'DIRECT_INVENTORY',sendMessages:false,autoOpen:false,recipientCount:32,totalBoxes:565,groupCounts:{'25':19,'20':1,'10':2,'5':10},markerCounts:{'509':19,'400':1,'209':2,'109':6,'100':4},aliases:{},identityCheckedAt:preflight.checkedAt,logFloor:preflight.floors,recipients};
const write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
await write('plan.json',JSON.stringify(plan,null,2)+'\n');await write('plan-hash.json',JSON.stringify({sha256:hash(plan)})+'\n');
const read=file=>fs.readFile(new URL('../cnine-streamer-box-named-20261103/'+file,import.meta.url),'utf8');
const replace=(text,from,to)=>{assert(text.includes(from),from);return text.replaceAll(from,to);};
let grant=await read('grant.mjs');
grant=replace(grant,'ops:cnine-streamer-box-named:20261103:v1',source.operationKey);
grant=replace(grant,'OPS_CNINE_STREAMER_BOX_NAMED_20261103','OPS_REVERSECALL_STREAMER_BOX_100TO5_20261105');
grant=replace(grant,"ITEM_CODE='CNINE_STREAMER_BOX'","ITEM_CODE='REVERSECALL_STREAMER_GIFT_BOX'");
grant=replace(grant,'b937a340fde8e72af2314969c56da30d36b9ebe375915cb43dd4ac5c08b3c4db',hash(plan));
grant=replace(grant,'씨나인 스트리머 박스 명단 지급 · 309개 7박스 / 209개 5박스 / 109개 2박스 · 쟁이 7개만','리버스콜 스트리머 박스 명단 지급 · 100개당 5박스 · 100개 미만 나머지 제외');
grant=grant.replace(/\b37\b/g,'32').replace(/\b222\b/g,'565');
const start=grant.indexOf('export function validate(){'),end=grant.indexOf('export async function snapshot');assert(start>0&&end>start);
const validate=`export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(hash(source),PLAN.sourceHash);assert.equal(PLAN.operationKey,OP);assert.equal(source.operationKey,OP);assert.equal(PLAN.itemCode,ITEM_CODE);assert.equal(source.itemCode,ITEM_CODE);assert.equal(PLAN.itemName,'리버스콜 스트리머 선물');
 assert.equal(PLAN.delivery,'DIRECT_INVENTORY');assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.autoOpen,false);assert.equal(PLAN.calculation,'floor(marker / 100) * 5');assert.equal(PLAN.rounding,'100개 미만 나머지 제외');assert.equal(PLAN.recipientCount,32);assert.equal(PLAN.totalBoxes,565);
 assert.equal(PLAN.recipients.length,32);assert.equal(source.recipients.length,32);assert.equal(new Set(IDS).size,32);assert.equal(new Set(PLAN.recipients.map(t=>t.identityHash)).size,32);assert.equal(new Set(source.recipients.map(t=>t.inputNickname)).size,32);assert.equal(PLAN.recipients.reduce((n,t)=>n+t.amount,0),565);
 const ids=${JSON.stringify(expectedIds)};assert.deepEqual(PLAN.recipients.map(t=>t.userId),ids);
 for(let i=0;i<source.recipients.length;i++){const t=PLAN.recipients[i],e=source.recipients[i];assert.equal(t.order,i+1);for(const key of ['inputNickname','marker'])assert.equal(t[key],e[key]);assert.equal(t.nickname,e.inputNickname);assert.equal(t.status,'ACTIVE');assert.match(t.identityHash,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(t.marker)&&t.marker>=100);assert.equal(t.amount,Math.floor(t.marker/100)*5);}
 for(const [amount,count] of [[25,19],[20,1],[10,2],[5,10]])assert.equal(PLAN.recipients.filter(t=>t.amount===amount).length,count);
 for(const [marker,count] of [[509,19],[400,1],[209,2],[109,6],[100,4]])assert.equal(PLAN.recipients.filter(t=>t.marker===marker).length,count);
 assert.equal(one(PLAN.recipients.filter(t=>t.inputNickname==='찬호')).amount,20);
}
`;
grant=grant.slice(0,start)+validate+grant.slice(end);await write('grant.mjs',grant);
for(const file of ['run.mjs','locks.mjs','lock-worker.mjs','wrangler.jsonc','test-run.mjs']){
 let text=await read(file);text=text.replaceAll('cnine-streamer-box-named-20261103',folder).replaceAll('cnine-streamer-box-named-','reversecall-streamer-box-100to5-').replace('our 37 exact lock rows','our 32 exact lock rows');await write(file,text);
}
let independent=await read('independent.mjs');
independent=replace(independent,"code='CNINE_STREAMER_BOX'","code='REVERSECALL_STREAMER_GIFT_BOX'");
independent=replace(independent,'OPS_CNINE_STREAMER_BOX_NAMED_20261103','OPS_REVERSECALL_STREAMER_BOX_100TO5_20261105');
independent=replace(independent,'cnine-streamer-box-independent-readonly','reversecall-box-100to5-independent-readonly');
independent=independent.replace(/\b37\b/g,'32').replace(/\b222\b/g,'565');
independent=replace(independent,"assert.equal(one(recipients.filter(t=>t.inputNickname==='쟁이')).amount,7);for(const [amount,count] of [[7,23],[5,11],[2,3]])","assert.equal(one(recipients.filter(t=>t.inputNickname==='찬호')).amount,20);for(const [amount,count] of [[25,19],[20,1],[10,2],[5,10]])");
await write('independent.mjs',independent);
console.log(JSON.stringify({planHash:hash(plan),recipients:32,totalBoxes:565,groupCounts:plan.groupCounts,markerCounts:plan.markerCounts}));
