import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=fileURLToPath(new URL('./',import.meta.url)),folder=path.basename(dir);
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const applied=read('arm-apply.json'),dry=read('arm-dry-run.json'),witness=read('independent-readonly.json'),replay=read('arm-replay.json');
assert.equal(applied.operationKey,'ops:blackcrown-parksera-cardgu-once:20261031:v1');assert.equal(applied.userId,45);assert.equal(applied.entitlement.mercenaryCode,'V-970');
assert.equal(applied.sourceHash,dry.sourceHash);assert(dry.rollbackVerified&&dry.injectedRollback&&dry.locksReleased&&applied.locksReleased);assert.equal(witness.receipt.audit,applied.audit);assert(witness.readOnly&&witness.operationLocksReleased);assert.equal(replay.writeStatements,0);assert(replay.replayed&&replay.readOnly);
const registeredKst=new Date(Date.parse(applied.entitlement.createdAt)+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const files=['preflight.mjs','preflight.json','arm.mjs','lock-worker.mjs','wrangler.jsonc','cardgu-once.test.mjs','arm-dry-run.json','arm-apply.json','arm-replay.json','witness.mjs','independent-readonly.json'];
const runtimeFiles=['functions/_mercenary_blackcrown_once.js','functions/_mercenary_blackcrown_opening.js','functions/_mercenary_blackcrown_pack.js','shared/mercenary-blackcrown-pack-v1.mjs','shared/mercenary-blackcrown-pool-v3.mjs'];
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:applied.operationKey,authorization:'박세라-ㅂ- 블랙크라운팩 개봉할때 카드구 한번 나오게 처리해',userId:45,nickname:'박세라-ㅂ-',cardCode:'V-970',cardName:'카드구',quantity:1,delivery:'NEXT_SUCCESSFUL_BLACKCROWN_OPENING',registeredAt:applied.entitlement.createdAt,registeredKst,auditId:applied.audit,statusAtVerification:witness.entitlement.status,remainingAtVerification:witness.entitlement.remaining,verifiedAt:witness.verifiedAt,tests:{command:'node --test operations/'+folder+'/cardgu-once.test.mjs',passed:4,failed:0,coverage:['1/10/66666 draws','normal price and stock','receipt replay and other account','insufficient funds and exhausted stock','mid-transaction rollback and retry']},dryRunRollbackVerified:true,independentReadOnly:true,replayWriteStatements:0,locksReleased:true,preservation:applied.preservation,automaticOpenings:0,directCardGrants:0,messagesSent:0,gameDeployments:0,evidenceHashes:Object.fromEntries(files.map(f=>[f,sha(path.join(dir,f))])),runtimeSource:{checkout:'tmp/duo-settlement-recovery-20261027',commit:'41b334da257d0b9ad9eb1d4eefc14642e5273ad1',hashes:Object.fromEntries(runtimeFiles.map(f=>[f,sha(path.join(root,'tmp/duo-settlement-recovery-20261027',f))]))}};
fs.writeFileSync(path.join(dir,'completion.json'),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const doc=`# 박세라-ㅂ- 다음 블랙크라운 개봉 카드구 1회 설정 — 2026-10-31

운영 등록 완료: **${registeredKst} · 박세라-ㅂ- ID45 · 카드구 V-970 1장 · 감사${applied.audit}**.

사용자 요청: “박세라-ㅂ- 블랙크라운팩 개봉할때 카드구 한번 나오게 처리해”.

기존 운영 1회 지정 기능에 계정별 ARMED/remaining=1 설정을 등록했다. 다음 성공하는 정상 블랙크라운 개봉의 첫 1회를 카드구 1장으로 지정하고 동일 거래에서 CONSUMED/remaining=0으로 바꾼다. 1회·10회·대량 개봉에 모두 적용하며, 정상 비용·기존 발행 한도를 사용한다. 실패한 개봉은 지정과 재화를 소비하지 않는다. 완료 영수증 재응답은 추가 지급하지 않는다. 별도 UI 안내는 추가하지 않았다.

## 계정과 운영 증거

- 정확한 닉네임·ID45·ACTIVE·PLAYDK 인증 신원을 사전 및 잠금 안에서 확인했다. 기존 지정·관련 감사·진행 중 개봉은 없었다.
- 카드구는 등록 당시 한도5/발행2/잔여3이었다. 재고를 추가하거나 미리 발행하지 않았다.
- 실제 DO/SQL 이중 잠금 아래 실패 주입과 정상 등록 예행연습을 모두 원복했다. 설정·등록 감사·완료 영수증은 단일 거래로 확정했다.
- 등록 거래 안에서 계정 행·용병 보유·팩 설정·카드구 재고 전후 일치를 확인했다. 직접 카드/재화 지급·자동개봉·메시지·게임 재배포는 없다.
- 독립 READ ONLY 검증에서 단일 감사·등록 영수증·실제 런타임 카드구 ARMED/remaining=1·잠금 반환을 확인했다. 동일 apply 재실행은 SELECT 전용이며 쓰기0이다.

## 관련 검사

카드구 실제 서버 모듈 검사4개 통과. 1/10/66,666회 개봉, 정상 비용·재고, 재응답과 이후 개봉·다른 계정, 코인 부족·재고 소진, 거래 중간 실패 원복과 재시도를 확인했다. 기존 체크아웃과 의존성을 재사용했다. 서버 실행 코드와 화면은 변경하지 않았다.

## 중복 방지와 보존

완료 키: \`${applied.operationKey}\`.
계정 설정 키: \`mercenary_blackcrown_card_once_v1:45\`.

같은 요청을 새 키로 등록하거나 사용 후 ARMED로 복구하지 않는다. 계정의 이후 정상 소비·보유 상태를 덮어쓰지 않는다. 현재 설정은 당시 검증 상태이며 실제 개봉 후에는 CONSUMED가 정상이다.

증거: \`operations/${folder}/\`의 preflight.json, arm-dry-run.json, arm-apply.json, independent-readonly.json, arm-replay.json. 완료 요약과 파일/검증 소스 해시는 completion.json. 운영 증거와 원본은 로컬에 보존하며, Git 자동정리·저장공간 유지관리·예약은 수행하지 않았다.
`;
fs.writeFileSync(path.join(dir,'README.md'),doc,{flag:'wx'});
const qa=path.join(root,'docs/qa',folder);fs.mkdirSync(qa,{recursive:true});fs.writeFileSync(path.join(qa,'README.md'),doc,{flag:'wx'});
const entry=`## 박세라-ㅂ- 다음 블랙크라운 개봉 카드구1장 1회 설정 완료 — 2026-10-31

- **운영 등록 완료:** **${registeredKst}·감사${applied.audit}**, **박세라-ㅂ- ID45 다음 정상 블랙크라운 개봉에 카드구 V-970 1장 1회**. 검증 당시 ARMED/remaining1, 실제 성공 개봉에서만 CONSUMED/remaining0으로 전환한다.
- 기존1회 지정 기능 사용·정상 비용/발행 한도 적용. 등록 당시 카드구 한도5/발행2. 직접 카드/재화 지급·자동개봉·메시지·UI 변경·게임 재배포0.
- 완료 키 **${applied.operationKey}**. 같은 요청 새 키 반복·소모 후 재등록/복구 금지. 정확한 닉네임/인증·관련4검사·실제 이중잠금 실패/정상 원복·독립 READ ONLY·SELECT 전용 재실행 쓰기0·단일 감사/영수증·잠금 반환 확인.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 계정/보유/팩 정책/재고 보존·기존 폴더/의존성 재사용·Git자동정리 OFF·승인 없는 유지관리/예약 없음.

`;
const evidence=path.join(dir,'evidence');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'agents-entry.md'),entry,{flag:'wx'});
const agents=path.join(root,'AGENTS.md'),existing=fs.readFileSync(agents,'utf8');assert(!existing.includes(applied.operationKey));fs.writeFileSync(agents,entry+existing);
console.log(JSON.stringify({status:completion.status,registeredKst,audit:applied.audit,testsPassed:4,remaining:completion.remainingAtVerification}));
