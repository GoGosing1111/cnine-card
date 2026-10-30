import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const applied=await read('./evidence/apply.json'),dry=await read('./evidence/dry-run.json'),independent=await read('./independent.json'),r=applied.receipt;
assert.equal(r.status,'COMPLETED');assert.equal(applied.replayed,false);assert.equal(applied.leasesReleased,true);assert.equal(dry.rollbackVerified,true);assert.equal(dry.injectedFailureRollback,true);assert.equal(dry.noWriteReplayVerified,true);assert.equal(independent.readOnly,'on');assert.equal(independent.items.length,5);assert.equal(independent.selectOnlyReplayVerified,true);assert.equal(independent.operationLocksRemaining,0);assert.equal(r.auditId,independent.auditId);
const completedAtKst=new Date(Date.parse(r.completedAt)+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const result={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:r.operationKey,completedAt:r.completedAt,completedAtKst,userId:'65',nickname:'음순이',tier:8,setName:'심연성좌',totalQuantity:5,grants:r.grants,auditId:r.auditId,planHash:r.planHash,sourceSha256:applied.sourceSha256,testsPassed:4,productionFailureAndSuccessRollbackVerified:true,actualMercenaryInventoryVerified:true,selectOnlyReplayVerified:true,locksReleased:true,automaticLoadout:false,messagesSent:0,gameDeployment:false,preserved:r.preserved};
const folder='eumsooni-abyss-equipment-20261030';
const text=`# 음순이 8단계 심연성좌 용병장비 지급 — 2026-10-30

운영 지급 완료: **${completedAtKst} · 감사 ${r.auditId}**.

사용자 최초 성휘대천사 요청 후 **“8단계: 심연성좌 / 이거로 지급해라”** 정정을 적용해, **음순이 ID65**에 아래 용병장비를 각각 1개씩 직접 지급했다. 기존 신원 해시 일치와 부위별 실제 보유/집계 모두 확인했다.

| 부위 | 장비 코드 | 수량 전→후 | 지급 인스턴스 |
| --- | --- | --- | --- |
${r.grants.map(g=>`| ${g.name} | ${g.code} | ${g.quantityBefore}→${g.quantityAfter} | ${g.instanceId} |`).join('\n')}

총 5개, 기본 강화 +0. 자동 장착은 하지 않았고, 기존 장비·장착·용병 카드/성장·재화·인벤토리·카탈로그는 보존했다. 6단계 성휘대천사 지급은 실행하지 않았다.

검증: 관련 4검사 통과, 실제 계정의 USER_LOCK/DB 잠금 아래 실패 주입과 정상 예행연습 전체 원복, 단일 거래 확정, 재실행 SELECT 전용/추가 지급 0. 별도 READ ONLY 연결에서 실제 mercenaryEquipmentState 목록의 신규 5개 인스턴스와 +0·공개/활성 상태를 확인했다. 인벤토리 동기화 증가·잠금 반환 확인.

완료 키: \`${r.operationKey}\`. 동일 요청을 새 키로 재지급하거나 사용 후 수량을 복구하지 않는다. 메시지·게임 재배포·예약·저장공간 유지관리 없음. 기존 체크아웃/의존성 재사용, Git 자동정리 OFF.

계획 SHA-256: \`${r.planHash}\`.
실행 파일 집합 SHA-256: \`${applied.sourceSha256}\`.
상세: operations/${folder}/completion.json, independent.json, evidence/.
`;
await fs.writeFile(new URL('./completion.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
await fs.writeFile(new URL('./README.md',import.meta.url),text,{flag:'wx'});
const qa=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(qa,{recursive:true});await fs.writeFile(new URL('README.md',qa),text,{flag:'wx'});
console.log(JSON.stringify({status:result.status,completedAtKst,auditId:r.auditId,userId:'65',totalQuantity:5}));
