import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import source from '../../../scripts/ops/streamer-box-sunggurik-two-20261025.source.json' with {type:'json'};
import {REVERSECALL_STREAMER_GIFT as gift} from '../../../shared/reversecall-streamer-gift-v1.mjs';
const evidence=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(evidence.readOnly,true);assert.deepEqual(evidence.source,source);assert.equal(evidence.prior.length,0);
const targets=evidence.matches.map(m=>{
 assert.equal(m.exact.length,1);const u=m.exact[0];assert.equal(u.status,'ACTIVE');assert.equal(u.nickname,m.inputNickname);assert.match(u.identityHash,/^[a-f0-9]{64}$/);
 return {order:m.order,inputNickname:m.inputNickname,userId:u.id,nickname:u.nickname,role:u.role,identityHash:u.identityHash,amount:2};
});
assert.deepEqual(targets.map(t=>[t.nickname,t.userId]),[['숭구릭','62']]);
const plan={operationKey:source.operationKey,authorization:source.authorization,itemCode:gift.code,itemName:gift.name,sourceCount:1,recipientCount:1,totalBoxes:2,identityCheckedAt:evidence.checkedAt,pending:[],targets};
const old='streamer-box-two-20261025',current='streamer-box-sunggurik-two-20261025';
const write=(name,text)=>fs.writeFileSync(new URL(name,import.meta.url),text,{flag:'wx'});
write('../../../scripts/ops/'+current+'.plan.json',JSON.stringify(plan,null,2)+'\n');
let code=fs.readFileSync(new URL('../../../scripts/ops/'+old+'.mjs',import.meta.url),'utf8').replaceAll(old,current)
 .replaceAll('ops:streamer-box-two:20261025:v1',source.operationKey).replaceAll('OPS_STREAMER_BOX_TWO_GRANT','OPS_STREAMER_BOX_SUNGGURIK_GRANT')
 .replace('사용자 지정 명단 리버스콜 스트리머 박스 각 2개 지급 · 20261025','추가 명단 숭구릭 리버스콜 스트리머 박스 2개 지급 · 20261025').replace(/\b37\b/g,'1').replace(/\b74\b/g,'2');
const start=code.indexOf('function validate(expected){'),end=code.indexOf('export async function inspect(db){');assert(start>=0&&end>start);
code=code.slice(0,start)+`function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(plan),PLAN_HASH);
 assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(source.operationKey,OPERATION_KEY);assert.equal(plan.itemCode,ITEM_CODE);assert.equal(plan.itemName,gift.name);
 assert.deepEqual(source.inputNicknames,['숭구릭']);assert.equal(source.amountEach,2);assert.equal(TARGETS.length,1);assert.equal(new Set(IDS).size,1);
 assert.equal(TARGETS.reduce((n,t)=>n+t.amount,0),2);assert.equal(plan.recipientCount,1);assert.equal(plan.totalBoxes,2);assert.deepEqual(plan.pending,[]);
 assert.deepEqual(TARGETS.map(t=>[t.nickname,t.userId]),[['숭구릭','62']]);assert.deepEqual(TARGETS.map(t=>t.order),[1]);
 for(const t of TARGETS){
  assert.equal(source.inputNicknames[t.order-1],t.inputNickname);assert.equal(t.inputNickname,t.nickname);assert.equal(t.amount,2);
  assert.match(t.userId,/^[1-9]\\d*$/);assert.match(t.identityHash,/^[a-f0-9]{64}$/);
 }
}

`+code.slice(end);
assert(!code.includes('37'));assert(!code.includes('74'));assert(!code.includes('다방커피'));
write('../../../scripts/ops/'+current+'.mjs',code);
for(const file of ['run.mjs','lock-worker.mjs','wrangler.jsonc'])write(file,fs.readFileSync(new URL('../'+old+'/'+file,import.meta.url),'utf8').replaceAll(old,current));
console.log(JSON.stringify({recipientCount:1,totalBoxes:2,planHash:createHash('sha256').update(JSON.stringify(plan)).digest('hex')}));
