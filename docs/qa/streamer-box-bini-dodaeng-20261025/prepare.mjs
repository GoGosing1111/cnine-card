import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import source from '../../../scripts/ops/streamer-box-bini-dodaeng-20261025.source.json' with {type:'json'};
import {REVERSECALL_STREAMER_GIFT as gift} from '../../../shared/reversecall-streamer-gift-v1.mjs';
const evidence=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(evidence.readOnly,true);assert.deepEqual(evidence.source,source);assert.equal(evidence.prior.length,0);
const targets=evidence.matches.map(m=>{
 assert.equal(m.exact.length,1);const u=m.exact[0];assert.equal(u.status,'ACTIVE');assert.equal(u.nickname,m.inputNickname);assert.match(u.identityHash,/^[a-f0-9]{64}$/);
 return {order:m.order,inputNickname:m.inputNickname,userId:u.id,nickname:u.nickname,role:u.role,identityHash:u.identityHash,delta:m.order===1?-2:2};
});
assert.deepEqual(targets.map(t=>[t.nickname,t.userId,t.delta]),[['비니','4595',-2],['도댕','4235',2]]);
assert(BigInt(evidence.inventory.find(r=>r.user_id==='4595')?.quantity??0)>=2n);
const plan={operationKey:source.operationKey,authorization:source.authorization,itemCode:gift.code,itemName:gift.name,fromUserId:'4595',toUserId:'4235',amount:2,identityCheckedAt:evidence.checkedAt,targets};
const current='streamer-box-bini-dodaeng-20261025',old='streamer-box-two-20261025';
const write=(name,text)=>fs.writeFileSync(new URL(name,import.meta.url),text,{flag:'wx'});
write('../../../scripts/ops/'+current+'.plan.json',JSON.stringify(plan,null,2)+'\n');
for(const file of ['run.mjs','lock-worker.mjs','wrangler.jsonc'])write(file,fs.readFileSync(new URL('../'+old+'/'+file,import.meta.url),'utf8').replaceAll(old,current));
console.log(JSON.stringify({from:'비니',to:'도댕',amount:2,planHash:createHash('sha256').update(JSON.stringify(plan)).digest('hex')}));
