import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import source from './source.json' with {type:'json'};
import preflight from './preflight.json' with {type:'json'};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const expectedIds=['233','4391','360','4981','4415','4582','4774','289','4598','4235','1768','4705','5008','1255','5362','290','88','5877','4572','4651','4610','218','5958','4597','4627','2420','164','183','1195','4562','4595','525','1545','3011','22','19','4570'];
const aliases={'쟁이':'˚쟁이。','찡찡':'찡찡ෆ'};
assert(!preflight.prior.some(p=>p.key===source.operationKey));assert(!preflight.audits.some(p=>p.target_id===source.operationKey));
const recipients=preflight.matches.map((m,index)=>{
 const name=aliases[m.inputNickname]||m.inputNickname,candidates=[...m.candidates,...m.nearby].filter(u=>u.nickname===name),u=candidates[0];assert(u);assert.equal(new Set(candidates.map(x=>x.id)).size,1);assert.equal(u.id,expectedIds[index]);assert.equal(u.status,'ACTIVE');assert(u.identityHash);
 return {order:index+1,inputNickname:m.inputNickname,marker:m.marker,amount:m.amount,userId:u.id,nickname:u.nickname,status:u.status,role:u.role,identityHash:u.identityHash};
});
assert.equal(recipients.length,37);assert.equal(new Set(recipients.map(t=>t.userId)).size,37);assert.equal(new Set(recipients.map(t=>t.identityHash)).size,37);assert.equal(recipients.reduce((n,t)=>n+t.amount,0),222);
assert.equal(preflight.item.length,1);const item=preflight.item[0];assert.equal(item.code,'CNINE_STREAMER_BOX');assert.equal(item.name,'씨나인 스트리머 박스');assert.equal(Number(item.is_active),1);
const plan={operationKey:source.operationKey,dateKst:'2026-11-03',authorization:source.authorization,clarification:source.clarification,sourceHash:hash(source),itemCode:item.code,itemName:item.name,itemDescription:item.description,delivery:'DIRECT_INVENTORY',sendMessages:false,autoOpen:false,recipientCount:37,totalBoxes:222,groupCounts:{'7':23,'5':11,'2':3},aliases,identityCheckedAt:preflight.checkedAt,logFloor:preflight.floors,recipients};
const write=(file,data)=>fs.writeFile(new URL(file,import.meta.url),data,{flag:'wx'});
await write('plan.json',JSON.stringify(plan,null,2)+'\n');await write('plan-hash.json',JSON.stringify({sha256:hash(plan)})+'\n');
for(const file of ['locks.mjs','lock-worker.mjs','wrangler.jsonc']){
 let text=await fs.readFile(new URL('../playdk-1441569-comment-coin500t-20261103/'+file,import.meta.url),'utf8');text=text.replaceAll('playdk-1441569-comment-coin500t-20261103','cnine-streamer-box-named-20261103');await write(file,text);
}
await write('.gitignore','evidence/\npreflight.json\ntests.log\ntest-fixture-*/\n.wrangler/\n');
console.log(JSON.stringify({planHash:hash(plan),recipients:37,totalBoxes:222,aliases}));
