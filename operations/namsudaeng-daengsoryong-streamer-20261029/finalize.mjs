import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const folder='namsudaeng-daengsoryong-streamer-20261029';
const read=async file=>JSON.parse(await fs.readFile(new URL('./evidence/'+file,import.meta.url),'utf8'));
const apply=await read('apply.json'),dry=await read('dry-run.json'),verify=await read('verify.json'),snapshots=await read('commit-candidate-snapshots.json');
assert.equal(apply.replayed,false);assert.equal(apply.verification.status,'VERIFIED');
for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true);
assert.equal(apply.leasesReleased,true);assert.equal(verify.independentConnection,true);assert.equal(verify.noWriteReplayVerified,true);assert.deepEqual(apply.receipt,verify.receipt);
assert.equal(verify.currentPetCollection.pets['PET-DAENGSORYONG'],1);assert.equal(verify.currentInventory[0].quantity,'4');assert.equal(verify.currentInventory[0].unseen_quantity,'4');
assert(BigInt(verify.currentSync[0].domains.collection)>BigInt(snapshots.before.sync[0].domains.collection));
assert(BigInt(verify.currentSync[0].domains.inventory)>BigInt(snapshots.before.sync[0].domains.inventory));
const r=apply.receipt,completedAtKst=new Date(new Date(r.completedAt).getTime()+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const summary={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:r.operationKey,planHash:apply.planHash,sourceSha256:apply.sourceSha256,userId:r.userId,nickname:r.nickname,pet:{code:r.pet.code,name:r.pet.name,amount:1,before:r.pet.before,after:r.pet.after},boxes:{code:r.boxes.code,name:r.boxes.name,amount:4,before:r.boxes.before,after:r.boxes.after},auditId:r.auditId,petAuditId:r.pet.auditId,completedAt:r.completedAt,completedAtKst,verifiedAt:verify.checkedAt,testsPassed:4,testsFailed:0,leasesReleased:true,noWriteReplayVerified:true,automaticEquip:false,automaticOpen:false,gameRedeployed:false};
const body=`# 남수댕 댕소룡 펫·스트리머 선물 지급 — 2026-10-29

운영 지급 및 독립 조회 완료: **${completedAtKst}**, **남수댕 ID183**, 운영 감사 **${r.auditId}**, 펫 지급 감사 **${r.pet.auditId}**.

사용자 요청 “남수댕 계정에 댕소룡 지급하고 스트리머 선물 4개 지급해”와 후속 “펫이야 임마”에 따라 처리했다. 유사 닉네임 남수댕ㅗ ID5950과 구분하고, 검증 신원 해시를 지급 직전에 다시 확인했다.

| 항목 | 지급 | 지급 전 | 지급 직후·독립 조회 |
| --- | ---: | ---: | ---: |
| 댕소룡 펫 PET-DAENGSORYONG | 1마리 | 0 | 1 |
| 리버스콜 스트리머 선물 REVERSECALL_STREAMER_GIFT_BOX | 4개 | 0 | 4 |

펫 보유 revision 2→3, 기존 헤드셋 시바 1마리·장착·잠재력·코인/재화·다른 인벤토리·펫 CMS 설정을 보존했다. 펫 실전 활성 플래그를 바꾸지 않았다. 자동 장착·선물 개봉·메시지 발송·게임 재배포 없음. 수집/인벤토리 동기화 버전 증가 확인.

검증: 관련 거래 검사 4개 통과. 두 실시간 계정 잠금을 확보한 운영 실패 주입과 정상 예행연습 모두 원복 확인. 펫·선물·원장·감사·완료 영수증을 한 거래로 반영. 별도 READ ONLY 연결에서 실제 펫1·미개봉 선물4와 감사 일치를 확인했다. SELECT 전용 재실행은 추가 쓰기 0, 잠금 반환 확인.

완료 키: \`${r.operationKey}\`. 동일 요청을 다른 키로 재지급하거나 사용 후 수량을 복구하지 않는다. 앞선 깅더듬 스트리머 선물 지급은 별도 완료 요청이며 재실행하지 않았다.

증거: \`operations/${folder}/evidence/\`. 계획·실행 코드·관련 검사는 같은 운영 폴더에 보존한다. 첫 READ ONLY 사전 조회는 시간 초과 후 아이템 코드 조건을 포함한 조회로 재실행했고 쓰기는 없었다. 기존 폴더와 의존성을 재사용했으며 저장공간 유지관리·삭제·예약은 수행하지 않았다.
`;
await fs.writeFile(new URL('./completion.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
await fs.writeFile(new URL('./README.md',import.meta.url),body,{flag:'wx'});
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),body,{flag:'wx'});
console.log(JSON.stringify(summary));
