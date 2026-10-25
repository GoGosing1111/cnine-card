import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import source from '../../../scripts/ops/streamer-box-two-20261025.source.json' with {type:'json'};
import {REVERSECALL_STREAMER_GIFT as gift} from '../../../shared/reversecall-streamer-gift-v1.mjs';
const evidence=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(evidence.readOnly,true);assert.deepEqual(evidence.source.inputNicknames,source.inputNicknames);
assert.deepEqual(source.deferredInputs,['다방커피(겜닉필요)']);
const pending=evidence.matches.filter(m=>m.exact.length!==1);
assert.deepEqual(pending.map(m=>m.inputNickname),['다방커피(겜닉필요)']);
const targets=evidence.matches.filter(m=>m.exact.length===1).map(m=>{
 const u=m.exact[0];assert.equal(u.status,'ACTIVE');assert.equal(u.nickname,m.inputNickname);
 assert.match(u.identityHash,/^[a-f0-9]{64}$/);
 return {order:m.order,inputNickname:m.inputNickname,userId:u.id,nickname:u.nickname,role:u.role,identityHash:u.identityHash,amount:2};
});
assert.equal(targets.length,37);assert.equal(new Set(targets.map(t=>t.userId)).size,37);
const plan={operationKey:source.operationKey,authorization:source.authorization,itemCode:gift.code,itemName:gift.name,
 sourceCount:38,recipientCount:37,totalBoxes:74,identityCheckedAt:evidence.checkedAt,
 pending:[{order:13,inputNickname:'다방커피(겜닉필요)',reason:'사용자 요청으로 이번 지급 제외',amount:2}],targets};
fs.writeFileSync(new URL('../../../scripts/ops/streamer-box-two-20261025.plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({recipientCount:37,totalBoxes:74,pending:plan.pending,planHash:createHash('sha256').update(JSON.stringify(plan)).digest('hex')}));
